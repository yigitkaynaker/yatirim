import "server-only";
import YahooFinance from "yahoo-finance2";
import { getDb, sqlNow } from "./db";
import { cryptoCurrency, GOLD_KINDS, GOLD_SYMBOL, goldKind, instrumentId, isDelayedType, parseCryptoSymbol, type AssetType } from "./assets";
import { inBackoff, markFailure, markSuccess, politeFetch } from "./http";
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
// - Kripto: Binance herkese açık REST API (USDT ve TRY pariteleri; engellenirse data-api.binance.vision
//   aynası; toplu ticker 20'li gruplarla, ağırlık 2) ve BtcTurk (tek toplu /api/v2/ticker isteği)
// - Yatırım fonları: TEFAS (günde bir fiyat; 0 gelen fiyatlar geçersiz sayılır)
// - Çeyrek / yarım / tam / cumhuriyet / ata altın, 22 ayar bilezik: Truncgil
//   (yedek: Genelpara; ikisi de yoksa gram altından "yaklaşık" hesap)
// Sonuçlar bellekte tutulur (Yahoo/Binance ~30 sn, altın 2 dk, fon 30 dk). Kaynak
// hata verirse son bilinen fiyat (bellek ya da SQLite'taki price_cache) "stale"
// işaretiyle ve son güncelleme zamanıyla döner. Sıfır / geçersiz fiyat asla kullanılmaz.

export const CACHE_TTL_MS = 30_000;
const GOLD_TTL_MS = 2 * 60_000;
const FUND_TTL_MS = 30 * 60_000;
/** TEFAS'a aynı anda en fazla bu kadar fon fiyatı isteği */
const FUND_CONCURRENCY = 4;
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

type SourceKey = `yahoo:${string}` | `binance:${string}` | `btcturk:${string}` | `tefas:${string}` | `gold:${string}`;

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
  if (type === "crypto") {
    const c = parseCryptoSymbol(symbol);
    if (!c) return [];
    return [c.venue === "BTCTURK" ? `btcturk:${c.base}${c.quote}` : `binance:${c.base}${c.quote}`];
  }
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
  // Yahoo bulut IP'lerine sık sık 429 (çok istek) döner: o zaman bir süre hiç sorma
  // (son bilinen fiyat "bayat" işaretiyle gösterilir).
  if (inBackoff("Yahoo")) throw new Error("Yahoo geçici olarak denenmiyor (çok istek)");
  let results;
  try {
    results = await yf.quote(symbols, { return: "array" }, { validateResult: false });
    markSuccess("Yahoo");
  } catch (err) {
    if (/429|Too Many|rate/i.test(String((err as Error)?.message ?? err))) markFailure("Yahoo", 60_000, 15 * 60_000);
    throw err;
  }
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
  if (!res.ok) throw Object.assign(new Error(`Binance HTTP ${res.status}`), { status: res.status });
  const data = (await res.json()) as BinanceTicker | BinanceTicker[];
  return Array.isArray(data) ? data : [data];
}

// Ana uç nokta bazı bulut / ABD IP'lerine 451 (yasal kısıt) ya da 403 döner; o zaman herkese
// açık piyasa verisi aynası data-api.binance.vision kullanılır (yalnızca spot fiyat verisi).
const BINANCE_BASES = ["https://api.binance.com", "https://data-api.binance.vision"];
const gb = globalThis as unknown as { __yatirimBinanceBase?: number };

async function fetchBinanceFrom(base: string, symbols: string[]): Promise<BinanceTicker[]> {
  const url = `${base}/api/v3/ticker/24hr`;
  try {
    return await fetchBinanceUrl(`${url}?symbols=${encodeURIComponent(JSON.stringify(symbols))}`);
  } catch (err) {
    const status = (err as { status?: number }).status;
    // Erişim engeli: aynı uç noktada tek tek denemenin anlamı yok.
    if (status === 451 || status === 403 || status === 418 || status === 429) throw err;
    // Geçersiz tek bir sembol tüm toplu isteği bozar; tek tek dene.
    const tickers: BinanceTicker[] = [];
    const settled = await Promise.allSettled(symbols.map((s) => fetchBinanceUrl(`${url}?symbol=${s}`)));
    for (const r of settled) if (r.status === "fulfilled") tickers.push(...r.value);
    if (tickers.length === 0) throw err;
    return tickers;
  }
}

/** Toplu ticker isteği en fazla 20 sembol: 1–20 sembol ağırlık 2, 21–100 sembol ağırlık 40 */
const BINANCE_CHUNK = 20;

async function fetchBinance(symbols: string[]): Promise<Map<string, RawQuote>> {
  const out = new Map<string, RawQuote>();
  if (symbols.length === 0) return out;
  const chunks: string[][] = [];
  for (let i = 0; i < symbols.length; i += BINANCE_CHUNK) chunks.push(symbols.slice(i, i + BINANCE_CHUNK));
  const settled = await Promise.allSettled(chunks.map((c) => fetchBinanceChunk(c)));
  let firstErr: unknown = null;
  for (const r of settled) {
    if (r.status === "fulfilled") for (const [k, v] of r.value) out.set(k, v);
    else firstErr ??= r.reason;
  }
  if (out.size === 0 && firstErr) throw firstErr;
  return out;
}

async function fetchBinanceChunk(symbols: string[]): Promise<Map<string, RawQuote>> {
  const out = new Map<string, RawQuote>();
  let tickers: BinanceTicker[] = [];
  const start = gb.__yatirimBinanceBase ?? 0;
  let lastErr: unknown = null;
  for (let i = 0; i < BINANCE_BASES.length; i++) {
    const idx = (start + i) % BINANCE_BASES.length;
    try {
      tickers = await fetchBinanceFrom(BINANCE_BASES[idx], symbols);
      gb.__yatirimBinanceBase = idx;
      lastErr = null;
      break;
    } catch (err) {
      lastErr = err;
    }
  }
  if (lastErr) throw new Error(`Binance yanıt vermedi (${(lastErr as Error).message})`);
  for (const t of tickers) {
    const price = Number(t.lastPrice);
    if (!Number.isFinite(price) || price <= 0) continue;
    const change = Number(t.priceChangePercent);
    out.set(t.symbol, {
      price,
      // TRY paritelerinin fiyatı TL; USDT pariteleri USD sayılır
      currency: t.symbol.endsWith("TRY") ? "TRY" : "USD",
      changePct: Number.isFinite(change) ? change : null,
      sourceTime: t.closeTime ?? null,
    });
  }
  return out;
}

// ---- BtcTurk ---------------------------------------------------------------------

const BTCTURK_TICKER_URL = "https://api.btcturk.com/api/v2/ticker";

interface BtcTurkTicker {
  pair: string;
  last: number;
  dailyPercent: number | null;
  open?: number | null;
  timestamp?: number;
  denominatorSymbol?: string;
}

const gt = globalThis as unknown as { __yatirimBtcTurk?: { at: number; data: BtcTurkTicker[] } | null; __yatirimBtcTurkJob?: Promise<BtcTurkTicker[]> | null };

/** Tüm BtcTurk çiftlerini tek istekte alır (10 sn bellek; eşzamanlı çağrılar aynı isteği bekler). */
async function btcturkTickers(): Promise<BtcTurkTicker[]> {
  const c = gt.__yatirimBtcTurk;
  if (c && Date.now() - c.at < 10_000) return c.data;
  gt.__yatirimBtcTurkJob ??= (async () => {
    const text = await politeFetch("BtcTurk", BTCTURK_TICKER_URL, { timeoutMs: FETCH_TIMEOUT_MS, backoffBaseMs: 30_000 });
    const data = (JSON.parse(text) as { data?: BtcTurkTicker[] }).data ?? [];
    gt.__yatirimBtcTurk = { at: Date.now(), data };
    return data;
  })().finally(() => {
    gt.__yatirimBtcTurkJob = null;
  });
  return await gt.__yatirimBtcTurkJob;
}

async function fetchBtcTurk(pairs: string[]): Promise<Map<string, RawQuote>> {
  const out = new Map<string, RawQuote>();
  if (pairs.length === 0) return out;
  const want = new Set(pairs);
  for (const t of await btcturkTickers()) {
    if (!want.has(t.pair)) continue;
    const price = Number(t.last);
    if (!Number.isFinite(price) || price <= 0) continue;
    const change = Number(t.dailyPercent);
    const open = Number(t.open);
    out.set(t.pair, {
      price,
      currency: t.pair.endsWith("TRY") ? "TRY" : "USD",
      changePct: Number.isFinite(change) ? change : null,
      sourceTime: typeof t.timestamp === "number" ? t.timestamp : null,
      // BtcTurk "günlük" değişimi 24 saat önceki açılışa göredir
      prevClose: Number.isFinite(open) && open > 0 ? open : null,
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
  if (parsed.last) await rememberFund(parsed);
  return parsed;
}

/** Doğrulanmış fonu (kod, ad, son fiyat) funds tablosuna yazar. */
async function rememberFund(f: FundPrices) {
  try {
    await (await getDb()).run(`INSERT INTO funds (code, name, last_price, last_date, updated_at) VALUES (?, ?, ?, ?, ?)
         ON CONFLICT(code) DO UPDATE SET name = COALESCE(excluded.name, funds.name), last_price = excluded.last_price,
           last_date = excluded.last_date, updated_at = excluded.updated_at`, [f.code, f.name, f.last!.price, f.last!.date, sqlNow()]);
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
  // Kibar olmak için en fazla FUND_CONCURRENCY istek aynı anda (Fonlar listesinde bir sayfa ~30 fon).
  const queue = [...codes];
  const worker = async () => {
    for (let code = queue.shift(); code !== undefined; code = queue.shift()) {
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
  };
  // Bir istek hata verirse (geri çekilme dahil) kalan fonlar yine de denenir; alınanlar döner.
  const results = await Promise.allSettled(Array.from({ length: Math.min(FUND_CONCURRENCY, codes.length) }, worker));
  if (out.size === 0 && results.some((r) => r.status === "rejected")) throw (results.find((r) => r.status === "rejected") as PromiseRejectedResult).reason;
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

/// ---- Önbellek -------------------------------------------------------------

async function persist(key: string, e: CacheEntry) {
  try {
    await (await getDb()).run(
      `INSERT INTO price_cache (key, price, currency, change_pct, source_time, fetched_at, prev_close, extra)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(key) DO UPDATE SET price=excluded.price, currency=excluded.currency,
         change_pct=excluded.change_pct, source_time=excluded.source_time, fetched_at=excluded.fetched_at,
         prev_close=excluded.prev_close, extra=excluded.extra`,
      [
        key,
        e.quote.price,
        e.quote.currency,
        e.quote.changePct,
        e.quote.sourceTime,
        e.fetchedAt,
        e.quote.prevClose ?? null,
        e.quote.extra ? JSON.stringify(e.quote.extra) : null,
      ],
    );
  } catch (err) {
    console.error("[prices] önbellek yazılamadı", err);
  }
}

interface PriceRow {
  key: string;
  price: number;
  currency: string;
  change_pct: number | null;
  source_time: number | null;
  fetched_at: number;
  prev_close: number | null;
  extra: string | null;
}

/**
 * Anahtarların veritabanındaki son kayıtlarını tek sorguda okur. Bulut modunda birden çok
 * sunucu örneği olabilir; başka bir örneğin yeni çektiği fiyat kullanılsın diye bellekteki
 * kayıt eski olsa bile buradan okunur.
 */
async function loadPersisted(keys: string[]): Promise<Map<string, CacheEntry>> {
  const out = new Map<string, CacheEntry>();
  if (keys.length === 0) return out;
  try {
    const rows = await (await getDb()).all<PriceRow>(
      `SELECT * FROM price_cache WHERE key IN (${keys.map(() => "?").join(", ")})`,
      keys,
    );
    for (const row of rows) {
      // Geçersiz (0 / eksi) fiyat asla kullanılmaz.
      if (!(row.price > 0)) continue;
      let extra: RawExtra | undefined;
      try {
        extra = row.extra ? (JSON.parse(row.extra) as RawExtra) : undefined;
      } catch {
        extra = undefined;
      }
      out.set(row.key, {
        quote: { price: row.price, currency: row.currency, changePct: row.change_pct, sourceTime: row.source_time, prevClose: row.prev_close, extra },
        fetchedAt: row.fetched_at,
      });
    }
  } catch {
    // veritabanı okunamazsa yalnızca bellek / kaynak
  }
  return out;
}

/** Taze olmayan kaynakları tek seferde çekip önbelleğe yazar. Hata fırlatmaz. */
async function refresh(keys: SourceKey[], force: boolean) {
  const s = state();
  const now = Date.now();
  const waitFor: Promise<void>[] = [];
  const isDue = (k: string, e: CacheEntry | undefined) => {
    // Fon ve altın kaynaklarında "zorla yenile" de en az 1 dk bekler (kibar olmak için).
    const minAge = k.startsWith("tefas:") || k.startsWith("gold:") ? 60_000 : 0;
    return !e || now - e.fetchedAt >= ttlFor(k) || (force && now - e.fetchedAt >= minAge);
  };
  // Bellekte olmayan ya da süresi dolmuş anahtarlar için önce veritabanına bak.
  const check = keys.filter((k) => !s.inflight.has(k) && isDue(k, s.mem.get(k)));
  if (check.length > 0) {
    const stored = await loadPersisted(check);
    for (const [k, e] of stored) {
      const m = s.mem.get(k);
      if (!m || e.fetchedAt > m.fetchedAt) s.mem.set(k, e);
    }
  }
  const due: SourceKey[] = [];
  for (const k of keys) {
    const pending = s.inflight.get(k);
    if (pending) {
      waitFor.push(pending);
      continue;
    }
    if (isDue(k, s.mem.get(k))) due.push(k);
  }

  if (due.length > 0) {
    const yahoo = due.filter((k) => k.startsWith("yahoo:")).map((k) => k.slice(6));
    const binance = due.filter((k) => k.startsWith("binance:")).map((k) => k.slice(8));
    const btcturk = due.filter((k) => k.startsWith("btcturk:")).map((k) => k.slice(8));
    const funds = due.filter((k) => k.startsWith("tefas:")).map((k) => k.slice(6));
    const golds = due.filter((k) => k.startsWith("gold:")).map((k) => k.slice(5));

    const job = (async () => {
      const [y, b, bt, f, au] = await Promise.allSettled([fetchYahoo(yahoo), fetchBinance(binance), fetchBtcTurk(btcturk), fetchFunds(funds), fetchGoldKinds(golds)]);
      const fetchedAt = Date.now();
      const writes: Promise<void>[] = [];
      const store = (prefix: string, r: PromiseSettledResult<Map<string, RawQuote>>, label: string) => {
        if (r.status === "rejected") {
          console.warn(`[prices] ${label} hatası:`, (r.reason as Error)?.message ?? r.reason);
          return;
        }
        for (const [sym, quote] of r.value) {
          const entry = { quote, fetchedAt };
          s.mem.set(`${prefix}${sym}`, entry);
          writes.push(persist(`${prefix}${sym}`, entry));
        }
      };
      store("yahoo:", y, "Yahoo");
      store("binance:", b, "Binance");
      store("btcturk:", bt, "BtcTurk");
      store("tefas:", f, "TEFAS");
      store("gold:", au, "Altın");
      await Promise.all(writes);
    })().finally(() => {
      for (const k of due) s.inflight.delete(k);
    });
    for (const k of due) s.inflight.set(k, job);
    waitFor.push(job);
  }
  await Promise.all(waitFor);
}

/** refresh() sonrasında: bellekteki kayıt (refresh veritabanından da yükler) */
function readSource(key: SourceKey): { entry?: CacheEntry; fresh: boolean } {
  const entry = state().mem.get(key);
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
  if (key.startsWith("btcturk:")) return "BtcTurk";
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
  if (!entry) return missing(id, type === "fund" ? "TRY" : type === "crypto" ? cryptoCurrency(symbol) : "", type);
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

/** Günlük açıklanan fiyatın (fon) en fazla kaç gün eski olabileceği (hafta sonu + bir tatil günü) */
export const DAILY_MAX_AGE_DAYS = 4;

/**
 * Fiyat otomatik bir karar (emir gerçekleştirme, alarm) için kullanılabilir mi?
 * Bayat (son bilinen) fiyat kullanılmaz. Günlük fiyatlarda (fon) son başarılı çekim
 * yeni olsa bile kaynağın verdiği fiyat günü birkaç günden eskiyse (TEFAS eski NAV
 * döndürdüyse) fiyat güncel sayılmaz.
 */
export function quoteUsable(q: Pick<Quote, "price" | "stale" | "daily" | "sourceTime">, now = Date.now()): boolean {
  if (q.price == null || !(q.price > 0) || q.stale) return false;
  if (q.daily) {
    if (q.sourceTime == null) return false;
    if (now - q.sourceTime > DAILY_MAX_AGE_DAYS * 86_400_000) return false;
  }
  return true;
}
