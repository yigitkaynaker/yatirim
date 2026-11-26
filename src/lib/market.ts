import "server-only";
import { getDb } from "./db";
import {
  CATALOG_CATEGORIES,
  defaultCategory,
  defaultCurrencyFor,
  GOLD_KINDS,
  GOLD_SYMBOL,
  goldKind,
  instrumentId,
  isAssetType,
  isValidSymbol,
  normalizeSymbol,
  parseCryptoSymbol,
  type AssetType,
  type CryptoRef,
  type CatalogCategory,
} from "./assets";
import { rememberSearchHit, searchCatalog } from "./catalog";
import { COMMODITIES, COMMODITY_KEYWORDS } from "./catalogData";
import { COINGECKO_API, coingeckoId, parseMarketChart } from "./coingecko";
import { politeFetch } from "./http";
import { ValidationError } from "./portfolio";
import { getCurrentUserId } from "./userContext";
import { binanceAlphaTokens, binanceFuturesQuotes, fetchFundPrices, fundDateMs, getQuotes, yahooClient, yahooSymbolFor } from "./prices";

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
  const rows = await (await getDb()).all("SELECT * FROM watchlist WHERE user_id = ? ORDER BY id", [await getCurrentUserId()]) as unknown as WatchRow[];
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
  const uid = await getCurrentUserId();
  await db.run("INSERT INTO watchlist (user_id, asset_type, symbol, name) VALUES (?, ?, ?, ?) ON CONFLICT(user_id, asset_type, symbol) DO NOTHING", [uid, ref.assetType, ref.symbol, nm]);
  const row = await db.get("SELECT * FROM watchlist WHERE user_id = ? AND asset_type = ? AND symbol = ?", [uid, ref.assetType, ref.symbol]) as unknown as WatchRow;
  return fromRow(row);
}

/** İzleme listesinden çıkarır. Bulunamazsa false. */
export async function removeWatch(id: number): Promise<boolean> {
  return (await (await getDb()).run("DELETE FROM watchlist WHERE id = ? AND user_id = ?", [id, await getCurrentUserId()])).changes > 0;
}

// ---- Sembol arama ------------------------------------------------------------

export interface SearchResult {
  instrument: string;
  assetType: AssetType;
  symbol: string;
  name: string;
  /** Borsa / kaynak etiketi */
  exchange: string;
  /** Piyasa listesi (Kripto, BIST, ABD Hisseleri, ETF, Endeksler, Emtia, Döviz, Altın, Fonlar) */
  category: CatalogCategory;
  /** Fiyatın para birimi (endekslerde boş) */
  currency: string;
}

/** Türkçe anahtar kelimelerle bulunabilen hazır varlıklar */
const BUILTIN: (SearchResult & { keys: string[] })[] = [
  { instrument: "gold:GRAM", assetType: "gold", symbol: GOLD_SYMBOL, name: "Gram Altın", exchange: "Hesaplanan", category: "altin", currency: "TRY", keys: ["altın", "altin", "gram", "gold"] },
  ...GOLD_KINDS.filter((k) => k.symbol !== GOLD_SYMBOL).map((k) => ({
    instrument: `gold:${k.symbol}`,
    assetType: "gold" as const,
    symbol: k.symbol,
    name: k.label,
    exchange: "Kuyumcu",
    category: "altin" as const,
    currency: "TRY",
    keys: ["altın", "altin", "gold", k.label.toLocaleLowerCase("tr-TR"), k.symbol.toLowerCase(), ...(k.symbol === "BILEZIK22" ? ["bilezik", "22 ayar"] : [])],
  })),
  // Emtia kısayolları: "gümüş", "petrol", "brent", "doğalgaz", "bakır"…
  ...COMMODITIES.filter(([sym]) => COMMODITY_KEYWORDS[sym]).map(([sym, name]) => ({
    instrument: `foreign:${sym}`,
    assetType: "foreign" as const,
    symbol: sym,
    name,
    exchange: "Vadeli",
    category: "emtia" as const,
    currency: "USD",
    keys: COMMODITY_KEYWORDS[sym],
  })),
  { instrument: "fx:USD", assetType: "fx", symbol: "USD", name: "Amerikan Doları", exchange: "Döviz", category: "doviz", currency: "TRY", keys: ["dolar", "usd"] },
  { instrument: "fx:EUR", assetType: "fx", symbol: "EUR", name: "Euro", exchange: "Döviz", category: "doviz", currency: "TRY", keys: ["euro", "avro", "eur"] },
  { instrument: "fx:GBP", assetType: "fx", symbol: "GBP", name: "İngiliz Sterlini", exchange: "Döviz", category: "doviz", currency: "TRY", keys: ["sterlin", "pound", "gbp"] },
  { instrument: "bist:XU100", assetType: "bist", symbol: "XU100", name: "BIST 100 Endeksi", exchange: "Borsa İstanbul", category: "endeks", currency: "", keys: ["bist", "xu100", "endeks"] },
];

/** Yahoo arama sonucunu uygulamadaki varlık türüne çevirir. */
export function mapYahoo(symbol: string, quoteType: string): { assetType: AssetType; symbol: string; category: CatalogCategory } | null {
  const s = symbol.toUpperCase();
  if (s.endsWith(".IS")) {
    const sym = s.slice(0, -3);
    return { assetType: "bist", symbol: sym, category: quoteType === "INDEX" ? "endeks" : defaultCategory("bist", sym) };
  }
  if (quoteType === "CRYPTOCURRENCY") {
    const base = s.replace(/-USD$/, "");
    return /^[A-Z0-9]{1,15}$/.test(base) ? { assetType: "crypto", symbol: base, category: "kripto" } : null;
  }
  if (quoteType === "CURRENCY") {
    const m = /^([A-Z]{3})TRY=X$/.exec(s);
    return m ? { assetType: "fx", symbol: m[1], category: "doviz" } : null;
  }
  // "foreign" türü korunur; alt kategori (Hisse / ETF / Endeks / Emtia) Yahoo quoteType'tan gelir
  const cat: Record<string, CatalogCategory> = { EQUITY: "hisse", ETF: "etf", MUTUALFUND: "etf", INDEX: "endeks", FUTURE: "emtia" };
  return cat[quoteType] ? { assetType: "foreign", symbol: s, category: cat[quoteType] } : null;
}

/**
 * Arama sonuçlarını türe göre gruplar: grupların sırası, grubun en alakalı (ilk) sonucunun sırasıdır
 * (hazır Türkçe eşleşmeler ve fonlar en başta, sonra katalog, en son Yahoo). Grup içinde sıra korunur.
 */
export function groupResults<T extends { category: CatalogCategory }>(results: T[]): T[] {
  const first = new Map<CatalogCategory, number>();
  results.forEach((r, i) => {
    if (!first.has(r.category)) first.set(r.category, i);
  });
  const rank = (c: CatalogCategory) => first.get(c) ?? CATALOG_CATEGORIES.length;
  return results
    .map((r, i) => ({ r, i }))
    .sort((a, b) => rank(a.r.category) - rank(b.r.category) || a.i - b.i)
    .map((x) => x.r);
}

/** Arama sonucu üst sınırı (kategori başına ve toplam) */
const SEARCH_PER_CATEGORY = 15;
const SEARCH_MAX = 60;

/**
 * Arama: hazır Türkçe eşleşmeler + bilinen fonlar + sembol kataloğu (kripto pariteleri, BIST, ABD hisse /
 * ETF / endeks / emtia, döviz) + Yahoo Finance. Sonuçlar türe göre gruplu döner (kategori başına en fazla 15).
 */
export async function searchSymbols(rawQuery: string): Promise<SearchResult[]> {
  const q = rawQuery.trim();
  if (q.length < 1) return [];
  const lower = q.toLocaleLowerCase("tr-TR");
  const out: SearchResult[] = [];
  const seen = new Set<string>();
  const perCat = new Map<CatalogCategory, number>();
  const push = (r: SearchResult) => {
    if (seen.has(r.instrument) || !isValidSymbol(r.assetType, r.symbol)) return false;
    const n = perCat.get(r.category) ?? 0;
    if (n >= SEARCH_PER_CATEGORY) return false;
    perCat.set(r.category, n + 1);
    seen.add(r.instrument);
    out.push(r);
    return true;
  };

  for (const { keys, ...b } of BUILTIN) if (keys.some((k) => k.startsWith(lower) || (k.length >= 3 && lower.startsWith(k)))) push(b);

  // Yatırım fonları: daha önce doğrulanan fonlar (kod / ad), 3 karakterli kod yazıldıysa TEFAS'ta doğrula.
  for (const f of (await searchKnownFunds(q, lower))) push(f);
  const fundCode = /^[A-Za-z0-9]{3}$/.test(q) ? q.toLocaleUpperCase("en-US") : null;

  const [catalog, yahoo, fund] = await Promise.allSettled([
    searchCatalog(q, SEARCH_PER_CATEGORY),
    yahooClient().search(q, { quotesCount: 12, newsCount: 0 }, { validateResult: false }),
    fundCode && !seen.has(`fund:${fundCode}`) ? lookupFund(fundCode) : Promise.resolve(null),
  ]);
  if (fund.status === "fulfilled" && fund.value) push(fund.value);
  if (catalog.status === "fulfilled") for (const c of catalog.value) push(c);
  else console.warn("[piyasa] katalog araması hatası:", (catalog.reason as Error)?.message);

  if (yahoo.status === "fulfilled") {
    const quotes = ((yahoo.value as { quotes?: unknown[] }).quotes ?? []) as Record<string, unknown>[];
    for (const r of quotes) {
      if (typeof r.symbol !== "string" || r.isYahooFinance === false) continue;
      const ref = mapYahoo(r.symbol, String(r.quoteType ?? ""));
      if (!ref) continue;
      const hit: SearchResult = {
        ...ref,
        instrument: instrumentId(ref.assetType, ref.symbol),
        name: String(r.longname ?? r.shortname ?? r.symbol),
        exchange: String(r.exchDisp ?? r.exchange ?? ""),
        currency: ref.category === "endeks" ? "" : defaultCurrencyFor(ref.assetType, ref.symbol),
      };
      // Yahoo'da bulunan yabancı / BIST sembolü ilgili listede de görünsün (katalog genişler)
      if (push(hit) && (hit.assetType === "foreign" || hit.assetType === "bist")) void rememberSearchHit(hit);
    }
  } else {
    console.warn("[piyasa] Yahoo arama hatası:", (yahoo.reason as Error)?.message);
  }

  return groupResults(out).slice(0, SEARCH_MAX);
}

/** funds tablosundaki (daha önce doğrulanmış) fonlarda kod / ad araması */
async function searchKnownFunds(q: string, lower: string): Promise<SearchResult[]> {
  try {
    const rows = await (await getDb()).all("SELECT code, name FROM funds ORDER BY code") as { code: string; name: string | null }[];
    const wantAll = lower === "fon" || lower === "fonlar" || lower === "tefas";
    return rows
      .filter((r) => wantAll || r.code.startsWith(q.toLocaleUpperCase("en-US")) || (q.length >= 3 && (r.name ?? "").toLocaleLowerCase("tr-TR").includes(lower)))
      .slice(0, 8)
      .map((r) => ({ instrument: instrumentId("fund", r.code), assetType: "fund" as const, symbol: r.code, name: r.name ?? r.code, exchange: "TEFAS", category: "fon" as const, currency: "TRY" }));
  } catch {
    return [];
  }
}

/** Fon kodunu TEFAS'ta doğrular (geçerli fiyatı olan fon). Bulunamazsa null. */
async function lookupFund(code: string): Promise<SearchResult | null> {
  try {
    const f = await fetchFundPrices(code, 1);
    if (!f.last) return null;
    return { instrument: instrumentId("fund", code), assetType: "fund", symbol: code, name: f.name ?? code, exchange: "TEFAS", category: "fon", currency: "TRY" };
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

/** Binance mumları; ana uç engellenirse (451/403) piyasa verisi aynası */
export async function binanceKlines(pair: string, interval: string, limit: number): Promise<[number, string, string, string, string, string, number, ...unknown[]][]> {
  let lastErr: unknown = null;
  for (const base of ["https://api.binance.com", "https://data-api.binance.vision"]) {
    try {
      const res = await fetch(`${base}/api/v3/klines?symbol=${encodeURIComponent(pair)}&interval=${interval}&limit=${limit}`, {
        signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
        cache: "no-store",
      });
      if (!res.ok) throw Object.assign(new Error(`Binance HTTP ${res.status}`), { status: res.status });
      // [openTime, open, high, low, close, volume, closeTime, ...]
      return (await res.json()) as [number, string, string, string, string, string, number, ...unknown[]][];
    } catch (err) {
      lastErr = err;
      const status = (err as { status?: number }).status;
      if (status !== 451 && status !== 403) break;
    }
  }
  throw lastErr;
}

/** BtcTurk mumları (graph-api.btcturk.com, TradingView biçimi: t, o, h, l, c, v). resolution dakika. */
export async function btcturkKlines(pair: string, resolutionMin: number, fromMs: number): Promise<{ time: number; close: number; volume: number | null }[]> {
  const to = Math.floor(Date.now() / 1000);
  const url = `https://graph-api.btcturk.com/v1/klines/history?symbol=${encodeURIComponent(pair)}&resolution=${resolutionMin}&from=${Math.floor(fromMs / 1000)}&to=${to}`;
  const res = await fetch(url, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS), cache: "no-store" });
  if (!res.ok) throw new Error(`BtcTurk grafik HTTP ${res.status}`);
  const d = (await res.json()) as { s?: string; t?: number[]; c?: number[]; v?: number[] };
  if (d.s !== "ok" || !Array.isArray(d.t) || !Array.isArray(d.c)) return [];
  const out: { time: number; close: number; volume: number | null }[] = [];
  for (let i = 0; i < d.t.length; i++) {
    const close = Number(d.c[i]);
    const vol = Number(d.v?.[i]);
    if (Number.isFinite(d.t[i]) && Number.isFinite(close) && close > 0) out.push({ time: d.t[i], close, volume: Number.isFinite(vol) && vol > 0 ? vol : null });
  }
  return out;
}

export interface KlineRow {
  /** Açılış zamanı (sn) */
  time: number;
  close: number;
  volume: number | null;
  /** Kapanış zamanı (ms) */
  closeTime: number;
}

type RawKline = [number | string, string, string, string, string, string, number | string, ...unknown[]];

function toKlineRows(rows: RawKline[], mult = 1): KlineRow[] {
  const out: KlineRow[] = [];
  for (const r of Array.isArray(rows) ? rows : []) {
    const close = Number(r[4]) / mult;
    const vol = Number(r[5]) * mult;
    const t = Number(r[0]);
    if (!Number.isFinite(t) || !Number.isFinite(close) || close <= 0) continue;
    out.push({ time: Math.floor(t / 1000), close, volume: Number.isFinite(vol) && vol > 0 ? vol : null, closeTime: Number(r[6]) });
  }
  return out;
}

/**
 * Spotta olmayan coinlerin mumları: Binance Vadeli (fapi /fapi/v1/klines; çarpanlı kontratta fiyat 1 coin
 * için, hacim coin adedi) ya da Binance Alpha (bapi alpha-trade/klines, ALPHA_<id>USDT). Kontrat / Alpha
 * kimliği bellekteki fiyat listesinden bulunur. Interval Binance biçiminde (5m, 30m, 4h, 1d, 1w).
 */
export async function extraVenueKlines(c: CryptoRef, interval: string, limit: number): Promise<KlineRow[]> {
  if (c.venue === "BINANCE-F") {
    // Yeni listelenen kontrat uzun süreli bellekte yoksa liste bir kez tazelenir
    const q = (await binanceFuturesQuotes(60 * 60_000)).get(c.base) ?? (await binanceFuturesQuotes(60_000)).get(c.base);
    if (!q) throw new Error(`${c.base} için Binance vadeli kontratı bulunamadı.`);
    const res = await fetch(`https://fapi.binance.com/fapi/v1/klines?symbol=${encodeURIComponent(q.pair)}&interval=${interval}&limit=${limit}`, {
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      cache: "no-store",
    });
    if (!res.ok) throw new Error(`Binance Vadeli grafik HTTP ${res.status}`);
    return toKlineRows((await res.json()) as RawKline[], q.mult);
  }
  if (c.venue === "BINANCE-ALPHA") {
    const t = (await binanceAlphaTokens(6 * 3600_000)).get(c.base) ?? (await binanceAlphaTokens(60_000)).get(c.base);
    if (!t) throw new Error(`${c.base} için Binance Alpha tokenı bulunamadı.`);
    const res = await fetch(`https://www.binance.com/bapi/defi/v1/public/alpha-trade/klines?symbol=${encodeURIComponent(`${t.alphaId}USDT`)}&interval=${interval}&limit=${limit}`, {
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      cache: "no-store",
    });
    if (!res.ok) throw new Error(`Binance Alpha grafik HTTP ${res.status}`);
    const d = (await res.json()) as { success?: boolean; data?: RawKline[] };
    if (d.success === false || !Array.isArray(d.data)) throw new Error("Binance Alpha grafik verisi alınamadı.");
    return toKlineRows(d.data);
  }
  throw new Error("Bu borsa için mum verisi yok.");
}

/** Grafik aralığının CoinGecko gün sayısı (anahtarsız uç en fazla 365 gün verir; 5Y de son 1 yıl) */
const COINGECKO_DAYS: Record<ChartRange, number> = { "1G": 1, "1H": 7, "1A": 31, "3A": 92, "1Y": 365, "5Y": 365 };

const gecko = (() => {
  const g = globalThis as unknown as { __yatirimGeckoCharts?: { data: Map<string, { at: number; rows: KlineRow[] }>; jobs: Map<string, Promise<KlineRow[]>> } };
  g.__yatirimGeckoCharts ??= { data: new Map(), jobs: new Map() };
  return g.__yatirimGeckoCharts;
})();

/**
 * CoinGecko fiyat geçmişi (/coins/{id}/market_chart; 1 gün ~5 dk, 2–90 gün saatlik, üstü günlük noktalar).
 * Anahtarsız ucun hız sınırı düşük: kimlik + gün başına bellek önbelleği (1 gün 2 dk, üstü 15 dk),
 * eşzamanlı istekler aynı çağrıyı bekler, 429'da geri çekilir (fiyatlarla aynı sağlayıcı sayacı).
 * Son nokta güncel fiyattır (kapanmamış mum).
 */
export async function coingeckoKlines(coin: string, days: number): Promise<KlineRow[]> {
  const id = coingeckoId(coin);
  if (!id) throw new Error(`${coin} için CoinGecko eşlemesi yok.`);
  const key = `${id}|${days}`;
  const hit = gecko.data.get(key);
  if (hit && Date.now() - hit.at < (days <= 1 ? 2 * 60_000 : 15 * 60_000)) return hit.rows;
  let job = gecko.jobs.get(key);
  if (!job) {
    job = (async () => {
      const url = `${COINGECKO_API}/coins/${encodeURIComponent(id)}/market_chart?vs_currency=usd&days=${days}${days > 90 ? "&interval=daily" : ""}`;
      const pts = parseMarketChart(JSON.parse(await politeFetch("CoinGecko", url, { timeoutMs: 15_000, backoffBaseMs: 60_000, backoffMaxMs: 15 * 60_000 })));
      const rows = pts.map((p, i) => ({ time: p.time, close: p.close, volume: p.volume, closeTime: i + 1 < pts.length ? pts[i + 1].time * 1000 : Date.now() + 60_000 }));
      if (rows.length > 0) gecko.data.set(key, { at: Date.now(), rows });
      return rows;
    })().finally(() => gecko.jobs.delete(key));
    gecko.jobs.set(key, job);
  }
  return await job;
}

/** Binance aralıklarının BtcTurk karşılığı (dakika) */
const BTCTURK_RES: Record<string, number> = { "5m": 5, "30m": 30, "4h": 240, "1d": 1440, "1w": 10080 };

async function cryptoSeries(symbol: string, range: ChartRange): Promise<Series> {
  const c = parseCryptoSymbol(symbol);
  if (!c) throw new Error("Kripto sembolü geçersiz.");
  const spec = RANGE_SPEC[range];
  const currency = c.quote === "TRY" ? "TRY" : "USD";
  const name =
    c.venue === "BINANCE-F"
      ? `${c.base} (Binance Vadeli)`
      : c.venue === "BINANCE-ALPHA"
        ? `${c.base} (Binance Alpha)`
        : c.venue === "COINGECKO"
          ? `${c.base} (CoinGecko)`
          : `${c.base}/${c.quote}${c.venue === "BTCTURK" ? " (BtcTurk)" : ""}`;
  if (c.venue === "COINGECKO") {
    const rows = await coingeckoKlines(c.base, COINGECKO_DAYS[range]);
    // 5Y: anahtarsız uçta en fazla son 1 yıl
    return { points: rows.filter((r) => r.time * 1000 >= Date.now() - spec.ms).map((r) => ({ time: r.time, value: r.close })), currency, name };
  }
  if (c.venue === "BINANCE-F" || c.venue === "BINANCE-ALPHA") {
    const rows = await extraVenueKlines(c, spec.binance, spec.limit);
    return { points: rows.map((r) => ({ time: r.time, value: r.close })), currency, name };
  }
  if (c.venue === "BTCTURK") {
    const rows = await btcturkKlines(`${c.base}${c.quote}`, BTCTURK_RES[spec.binance] ?? 1440, Date.now() - spec.ms);
    return { points: rows.map((r) => ({ time: r.time, value: r.close })), currency, name };
  }
  const rows = await binanceKlines(`${c.base}${c.quote}`, spec.binance, spec.limit);
  const points = rows
    .map((r) => ({ time: Math.floor(r[0] / 1000), value: Number(r[4]) }))
    .filter((p) => Number.isFinite(p.value));
  return { points, currency, name };
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
  if (type === "crypto") s = await cryptoSeries(symbol, range);
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
