import "server-only";
import YahooFinance from "yahoo-finance2";
import { getDb } from "./db";
import { GOLD_KINDS, GOLD_SYMBOL, goldKind, instrumentId, isDelayedType, type AssetType } from "./assets";
import { politeFetch } from "./http";
import {
  parseFundPrices,
  parseGenelparaEntry,
  parseIstanbulDateTime,
  parseLooseJson,
  parseTruncgilEntry,
  type FundPrices,
  type GoldPrice,
} from "./sourceParse";

// Sunucu tarafı fiyat servisi.
// - Hisse / döviz / gram altın: Yahoo Finance (yahoo-finance2). BIST ~15 dk gecikmeli.
// - Kripto: Binance herkese açık REST API
// - Yatırım fonları: TEFAS (günde bir fiyat; 0 gelen fiyatlar geçersiz sayılır)
// - Çeyrek / yarım / tam / cumhuriyet / ata altın, 22 ayar bilezik: Truncgil
//   (yedek: Genelpara; ikisi de yoksa gram altından "yaklaşık" hesap)
// Sonuçlar bellekte tutulur (Yahoo/Binance ~30 sn, altın 2 dk, fon 30 dk). Kaynak
// hata verirse son bilinen fiyat (bellek ya da SQLite'taki price_cache) "stale"
// işaretiyle ve son güncelleme zamanıyla döner. Sıfır / geçersiz fiyat asla kullanılmaz.

export const CACHE_TTL_MS = 30_000;
const GOLD_TTL_MS = 2 * 60_000;
const FUND_TTL_MS = 30 * 60_000;
const FETCH_TIMEOUT_MS = 8_000;
const TROY_OUNCE_GRAMS = 31.1035;

export interface Quote {
  /** Enstrüman kimliği, örn. "bist:THYAO" */
  id: string;
  price: number | null;
  currency: string;
  changePct: number | null;
  /** Önceki kapanış ("bugün" değişimi bununla hesaplanır) */
  prevClose: number | null;
  /** Kaynağın bildirdiği piyasa zamanı (ms) */
  sourceTime: number | null;
  /** Bu fiyatın başarıyla alındığı zaman (ms) */
  fetchedAt: number | null;
  /** true: güncel veri alınamadı, son bilinen fiyat gösteriliyor */
  stale: boolean;
  /** Fiyat kaynağı: Yahoo, Binance, TEFAS, Truncgil, Genelpara, Hesaplanan */
  source: string;
  /** true: ücretsiz kaynakta ~15 dk gecikmeli (BIST) */
  delayed: boolean;
  /** true: fiyat günde bir kez açıklanır (fon); saat yerine tarih gösterilir */
  daily: boolean;
  /** Altın: kuyumcunun alış fiyatı (sizin satarken alacağınız). price = satış fiyatı. */
  bid?: number | null;
  /** true: kaynak yok, gram altından yaklaşık hesaplandı */
  approx?: boolean;
  /** Kaynaktan gelen ad (örn. fon unvanı) */
  name?: string | null;
  error?: string;
}

interface RawExtra {
  bid?: number | null;
  name?: string | null;
  source?: string;
}

interface RawQuote {
  price: number;
  currency: string;
  changePct: number | null;
  sourceTime: number | null;
  prevClose?: number | null;
  extra?: RawExtra;
}

interface CacheEntry {
  quote: RawQuote;
  fetchedAt: number;
}

interface ServiceState {
  mem: Map<string, CacheEntry>;
  inflight: Map<string, Promise<void>>;
  yf: InstanceType<typeof YahooFinance>;
}

const g = globalThis as unknown as { __yatirimPrices?: ServiceState };
function state(): ServiceState {
  if (!g.__yatirimPrices) {
    g.__yatirimPrices = {
      mem: new Map(),
      inflight: new Map(),
      yf: new YahooFinance({ suppressNotices: ["yahooSurvey"] }),
    };
  }
  return g.__yatirimPrices;
}

/** Paylaşılan yahoo-finance2 örneği (grafik ve arama için). */
export function yahooClient() {
  return state().yf;
}

// ---- Kaynak anahtarları -------------------------------------------------

type SourceKey = `yahoo:${string}` | `binance:${string}` | `tefas:${string}` | `gold:${string}`;

function ttlFor(key: string): number {
  if (key.startsWith("tefas:")) return FUND_TTL_MS;
  if (key.startsWith("gold:")) return GOLD_TTL_MS;
  return CACHE_TTL_MS;
}

export function yahooSymbolFor(type: AssetType, symbol: string): string | null {
  switch (type) {
    case "bist":
      return `${symbol}.IS`;
    case "foreign":
      return symbol;
    case "fx":
      return `${symbol}TRY=X`;
    default:
      return null;
  }
}

/** Bir enstrümanın fiyatı için gereken ham kaynak anahtarları */
function sourcesFor(type: AssetType, symbol: string): SourceKey[] {
  if (type === "crypto") return [`binance:${symbol}USDT`];
  if (type === "fund") return [`tefas:${symbol}`];
  if (type === "gold") {
    // Sikke/bilezik fiyatı kaynaktan; kaynak hiç yoksa gram altından yaklaşık hesap için ons + kur da gerekir.
    return symbol === GOLD_SYMBOL ? ["yahoo:GC=F", "yahoo:USDTRY=X"] : [`gold:${symbol}`, "yahoo:GC=F", "yahoo:USDTRY=X"];
  }
  const y = yahooSymbolFor(type, symbol);
  return y ? [`yahoo:${y}`] : [];
}

// ---- Ham kaynaklardan çekme --------------------------------------------

function normalizeYahooCurrency(price: number, currency: string | undefined): { price: number; currency: string } {
  const cur = currency ?? "USD";
  // Londra (GBp) ve Johannesburg (ZAc) fiyatları alt birimde gelir.
  if (cur === "GBp") return { price: price / 100, currency: "GBP" };
  if (cur === "ZAc") return { price: price / 100, currency: "ZAR" };
  return { price, currency: cur.toUpperCase() };
}

async function fetchYahoo(symbols: string[]): Promise<Map<string, RawQuote>> {
  const out = new Map<string, RawQuote>();
  if (symbols.length === 0) return out;
  const { yf } = state();
  const results = await yf.quote(symbols, { return: "array" }, { validateResult: false });
  for (const q of results) {
    const p = q.regularMarketPrice;
    if (typeof p !== "number" || !Number.isFinite(p) || p <= 0) continue;
    const norm = normalizeYahooCurrency(p, q.currency);
    const t = q.regularMarketTime as unknown;
    const pc = q.regularMarketPreviousClose;
    const prev = typeof pc === "number" && Number.isFinite(pc) && pc > 0 ? normalizeYahooCurrency(pc, q.currency).price : null;
    out.set(q.symbol, {
      price: norm.price,
      currency: norm.currency,
      changePct: typeof q.regularMarketChangePercent === "number" ? q.regularMarketChangePercent : null,
      sourceTime: t instanceof Date ? t.getTime() : typeof t === "number" ? t * 1000 : null,
      prevClose: prev,
    });
  }
  return out;
}

interface BinanceTicker {
  symbol: string;
  lastPrice: string;
  priceChangePercent: string;
  closeTime: number;
}

async function fetchBinanceUrl(url: string): Promise<BinanceTicker[]> {
  const res = await fetch(url, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS), cache: "no-store" });
  if (!res.ok) throw new Error(`Binance HTTP ${res.status}`);
  const data = (await res.json()) as BinanceTicker | BinanceTicker[];
  return Array.isArray(data) ? data : [data];
}

async function fetchBinance(symbols: string[]): Promise<Map<string, RawQuote>> {
  const out = new Map<string, RawQuote>();
  if (symbols.length === 0) return out;
  const base = "https://api.binance.com/api/v3/ticker/24hr";
  let tickers: BinanceTicker[] = [];
  try {
    tickers = await fetchBinanceUrl(`${base}?symbols=${encodeURIComponent(JSON.stringify(symbols))}`);
  } catch {
    // Geçersiz tek bir sembol tüm toplu isteği bozar; tek tek dene.
    const settled = await Promise.allSettled(symbols.map((s) => fetchBinanceUrl(`${base}?symbol=${s}`)));
    for (const r of settled) if (r.status === "fulfilled") tickers.push(...r.value);
    if (tickers.length === 0) throw new Error("Binance yanıt vermedi");
  }
  for (const t of tickers) {
    const price = Number(t.lastPrice);
    if (!Number.isFinite(price) || price <= 0) continue;
    const change = Number(t.priceChangePercent);
    out.set(t.symbol, {
      price,
      currency: "USD",
      changePct: Number.isFinite(change) ? change : null,
      sourceTime: t.closeTime ?? null,
    });
  }
  return out;
}

// ---- TEFAS (yatırım fonları) ----------------------------------------------------

const TEFAS_URL = "https://www.tefas.gov.tr/api/funds/fonFiyatBilgiGetir";

/**
 * TEFAS'tan bir fonun son `months` aylık fiyatları (periyod; 1, 3, 12, 36, 60).
 * 0 fiyatlar atlanır. Ağ / kaynak hatasında fırlatır (geri çekilme http.ts'de).
 */
export async function fetchFundPrices(code: string, months: number): Promise<FundPrices> {
  const text = await politeFetch("TEFAS", TEFAS_URL, {
    json: { fonKodu: code, dil: "TR", periyod: months },
    timeoutMs: 20_000,
    backoffBaseMs: 60_000,
  });
  let data: { resultList?: unknown };
  try {
    data = JSON.parse(text) as { resultList?: unknown };
  } catch {
    throw new Error("TEFAS yanıtı okunamadı");
  }
  const parsed = parseFundPrices(code, data.resultList);
  if (parsed.last) rememberFund(parsed);
  return parsed;
}

/** Doğrulanmış fonu (kod, ad, son fiyat) funds tablosuna yazar. */
function rememberFund(f: FundPrices) {
  try {
    getDb()
      .prepare(
        `INSERT INTO funds (code, name, last_price, last_date, updated_at) VALUES (?, ?, ?, ?, datetime('now'))
         ON CONFLICT(code) DO UPDATE SET name = COALESCE(excluded.name, funds.name), last_price = excluded.last_price,
           last_date = excluded.last_date, updated_at = excluded.updated_at`,
      )
      .run(f.code, f.name, f.last!.price, f.last!.date);
  } catch (err) {
    console.error("[fon] kaydedilemedi", err);
  }
}

/** Fon fiyatı tarihi (İstanbul gece yarısı) → ms */
export function fundDateMs(date: string): number {
  return Date.parse(`${date}T00:00:00+03:00`);
}

async function fetchFunds(codes: string[]): Promise<Map<string, RawQuote>> {
  const out = new Map<string, RawQuote>();
  const miss = (gg.__yatirimFundMiss ??= new Map());
  // Kibar olmak için sırayla (genelde birkaç fon vardır).
  for (const code of codes) {
    // Geçerli fiyatı olmayan (yanlış kod ya da hep 0 dönen) fon 30 dk yeniden sorulmaz.
    if (Date.now() - (miss.get(code) ?? 0) < FUND_TTL_MS) continue;
    const f = await fetchFundPrices(code, 1);
    if (!f.last) {
      miss.set(code, Date.now());
      continue; // geçerli fiyat yok: önbellekteki son geçerli fiyat kalır
    }
    miss.delete(code);
    const prev = f.prev?.price ?? null;
    out.set(code, {
      price: f.last.price,
      currency: "TRY",
      changePct: prev ? ((f.last.price - prev) / prev) * 100 : null,
      sourceTime: fundDateMs(f.last.date),
      prevClose: prev,
      extra: { name: f.name },
    });
  }
  return out;
}

// ---- Altın türleri (Truncgil, yedek Genelpara) ---------------------------------------

const TRUNCGIL_URL = "https://finans.truncgil.com/v4/today.json";
const GENELPARA_URL = "https://api.genelpara.com/json/?list=altin";

const gg = globalThis as unknown as { __yatirimGenelparaAt?: number; __yatirimFundMiss?: Map<string, number> };

function toRaw(p: GoldPrice, sourceTime: number | null, source: string): RawQuote {
  return {
    price: p.selling,
    currency: "TRY",
    changePct: p.changePct,
    sourceTime,
    prevClose: prevFrom(p.selling, p.changePct),
    extra: { bid: p.buying, source },
  };
}

/** Tüm sikke/bilezik fiyatlarını tek istekte alır (eksik kalırsa yedek kaynağa geçer). */
async function fetchGoldKinds(symbols: string[]): Promise<Map<string, RawQuote>> {
  const out = new Map<string, RawQuote>();
  if (symbols.length === 0) return out;
  const kinds = GOLD_KINDS.filter((k) => k.truncgil);
  let firstError: unknown = null;
  try {
    const data = parseLooseJson(await politeFetch("Truncgil", TRUNCGIL_URL, { backoffBaseMs: 60_000 }));
    const t = parseIstanbulDateTime(data.Update_Date) ?? Date.now();
    for (const k of kinds) {
      const p = parseTruncgilEntry(data[k.truncgil!]);
      if (p) out.set(k.symbol, toRaw(p, t, "Truncgil"));
    }
  } catch (err) {
    firstError = err;
  }
  const missingKinds = symbols.filter((s) => !out.has(s));
  // Yedek kaynak (günlük kotalı): en fazla 10 dakikada bir.
  if (missingKinds.length > 0 && Date.now() - (gg.__yatirimGenelparaAt ?? 0) > 10 * 60_000) {
    gg.__yatirimGenelparaAt = Date.now();
    try {
      const data = JSON.parse(await politeFetch("Genelpara", GENELPARA_URL, { backoffBaseMs: 10 * 60_000 })) as { data?: Record<string, unknown> };
      for (const k of kinds) {
        if (out.has(k.symbol) || !k.genelpara) continue;
        const p = parseGenelparaEntry(data.data?.[k.genelpara]);
        if (p) out.set(k.symbol, toRaw(p, Date.now(), "Genelpara"));
      }
    } catch (err) {
      firstError ??= err;
    }
  }
  if (out.size === 0 && firstError) throw firstError;
  return out;
}

// ---- Önbellek -------------------------------------------------------------

function persist(key: string, e: CacheEntry) {
  try {
    getDb()
      .prepare(
        `INSERT INTO price_cache (key, price, currency, change_pct, source_time, fetched_at, prev_close, extra)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(key) DO UPDATE SET price=excluded.price, currency=excluded.currency,
           change_pct=excluded.change_pct, source_time=excluded.source_time, fetched_at=excluded.fetched_at,
           prev_close=excluded.prev_close, extra=excluded.extra`,
      )
      .run(
        key,
        e.quote.price,
        e.quote.currency,
        e.quote.changePct,
        e.quote.sourceTime,
        e.fetchedAt,
        e.quote.prevClose ?? null,
        e.quote.extra ? JSON.stringify(e.quote.extra) : null,
      );
  } catch (err) {
    console.error("[prices] önbellek yazılamadı", err);
  }
}

function loadPersisted(key: string): CacheEntry | undefined {
  try {
    const row = getDb().prepare("SELECT * FROM price_cache WHERE key = ?").get(key) as
      | {
          price: number;
          currency: string;
          change_pct: number | null;
          source_time: number | null;
          fetched_at: number;
          prev_close: number | null;
          extra: string | null;
        }
      | undefined;
    // Geçersiz (0 / eksi) fiyat asla kullanılmaz.
    if (!row || !(row.price > 0)) return undefined;
    let extra: RawExtra | undefined;
    try {
      extra = row.extra ? (JSON.parse(row.extra) as RawExtra) : undefined;
    } catch {
      extra = undefined;
    }
    return {
      quote: { price: row.price, currency: row.currency, changePct: row.change_pct, sourceTime: row.source_time, prevClose: row.prev_close, extra },
      fetchedAt: row.fetched_at,
    };
  } catch {
    return undefined;
  }
}

/** Taze olmayan kaynakları tek seferde çekip önbelleğe yazar. Hata fırlatmaz. */
async function refresh(keys: SourceKey[], force: boolean) {
  const s = state();
  const now = Date.now();
  const waitFor: Promise<void>[] = [];
  const due: SourceKey[] = [];
  for (const k of keys) {
    const pending = s.inflight.get(k);
    if (pending) {
      waitFor.push(pending);
      continue;
    }
    const e = s.mem.get(k) ?? loadPersisted(k);
    if (e && !s.mem.has(k)) s.mem.set(k, e);
    // Fon ve altın kaynaklarında "zorla yenile" de en az 1 dk bekler (kibar olmak için).
    const minAge = k.startsWith("tefas:") || k.startsWith("gold:") ? 60_000 : 0;
    if (!e || now - e.fetchedAt >= ttlFor(k) || (force && now - e.fetchedAt >= minAge)) due.push(k);
  }

  if (due.length > 0) {
    const yahoo = due.filter((k) => k.startsWith("yahoo:")).map((k) => k.slice(6));
    const binance = due.filter((k) => k.startsWith("binance:")).map((k) => k.slice(8));
    const funds = due.filter((k) => k.startsWith("tefas:")).map((k) => k.slice(6));
    const golds = due.filter((k) => k.startsWith("gold:")).map((k) => k.slice(5));

    const job = (async () => {
      const [y, b, f, au] = await Promise.allSettled([fetchYahoo(yahoo), fetchBinance(binance), fetchFunds(funds), fetchGoldKinds(golds)]);
      const fetchedAt = Date.now();
      const store = (prefix: string, r: PromiseSettledResult<Map<string, RawQuote>>, label: string) => {
        if (r.status === "rejected") {
          console.warn(`[prices] ${label} hatası:`, (r.reason as Error)?.message ?? r.reason);
          return;
        }
        for (const [sym, quote] of r.value) {
          const entry = { quote, fetchedAt };
          s.mem.set(`${prefix}${sym}`, entry);
          persist(`${prefix}${sym}`, entry);
        }
      };
      store("yahoo:", y, "Yahoo");
      store("binance:", b, "Binance");
      store("tefas:", f, "TEFAS");
      store("gold:", au, "Altın");
    })().finally(() => {
      for (const k of due) s.inflight.delete(k);
    });
    for (const k of due) s.inflight.set(k, job);
    waitFor.push(job);
  }
  await Promise.all(waitFor);
}

function readSource(key: SourceKey): { entry?: CacheEntry; fresh: boolean } {
  const s = state();
  let entry = s.mem.get(key);
  if (!entry) {
    entry = loadPersisted(key);
    if (entry) s.mem.set(key, entry);
  }
  // Son başarılı çekim 2 TTL'den eskiyse kaynak şu an başarısız demektir.
  const fresh = !!entry && Date.now() - entry.fetchedAt < ttlFor(key) * 2;
  return { entry, fresh };
}

// ---- Dış API --------------------------------------------------------------

export interface InstrumentRef {
  type: AssetType;
  symbol: string;
}

/** Enstrümanların fiyatlarını döndürür (mümkünse önbellekten). Hata fırlatmaz. */
export async function getQuotes(instruments: InstrumentRef[], opts: { force?: boolean } = {}): Promise<Quote[]> {
  const keys = new Set<SourceKey>();
  for (const i of instruments) for (const k of sourcesFor(i.type, i.symbol)) keys.add(k);
  await refresh([...keys], !!opts.force);
  return instruments.map((i) => buildQuote(i));
}

function missing(id: string, currency: string, type: AssetType): Quote {
  return {
    id,
    price: null,
    currency,
    changePct: null,
    prevClose: null,
    sourceTime: null,
    fetchedAt: null,
    stale: true,
    source: "",
    delayed: isDelayedType(type),
    daily: type === "fund",
    error: "Fiyat alınamadı",
  };
}

/** Önceki kapanış: kaynak verdiyse o, yoksa günlük değişim yüzdesinden */
function prevFrom(price: number, changePct: number | null, given?: number | null): number | null {
  if (given != null && given > 0) return given;
  if (changePct == null || !Number.isFinite(changePct) || changePct <= -100) return null;
  const p = price / (1 + changePct / 100);
  return Number.isFinite(p) && p > 0 ? p : null;
}

function sourceLabel(key: string): string {
  if (key.startsWith("binance:")) return "Binance";
  if (key.startsWith("tefas:")) return "TEFAS";
  return "Yahoo";
}

function buildQuote({ type, symbol }: InstrumentRef): Quote {
  const id = instrumentId(type, symbol);

  if (type === "gold") {
    const gram = gramGoldQuote(id);
    if (symbol === GOLD_SYMBOL) return gram ?? missing(id, "TRY", type);
    const kind = goldKind(symbol);
    if (!kind) return missing(id, "TRY", type);
    const { entry, fresh } = readSource(`gold:${symbol}`);
    if (entry) {
      const q = entry.quote;
      return {
        id,
        price: q.price,
        currency: "TRY",
        changePct: q.changePct,
        prevClose: prevFrom(q.price, q.changePct, q.prevClose),
        sourceTime: q.sourceTime,
        fetchedAt: entry.fetchedAt,
        stale: !fresh,
        source: q.extra?.source ?? "Truncgil",
        delayed: false,
        daily: false,
        bid: q.extra?.bid ?? null,
      };
    }
    // Hiçbir kaynak yok: gram altın × ağırlık × saflık (yaklaşık; işçilik ve makas dahil değil)
    if (!gram || gram.price == null) return missing(id, "TRY", type);
    const f = kind.grams * kind.purity;
    return {
      ...gram,
      id,
      price: gram.price * f,
      prevClose: gram.prevClose != null ? gram.prevClose * f : null,
      source: "Hesaplanan",
      approx: true,
      bid: null,
    };
  }

  const [key] = sourcesFor(type, symbol);
  const { entry, fresh } = key ? readSource(key) : { entry: undefined, fresh: false };
  if (!entry) return missing(id, type === "fund" ? "TRY" : "", type);
  const q = entry.quote;
  return {
    id,
    price: q.price,
    currency: q.currency,
    changePct: q.changePct,
    prevClose: prevFrom(q.price, q.changePct, q.prevClose),
    sourceTime: q.sourceTime,
    fetchedAt: entry.fetchedAt,
    stale: !fresh,
    source: sourceLabel(key),
    delayed: isDelayedType(type),
    daily: type === "fund",
    ...(q.extra?.name ? { name: q.extra.name } : {}),
  };
}

/** Gram altın = ons altın (USD) × USDTRY / 31,1035 */
function gramGoldQuote(id: string): Quote | null {
  const oz = readSource("yahoo:GC=F");
  const usd = readSource("yahoo:USDTRY=X");
  if (!oz.entry || !usd.entry) return null;
  const price = (oz.entry.quote.price * usd.entry.quote.price) / TROY_OUNCE_GRAMS;
  const a = oz.entry.quote.changePct;
  const b = usd.entry.quote.changePct;
  const changePct = a != null && b != null ? ((1 + a / 100) * (1 + b / 100) - 1) * 100 : null;
  const ozPrev = prevFrom(oz.entry.quote.price, a, oz.entry.quote.prevClose);
  const usdPrev = prevFrom(usd.entry.quote.price, b, usd.entry.quote.prevClose);
  return {
    id,
    price,
    currency: "TRY",
    changePct,
    prevClose: ozPrev != null && usdPrev != null ? (ozPrev * usdPrev) / TROY_OUNCE_GRAMS : prevFrom(price, changePct),
    sourceTime: Math.max(oz.entry.quote.sourceTime ?? 0, usd.entry.quote.sourceTime ?? 0) || null,
    fetchedAt: Math.min(oz.entry.fetchedAt, usd.entry.fetchedAt),
    stale: !(oz.fresh && usd.fresh),
    source: "Hesaplanan",
    delayed: false,
    daily: false,
  };
}

/** Ana sayfa şeridi için varsayılan izleme listesi */
export const DEFAULT_WATCHLIST: InstrumentRef[] = [
  { type: "fx", symbol: "USD" },
  { type: "fx", symbol: "EUR" },
  { type: "gold", symbol: GOLD_SYMBOL },
  { type: "crypto", symbol: "BTC" },
];
