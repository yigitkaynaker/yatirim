import "server-only";
import { getDb } from "./db";
import {
  GOLD_KINDS,
  GOLD_SYMBOL,
  goldKind,
  instrumentId,
  isAssetType,
  isValidSymbol,
  normalizeSymbol,
  type AssetType,
} from "./assets";
import { ValidationError } from "./portfolio";
import { fetchFundPrices, fundDateMs, getQuotes, yahooClient, yahooSymbolFor } from "./prices";

// Piyasa sayfası: izleme listesi, sembol arama ve fiyat grafiği verisi.

const FETCH_TIMEOUT_MS = 8_000;
const TROY_OUNCE_GRAMS = 31.1035;

// ---- İzleme listesi ----------------------------------------------------------

export interface WatchItem {
  id: number;
  /** Enstrüman kimliği, örn. "bist:THYAO" */
  instrument: string;
  assetType: AssetType;
  symbol: string;
  name: string | null;
  createdAt: string;
}

interface WatchRow {
  id: number;
  asset_type: AssetType;
  symbol: string;
  name: string | null;
  created_at: string;
}

const fromRow = (r: WatchRow): WatchItem => ({
  id: r.id,
  instrument: instrumentId(r.asset_type, r.symbol),
  assetType: r.asset_type,
  symbol: r.symbol,
  name: r.name,
  createdAt: r.created_at,
});

export async function listWatchlist(): Promise<WatchItem[]> {
  const rows = await (await getDb()).all("SELECT * FROM watchlist ORDER BY id") as unknown as WatchRow[];
  return rows.map(fromRow);
}

function parseRef(assetType: unknown, rawSymbol: unknown): { assetType: AssetType; symbol: string } {
  if (!isAssetType(assetType)) throw new ValidationError("Varlık türü geçersiz.");
  const symbol = normalizeSymbol(assetType, String(rawSymbol ?? ""));
  if (!isValidSymbol(assetType, symbol)) throw new ValidationError("Sembol geçersiz.");
  return { assetType, symbol };
}

/** İzleme listesine ekler; zaten varsa mevcut kaydı döndürür. */
export async function addWatch(assetType: unknown, symbol: unknown, name?: unknown): Promise<WatchItem> {
  const ref = parseRef(assetType, symbol);
  const nm = typeof name === "string" && name.trim() ? name.trim().slice(0, 120) : null;
  const db = await getDb();
  await db.run("INSERT INTO watchlist (asset_type, symbol, name) VALUES (?, ?, ?) ON CONFLICT(asset_type, symbol) DO NOTHING", [ref.assetType, ref.symbol, nm]);
  const row = await db.get("SELECT * FROM watchlist WHERE asset_type = ? AND symbol = ?", [ref.assetType, ref.symbol]) as unknown as WatchRow;
  return fromRow(row);
}

/** İzleme listesinden çıkarır. Bulunamazsa false. */
export async function removeWatch(id: number): Promise<boolean> {
  return (await (await getDb()).run("DELETE FROM watchlist WHERE id = ?", [id])).changes > 0;
}

// ---- Sembol arama ------------------------------------------------------------

export interface SearchResult {
  instrument: string;
  assetType: AssetType;
  symbol: string;
  name: string;
  /** Borsa / kaynak etiketi */
  exchange: string;
}

/** Türkçe anahtar kelimelerle bulunabilen hazır varlıklar */
const BUILTIN: (SearchResult & { keys: string[] })[] = [
  { instrument: "gold:GRAM", assetType: "gold", symbol: GOLD_SYMBOL, name: "Gram Altın", exchange: "Hesaplanan", keys: ["altın", "altin", "gram", "gold"] },
  ...GOLD_KINDS.filter((k) => k.symbol !== GOLD_SYMBOL).map((k) => ({
    instrument: `gold:${k.symbol}`,
    assetType: "gold" as const,
    symbol: k.symbol,
    name: k.label,
    exchange: "Kuyumcu",
    keys: ["altın", "altin", "gold", k.label.toLocaleLowerCase("tr-TR"), k.symbol.toLowerCase(), ...(k.symbol === "BILEZIK22" ? ["bilezik", "22 ayar"] : [])],
  })),
  { instrument: "foreign:GC=F", assetType: "foreign", symbol: "GC=F", name: "Ons Altın (vadeli)", exchange: "COMEX", keys: ["ons", "altın", "altin", "gold"] },
  { instrument: "fx:USD", assetType: "fx", symbol: "USD", name: "Amerikan Doları", exchange: "Döviz", keys: ["dolar", "usd"] },
  { instrument: "fx:EUR", assetType: "fx", symbol: "EUR", name: "Euro", exchange: "Döviz", keys: ["euro", "avro", "eur"] },
  { instrument: "fx:GBP", assetType: "fx", symbol: "GBP", name: "İngiliz Sterlini", exchange: "Döviz", keys: ["sterlin", "pound", "gbp"] },
  { instrument: "bist:XU100", assetType: "bist", symbol: "XU100", name: "BIST 100 Endeksi", exchange: "Borsa İstanbul", keys: ["bist", "xu100", "endeks"] },
];

interface BinanceSymbols {
  at: number;
  bases: string[];
}
const g = globalThis as unknown as { __yatirimBinanceSymbols?: BinanceSymbols };

/** Binance'teki USDT paritelerinin taban sembolleri (günde bir kez yenilenir). */
async function binanceBases(): Promise<string[]> {
  const c = g.__yatirimBinanceSymbols;
  if (c && Date.now() - c.at < 24 * 3600_000) return c.bases;
  try {
    const res = await fetch("https://api.binance.com/api/v3/ticker/price", { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS), cache: "no-store" });
    if (!res.ok) throw new Error(`Binance HTTP ${res.status}`);
    const all = await res.json() as { symbol: string }[];
    const bases = all.filter((t) => t.symbol.endsWith("USDT")).map((t) => t.symbol.slice(0, -4)).filter((b) => /^[A-Z0-9]{2,12}$/.test(b));
    g.__yatirimBinanceSymbols = { at: Date.now(), bases };
    return bases;
  } catch (err) {
    console.warn("[piyasa] Binance sembol listesi alınamadı:", (err as Error).message);
    return c?.bases ?? [];
  }
}

/** Yahoo arama sonucunu uygulamadaki varlık türüne çevirir. */
function mapYahoo(symbol: string, quoteType: string): { assetType: AssetType; symbol: string } | null {
  const s = symbol.toUpperCase();
  if (s.endsWith(".IS")) return { assetType: "bist", symbol: s.slice(0, -3) };
  if (quoteType === "CRYPTOCURRENCY") {
    const base = s.replace(/-USD$/, "");
    return /^[A-Z0-9]{2,12}$/.test(base) ? { assetType: "crypto", symbol: base } : null;
  }
  if (quoteType === "CURRENCY") {
    const m = /^([A-Z]{3})TRY=X$/.exec(s);
    return m ? { assetType: "fx", symbol: m[1] } : null;
  }
  if (["EQUITY", "ETF", "INDEX", "FUTURE", "MUTUALFUND"].includes(quoteType)) return { assetType: "foreign", symbol: s };
  return null;
}

/** Yahoo Finance araması + Binance pariteleri + hazır Türkçe eşleşmeler. */
export async function searchSymbols(rawQuery: string): Promise<SearchResult[]> {
  const q = rawQuery.trim();
  if (q.length < 1) return [];
  const lower = q.toLocaleLowerCase("tr-TR");
  const upper = q.toLocaleUpperCase("en-US").replace(/\s+/g, "");
  const out: SearchResult[] = [];
  const seen = new Set<string>();
  const push = (r: SearchResult) => {
    if (seen.has(r.instrument) || !isValidSymbol(r.assetType, r.symbol)) return;
    seen.add(r.instrument);
    out.push(r);
  };

  for (const b of BUILTIN) if (b.keys.some((k) => k.startsWith(lower) || lower.startsWith(k))) push(b);

  // Yatırım fonları: daha önce doğrulanan fonlar (kod / ad), 3 karakterli kod yazıldıysa TEFAS'ta doğrula.
  for (const f of (await searchKnownFunds(q, lower))) push(f);
  const fundCode = /^[A-Za-z0-9]{3}$/.test(q) ? q.toLocaleUpperCase("en-US") : null;

  const [yahoo, bases, fund] = await Promise.allSettled([
    yahooClient().search(q, { quotesCount: 12, newsCount: 0 }, { validateResult: false }),
    binanceBases(),
    fundCode && !seen.has(`fund:${fundCode}`) ? lookupFund(fundCode) : Promise.resolve(null),
  ]);
  if (fund.status === "fulfilled" && fund.value) push(fund.value);

  if (yahoo.status === "fulfilled") {
    const quotes = ((yahoo.value as { quotes?: unknown[] }).quotes ?? []) as Record<string, unknown>[];
    for (const r of quotes) {
      if (typeof r.symbol !== "string" || r.isYahooFinance === false) continue;
      const ref = mapYahoo(r.symbol, String(r.quoteType ?? ""));
      if (!ref) continue;
      push({
        ...ref,
        instrument: instrumentId(ref.assetType, ref.symbol),
        name: String(r.longname ?? r.shortname ?? r.symbol),
        exchange: String(r.exchDisp ?? r.exchange ?? ""),
      });
    }
  } else {
    console.warn("[piyasa] Yahoo arama hatası:", (yahoo.reason as Error)?.message);
  }

  if (bases.status === "fulfilled" && upper.length >= 2) {
    const matches = bases.value
      .filter((b) => b.startsWith(upper))
      .sort((a, b) => (a === upper ? -1 : b === upper ? 1 : a.length - b.length))
      .slice(0, 6);
    for (const b of matches) push({ instrument: instrumentId("crypto", b), assetType: "crypto", symbol: b, name: `${b}/USDT`, exchange: "Binance" });
  }

  // Türk kullanıcı için BIST sonuçları önce gelsin (hazır eşleşmeler ve fonlar en üstte kalır).
  const builtinCount = out.filter((r) => r.assetType === "fund" || BUILTIN.some((b) => b.instrument === r.instrument)).length;
  const head = out.slice(0, builtinCount);
  const rest = out.slice(builtinCount);
  rest.sort((a, b) => Number(b.assetType === "bist") - Number(a.assetType === "bist"));
  return [...head, ...rest].slice(0, 20);
}

/** funds tablosundaki (daha önce doğrulanmış) fonlarda kod / ad araması */
async function searchKnownFunds(q: string, lower: string): Promise<SearchResult[]> {
  try {
    const rows = await (await getDb()).all("SELECT code, name FROM funds ORDER BY code") as { code: string; name: string | null }[];
    const wantAll = lower === "fon" || lower === "fonlar" || lower === "tefas";
    return rows
      .filter((r) => wantAll || r.code.startsWith(q.toLocaleUpperCase("en-US")) || (q.length >= 3 && (r.name ?? "").toLocaleLowerCase("tr-TR").includes(lower)))
      .slice(0, 8)
      .map((r) => ({ instrument: instrumentId("fund", r.code), assetType: "fund" as const, symbol: r.code, name: r.name ?? r.code, exchange: "TEFAS" }));
  } catch {
    return [];
  }
}

/** Fon kodunu TEFAS'ta doğrular (geçerli fiyatı olan fon). Bulunamazsa null. */
async function lookupFund(code: string): Promise<SearchResult | null> {
  try {
    const f = await fetchFundPrices(code, 1);
    if (!f.last) return null;
    return { instrument: instrumentId("fund", code), assetType: "fund", symbol: code, name: f.name ?? code, exchange: "TEFAS" };
  } catch (err) {
    console.warn("[piyasa] TEFAS fon araması yapılamadı:", (err as Error).message);
    return null;
  }
}

// ---- Grafik verisi -----------------------------------------------------------

export const CHART_RANGES = ["1G", "1H", "1A", "3A", "1Y", "5Y"] as const;
export type ChartRange = (typeof CHART_RANGES)[number];

export function isChartRange(v: unknown): v is ChartRange {
  return typeof v === "string" && (CHART_RANGES as readonly string[]).includes(v);
}

export interface ChartPoint {
  /** Unix saniye (UTC) */
  time: number;
  value: number;
}

export interface ChartData {
  instrument: string;
  range: ChartRange;
  currency: string;
  name: string | null;
  points: ChartPoint[];
  /** true: gün içi veri (saat ekseni) */
  intraday: boolean;
}

const DAY = 86_400_000;

/** Aralık başına Yahoo ve Binance parametreleri */
const RANGE_SPEC: Record<ChartRange, { ms: number; yahoo: "5m" | "15m" | "1h" | "1d" | "1wk"; binance: string; limit: number; ttl: number }> = {
  "1G": { ms: DAY, yahoo: "5m", binance: "5m", limit: 288, ttl: 60_000 },
  "1H": { ms: 7 * DAY, yahoo: "15m", binance: "30m", limit: 336, ttl: 5 * 60_000 },
  "1A": { ms: 31 * DAY, yahoo: "1h", binance: "4h", limit: 186, ttl: 10 * 60_000 },
  "3A": { ms: 92 * DAY, yahoo: "1d", binance: "1d", limit: 92, ttl: 30 * 60_000 },
  "1Y": { ms: 365 * DAY, yahoo: "1d", binance: "1d", limit: 365, ttl: 60 * 60_000 },
  "5Y": { ms: 5 * 365 * DAY, yahoo: "1wk", binance: "1w", limit: 261, ttl: 6 * 60 * 60_000 },
};

const chartCache = (() => {
  const gc = globalThis as unknown as { __yatirimCharts?: Map<string, { at: number; data: ChartData }> };
  gc.__yatirimCharts ??= new Map();
  return gc.__yatirimCharts;
})();

interface Series {
  points: ChartPoint[];
  currency: string;
  name: string | null;
}

async function yahooSeries(symbol: string, range: ChartRange): Promise<Series> {
  const spec = RANGE_SPEC[range];
  // 1G: hafta sonu / tatilde boş kalmasın diye son 5 günü alıp son işlem gününü kullan.
  const lookback = range === "1G" ? 5 * DAY : spec.ms;
  const res = await yahooClient().chart(
    symbol,
    { period1: new Date(Date.now() - lookback), interval: spec.yahoo, return: "array" },
    { validateResult: false },
  ) as { meta?: Record<string, unknown>; quotes?: { date: Date | string | number; close: number | null }[] };
  let points: ChartPoint[] = [];
  for (const q of res.quotes ?? []) {
    if (typeof q.close !== "number" || !Number.isFinite(q.close)) continue;
    const t = q.date instanceof Date ? q.date.getTime() : new Date(q.date).getTime();
    if (Number.isFinite(t)) points.push({ time: Math.floor(t / 1000), value: q.close });
  }
  if (range === "1G" && points.length > 0) {
    // Son işlem gününün noktaları (borsa saat dilimine göre gün ayrımı yaklaşık olarak son 24 saat)
    const last = points[points.length - 1].time;
    points = points.filter((p) => p.time > last - 20 * 3600);
  }
  const meta = res.meta ?? {};
  // Günlük/haftalık seride bugünün çubuğu çoğu zaman boş gelir; son fiyatı ekle.
  const mp = meta.regularMarketPrice;
  const mtRaw = meta.regularMarketTime as unknown;
  const mt = mtRaw instanceof Date ? mtRaw.getTime() : typeof mtRaw === "number" ? mtRaw * 1000 : typeof mtRaw === "string" ? Date.parse(mtRaw) : NaN;
  if (typeof mp === "number" && Number.isFinite(mp) && Number.isFinite(mt)) {
    const t = Math.floor(mt / 1000);
    if (points.length === 0 || t > points[points.length - 1].time + 60) points.push({ time: t, value: mp });
  }
  let currency = typeof meta.currency === "string" ? meta.currency : "USD";
  if (currency === "GBp" || currency === "ZAc") {
    points = points.map((p) => ({ ...p, value: p.value / 100 }));
    currency = currency === "GBp" ? "GBP" : "ZAR";
  }
  const name = typeof meta.longName === "string" ? meta.longName : typeof meta.shortName === "string" ? meta.shortName : null;
  return { points, currency: currency.toUpperCase(), name };
}

async function binanceSeries(base: string, range: ChartRange): Promise<Series> {
  const spec = RANGE_SPEC[range];
  const url = `https://api.binance.com/api/v3/klines?symbol=${encodeURIComponent(`${base}USDT`)}&interval=${spec.binance}&limit=${spec.limit}`;
  const res = await fetch(url, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS), cache: "no-store" });
  if (!res.ok) throw new Error(`Binance HTTP ${res.status}`);
  // [openTime, open, high, low, close, volume, closeTime, ...]
  const rows = await res.json() as [number, string, string, string, string, ...unknown[]][];
  const points = rows
    .map((r) => ({ time: Math.floor(r[0] / 1000), value: Number(r[4]) }))
    .filter((p) => Number.isFinite(p.value));
  return { points, currency: "USD", name: `${base}/USDT` };
}

/** Gram altın = ons (GC=F) × USDTRY / 31,1035; her ons noktası için en yakın önceki kur kullanılır. */
async function gramGoldSeries(range: ChartRange): Promise<Series> {
  const [oz, usd] = await Promise.all([yahooSeries("GC=F", range), yahooSeries("USDTRY=X", range)]);
  if (usd.points.length === 0) return { points: [], currency: "TRY", name: "Gram Altın" };
  const points: ChartPoint[] = [];
  let j = 0;
  for (const p of oz.points) {
    while (j + 1 < usd.points.length && usd.points[j + 1].time <= p.time) j++;
    points.push({ time: p.time, value: (p.value * usd.points[j].value) / TROY_OUNCE_GRAMS });
  }
  return { points, currency: "TRY", name: "Gram Altın" };
}

/** TEFAS fon fiyat geçmişi (günlük; 0 fiyatlar atlanmış). periyod: ay sayısı */
const FUND_MONTHS: Record<ChartRange, number> = { "1G": 1, "1H": 1, "1A": 1, "3A": 3, "1Y": 12, "5Y": 60 };

async function fundSeries(code: string, range: ChartRange): Promise<Series> {
  const f = await fetchFundPrices(code, FUND_MONTHS[range]);
  let points = f.history.map((p) => ({ time: Math.floor(fundDateMs(p.date) / 1000), value: p.price }));
  if (range === "1H") points = points.filter((p) => p.time * 1000 >= Date.now() - 8 * DAY);
  if (range === "1G") points = points.slice(-2);
  return { points, currency: "TRY", name: f.name };
}

/**
 * Sikke / bilezik grafiği: kaynakta geçmiş yok; gram altın serisi, güncel fiyat
 * oranıyla ölçeklenir (yaklaşık — işçilik ve makas oranı sabit varsayılır).
 */
async function goldKindSeries(symbol: string, range: ChartRange): Promise<Series> {
  const kind = goldKind(symbol)!;
  const [gram, quotes] = await Promise.all([gramGoldSeries(range), getQuotes([{ type: "gold", symbol: GOLD_SYMBOL }, { type: "gold", symbol }])]);
  const ratio = quotes[0].price && quotes[1].price ? quotes[1].price / quotes[0].price : kind.grams * kind.purity;
  return { points: gram.points.map((p) => ({ ...p, value: p.value * ratio })), currency: "TRY", name: `${kind.label} (gram altından yaklaşık)` };
}

/** Fiyat grafiği verisi (önbellekli). Kaynak yanıt vermezse hata fırlatır. */
export async function getChart(type: AssetType, symbol: string, range: ChartRange): Promise<ChartData> {
  const instrument = instrumentId(type, symbol);
  const key = `${instrument}|${range}`;
  const spec = RANGE_SPEC[range];
  const cached = chartCache.get(key);
  // Fon fiyatı günde bir açıklanır: TEFAS'a en fazla 30 dk'da bir sor.
  const ttl = type === "fund" ? Math.max(spec.ttl, 30 * 60_000) : spec.ttl;
  if (cached && Date.now() - cached.at < ttl) return cached.data;

  let s: Series;
  if (type === "crypto") s = await binanceSeries(symbol, range);
  else if (type === "fund") s = await fundSeries(symbol, range);
  else if (type === "gold") s = symbol === GOLD_SYMBOL ? await gramGoldSeries(range) : await goldKindSeries(symbol, range);
  else s = await yahooSeries(yahooSymbolFor(type, symbol)!, range);

  // Aynı zaman damgası tekrar etmesin, sıralı olsun (grafik kütüphanesi bunu ister).
  const dedup = new Map<number, number>();
  for (const p of s.points) dedup.set(p.time, p.value);
  const points = [...dedup.entries()].sort((a, b) => a[0] - b[0]).map(([time, value]) => ({ time, value }));

  const intraday = type !== "fund" && (range === "1G" || range === "1H" || range === "1A");
  const data: ChartData = { instrument, range, currency: s.currency, name: s.name, points, intraday };
  if (points.length > 0) chartCache.set(key, { at: Date.now(), data });
  return data;
}
