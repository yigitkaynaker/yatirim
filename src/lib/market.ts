import "server-only";
import { getDb } from "./db";
import {
  GOLD_SYMBOL,
  instrumentId,
  isAssetType,
  isValidSymbol,
  normalizeSymbol,
  type AssetType,
} from "./assets";
import { ValidationError } from "./portfolio";
import { yahooClient, yahooSymbolFor } from "./prices";

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

export function listWatchlist(): WatchItem[] {
  const rows = getDb().prepare("SELECT * FROM watchlist ORDER BY id").all() as unknown as WatchRow[];
  return rows.map(fromRow);
}

function parseRef(assetType: unknown, rawSymbol: unknown): { assetType: AssetType; symbol: string } {
  if (!isAssetType(assetType)) throw new ValidationError("Varlık türü geçersiz.");
  const symbol = normalizeSymbol(assetType, String(rawSymbol ?? ""));
  if (!isValidSymbol(assetType, symbol)) throw new ValidationError("Sembol geçersiz.");
  return { assetType, symbol };
}

/** İzleme listesine ekler; zaten varsa mevcut kaydı döndürür. */
export function addWatch(assetType: unknown, symbol: unknown, name?: unknown): WatchItem {
  const ref = parseRef(assetType, symbol);
  const nm = typeof name === "string" && name.trim() ? name.trim().slice(0, 120) : null;
  const db = getDb();
  db.prepare("INSERT INTO watchlist (asset_type, symbol, name) VALUES (?, ?, ?) ON CONFLICT(asset_type, symbol) DO NOTHING").run(
    ref.assetType,
    ref.symbol,
    nm,
  );
  const row = db.prepare("SELECT * FROM watchlist WHERE asset_type = ? AND symbol = ?").get(ref.assetType, ref.symbol) as unknown as WatchRow;
  return fromRow(row);
}

/** İzleme listesinden çıkarır. Bulunamazsa false. */
export function removeWatch(id: number): boolean {
  return getDb().prepare("DELETE FROM watchlist WHERE id = ?").run(id).changes > 0;
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
    const all = (await res.json()) as { symbol: string }[];
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

  const [yahoo, bases] = await Promise.allSettled([
    yahooClient().search(q, { quotesCount: 12, newsCount: 0 }, { validateResult: false }),
    binanceBases(),
  ]);

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

  // Türk kullanıcı için BIST sonuçları önce gelsin (hazır eşleşmeler en üstte kalır).
  const builtinCount = out.filter((r) => BUILTIN.some((b) => b.instrument === r.instrument)).length;
  const head = out.slice(0, builtinCount);
  const rest = out.slice(builtinCount);
  rest.sort((a, b) => Number(b.assetType === "bist") - Number(a.assetType === "bist"));
  return [...head, ...rest].slice(0, 20);
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
  const res = (await yahooClient().chart(
    symbol,
    { period1: new Date(Date.now() - lookback), interval: spec.yahoo, return: "array" },
    { validateResult: false },
  )) as { meta?: Record<string, unknown>; quotes?: { date: Date | string | number; close: number | null }[] };
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
  const rows = (await res.json()) as [number, string, string, string, string, ...unknown[]][];
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

/** Fiyat grafiği verisi (önbellekli). Kaynak yanıt vermezse hata fırlatır. */
export async function getChart(type: AssetType, symbol: string, range: ChartRange): Promise<ChartData> {
  const instrument = instrumentId(type, symbol);
  const key = `${instrument}|${range}`;
  const spec = RANGE_SPEC[range];
  const cached = chartCache.get(key);
  if (cached && Date.now() - cached.at < spec.ttl) return cached.data;

  let s: Series;
  if (type === "crypto") s = await binanceSeries(symbol, range);
  else if (type === "gold") s = await gramGoldSeries(range);
  else s = await yahooSeries(yahooSymbolFor(type, symbol)!, range);

  // Aynı zaman damgası tekrar etmesin, sıralı olsun (grafik kütüphanesi bunu ister).
  const dedup = new Map<number, number>();
  for (const p of s.points) dedup.set(p.time, p.value);
  const points = [...dedup.entries()].sort((a, b) => a[0] - b[0]).map(([time, value]) => ({ time, value }));

  const data: ChartData = { instrument, range, currency: s.currency, name: s.name, points, intraday: range === "1G" || range === "1H" || range === "1A" };
  if (points.length > 0) chartCache.set(key, { at: Date.now(), data });
  return data;
}
