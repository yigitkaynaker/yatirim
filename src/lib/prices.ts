import "server-only";
import YahooFinance from "yahoo-finance2";
import { getDb } from "./db";
import { GOLD_SYMBOL, instrumentId, type AssetType } from "./assets";

// Sunucu tarafı fiyat servisi.
// - Hisse / döviz / altın: Yahoo Finance (yahoo-finance2)
// - Kripto: Binance herkese açık REST API
// Sonuçlar ~30 sn bellekte tutulur. Kaynak hata verirse son bilinen fiyat
// (bellek ya da SQLite'taki price_cache) "stale" işaretiyle döner.

export const CACHE_TTL_MS = 30_000;
const FETCH_TIMEOUT_MS = 8_000;
const TROY_OUNCE_GRAMS = 31.1035;

export interface Quote {
  /** Enstrüman kimliği, örn. "bist:THYAO" */
  id: string;
  price: number | null;
  currency: string;
  changePct: number | null;
  /** Kaynağın bildirdiği piyasa zamanı (ms) */
  sourceTime: number | null;
  /** Bu fiyatın başarıyla alındığı zaman (ms) */
  fetchedAt: number | null;
  /** true: güncel veri alınamadı, son bilinen fiyat gösteriliyor */
  stale: boolean;
  error?: string;
}

interface RawQuote {
  price: number;
  currency: string;
  changePct: number | null;
  sourceTime: number | null;
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

type SourceKey = `yahoo:${string}` | `binance:${string}`;

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
  if (type === "gold") return ["yahoo:GC=F", "yahoo:USDTRY=X"];
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
    if (typeof p !== "number" || !Number.isFinite(p)) continue;
    const norm = normalizeYahooCurrency(p, q.currency);
    const t = q.regularMarketTime as unknown;
    out.set(q.symbol, {
      price: norm.price,
      currency: norm.currency,
      changePct: typeof q.regularMarketChangePercent === "number" ? q.regularMarketChangePercent : null,
      sourceTime: t instanceof Date ? t.getTime() : typeof t === "number" ? t * 1000 : null,
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
    if (!Number.isFinite(price)) continue;
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

// ---- Önbellek -------------------------------------------------------------

function persist(key: string, e: CacheEntry) {
  try {
    getDb()
      .prepare(
        `INSERT INTO price_cache (key, price, currency, change_pct, source_time, fetched_at)
         VALUES (?, ?, ?, ?, ?, ?)
         ON CONFLICT(key) DO UPDATE SET price=excluded.price, currency=excluded.currency,
           change_pct=excluded.change_pct, source_time=excluded.source_time, fetched_at=excluded.fetched_at`,
      )
      .run(key, e.quote.price, e.quote.currency, e.quote.changePct, e.quote.sourceTime, e.fetchedAt);
  } catch (err) {
    console.error("[prices] önbellek yazılamadı", err);
  }
}

function loadPersisted(key: string): CacheEntry | undefined {
  try {
    const row = getDb().prepare("SELECT * FROM price_cache WHERE key = ?").get(key) as
      | { price: number; currency: string; change_pct: number | null; source_time: number | null; fetched_at: number }
      | undefined;
    if (!row) return undefined;
    return {
      quote: { price: row.price, currency: row.currency, changePct: row.change_pct, sourceTime: row.source_time },
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
    const e = s.mem.get(k);
    if (force || !e || now - e.fetchedAt >= CACHE_TTL_MS) due.push(k);
  }

  if (due.length > 0) {
    const yahoo = due.filter((k) => k.startsWith("yahoo:")).map((k) => k.slice(6));
    const binance = due.filter((k) => k.startsWith("binance:")).map((k) => k.slice(8));

    const job = (async () => {
      const [y, b] = await Promise.allSettled([fetchYahoo(yahoo), fetchBinance(binance)]);
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
  const fresh = !!entry && Date.now() - entry.fetchedAt < CACHE_TTL_MS * 2;
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

function missing(id: string, currency: string): Quote {
  return { id, price: null, currency, changePct: null, sourceTime: null, fetchedAt: null, stale: true, error: "Fiyat alınamadı" };
}

function buildQuote({ type, symbol }: InstrumentRef): Quote {
  const id = instrumentId(type, symbol);

  if (type === "gold") {
    // Gram altın = ons altın (USD) × USDTRY / 31,1035
    const oz = readSource("yahoo:GC=F");
    const usd = readSource("yahoo:USDTRY=X");
    if (symbol !== GOLD_SYMBOL || !oz.entry || !usd.entry) return missing(id, "TRY");
    const price = (oz.entry.quote.price * usd.entry.quote.price) / TROY_OUNCE_GRAMS;
    const a = oz.entry.quote.changePct;
    const b = usd.entry.quote.changePct;
    const changePct = a != null && b != null ? ((1 + a / 100) * (1 + b / 100) - 1) * 100 : null;
    return {
      id,
      price,
      currency: "TRY",
      changePct,
      sourceTime: Math.max(oz.entry.quote.sourceTime ?? 0, usd.entry.quote.sourceTime ?? 0) || null,
      fetchedAt: Math.min(oz.entry.fetchedAt, usd.entry.fetchedAt),
      stale: !(oz.fresh && usd.fresh),
    };
  }

  const [key] = sourcesFor(type, symbol);
  const { entry, fresh } = key ? readSource(key) : { entry: undefined, fresh: false };
  if (!entry) return missing(id, "");
  return {
    id,
    price: entry.quote.price,
    currency: entry.quote.currency,
    changePct: entry.quote.changePct,
    sourceTime: entry.quote.sourceTime,
    fetchedAt: entry.fetchedAt,
    stale: !fresh,
  };
}

/** Ana sayfa şeridi için varsayılan izleme listesi */
export const DEFAULT_WATCHLIST: InstrumentRef[] = [
  { type: "fx", symbol: "USD" },
  { type: "fx", symbol: "EUR" },
  { type: "gold", symbol: GOLD_SYMBOL },
  { type: "crypto", symbol: "BTC" },
];
