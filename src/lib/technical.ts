import "server-only";
import { background } from "./background";
import { getDb, sqlNow } from "./db";
import { displaySymbol, GOLD_SYMBOL, goldKind, instrumentId, type AssetType } from "./assets";
import { fetchFundPrices, fundDateMs, getQuotes, yahooClient, yahooSymbolFor } from "./prices";
import { listWatchlist } from "./market";
import { getPortfolio } from "./portfolio";
import { addNotification } from "./orders";
import { sendPushToAll } from "./push";
import { getSignalAlertsEnabled } from "./settings";
import { getCurrentUserId } from "./userContext";
import { bollinger, ema, last, macd, recentCross, rsi, sma, volumeRatio, type Series } from "./indicators";
import {
  evaluateSignals,
  indicatorRows,
  LABEL_EXPLAIN,
  RULES,
  type IndicatorRow,
  type SignalLabel,
  type SignalSummary,
  type TechnicalSnapshot,
} from "./signalRules";

// TEKNİK ANALİZ SERVİSİ
// Günlük mumları (Yahoo / Binance) çeker, göstergeleri hesaplar (indicators.ts),
// kuralları uygular (signalRules.ts). Mumlar 30 dk bellekte tutulur.
// Günlük sinyal uyarısı: emir izleyici döngüsünden çağrılır; özet sinyal bir
// önceki günlük kontrole göre DEĞİŞTİYSE bildirim + push üretir.

const FETCH_TIMEOUT_MS = 10_000;
const CANDLE_TTL_MS = 30 * 60_000;
const TROY_OUNCE_GRAMS = 31.1035;
const DAY_S = 86_400;
/** Yaklaşık 2 yıllık günlük veri: SMA200 ve kesişimler için yeterli */
const LOOKBACK_DAYS = 760;
const BINANCE_LIMIT = 500;

export interface Candle {
  /** Unix saniye (UTC), grafik verisiyle aynı zaman damgası */
  time: number;
  close: number;
  volume: number | null;
}

interface CandleSet {
  candles: Candle[];
  currency: string;
  /** Son mum henüz kapanmadı (seans / gün sürüyor): hacmi kısmi */
  lastPartial?: boolean;
}

const cache = (() => {
  const gc = globalThis as unknown as { __yatirimCandles?: Map<string, { at: number; data: CandleSet }> };
  gc.__yatirimCandles ??= new Map();
  return gc.__yatirimCandles;
})();

const utcDay = (t: number) => Math.floor(t / DAY_S);

async function yahooCandles(symbol: string): Promise<CandleSet> {
  const res = await yahooClient().chart(
    symbol,
    { period1: new Date(Date.now() - LOOKBACK_DAYS * DAY_S * 1000), interval: "1d", return: "array" },
    { validateResult: false },
  ) as { meta?: Record<string, unknown>; quotes?: { date: Date | string | number; close: number | null; volume?: number | null }[] };
  const candles: Candle[] = [];
  for (const q of res.quotes ?? []) {
    if (typeof q.close !== "number" || !Number.isFinite(q.close)) continue;
    const t = q.date instanceof Date ? q.date.getTime() : new Date(q.date).getTime();
    if (!Number.isFinite(t)) continue;
    candles.push({ time: Math.floor(t / 1000), close: q.close, volume: typeof q.volume === "number" && q.volume > 0 ? q.volume : null });
  }
  const meta = res.meta ?? {};
  // Bugünün mumu bazen eksik ya da gecikmeli gelir: son fiyatla tamamla.
  const mp = meta.regularMarketPrice;
  const mtRaw = meta.regularMarketTime as unknown;
  const mt = mtRaw instanceof Date ? mtRaw.getTime() : typeof mtRaw === "number" ? mtRaw * 1000 : typeof mtRaw === "string" ? Date.parse(mtRaw) : NaN;
  if (typeof mp === "number" && Number.isFinite(mp) && Number.isFinite(mt)) {
    const t = Math.floor(mt / 1000);
    const lastC = candles[candles.length - 1];
    if (lastC && utcDay(lastC.time) === utcDay(t)) lastC.close = mp;
    else if (!lastC || t > lastC.time) candles.push({ time: t, close: mp, volume: null });
  }
  // Seans sürüyorsa bugünün mumu (ve hacmi) kısmidir.
  const toMs = (v: unknown) => (v instanceof Date ? v.getTime() : typeof v === "number" ? v * 1000 : typeof v === "string" ? Date.parse(v) : NaN);
  const regular = (meta.currentTradingPeriod as { regular?: { start?: unknown; end?: unknown } } | undefined)?.regular;
  const sessionStart = toMs(regular?.start);
  const sessionEnd = toMs(regular?.end);
  const lastT = candles.length ? candles[candles.length - 1].time * 1000 : NaN;
  const now = Date.now();
  const lastPartial =
    Number.isFinite(sessionStart) && Number.isFinite(sessionEnd) && now >= sessionStart && now < sessionEnd && utcDay(lastT / 1000) === utcDay(sessionStart / 1000);
  let currency = typeof meta.currency === "string" ? meta.currency : "USD";
  if (currency === "GBp" || currency === "ZAc") {
    for (const c of candles) c.close /= 100;
    currency = currency === "GBp" ? "GBP" : "ZAR";
  }
  return { candles, currency: currency.toUpperCase(), lastPartial };
}

async function binanceCandles(base: string): Promise<CandleSet> {
  const url = `https://api.binance.com/api/v3/klines?symbol=${encodeURIComponent(`${base}USDT`)}&interval=1d&limit=${BINANCE_LIMIT}`;
  const res = await fetch(url, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS), cache: "no-store" });
  if (!res.ok) throw new Error(`Binance HTTP ${res.status}`);
  const rows = await res.json() as [number, string, string, string, string, string, number, ...unknown[]][];
  const candles = rows
    .map((r) => ({ time: Math.floor(r[0] / 1000), close: Number(r[4]), volume: Number(r[5]) > 0 ? Number(r[5]) : null }))
    .filter((c) => Number.isFinite(c.close));
  // Kripto 7/24: son mumun kapanış zamanı gelmediyse günün hacmi kısmidir.
  const lastRow = rows[rows.length - 1];
  return { candles, currency: "USD", lastPartial: !!lastRow && Number(lastRow[6]) > Date.now() };
}

/** Gram altın = ons × USDTRY / 31,1035 (her gün için o güne kadarki son kur). Hacim yok. */
async function gramGoldCandles(): Promise<CandleSet> {
  const [oz, usd] = await Promise.all([yahooCandles("GC=F"), yahooCandles("USDTRY=X")]);
  const candles: Candle[] = [];
  let j = 0;
  for (const c of oz.candles) {
    while (j + 1 < usd.candles.length && utcDay(usd.candles[j + 1].time) <= utcDay(c.time)) j++;
    if (!usd.candles[j]) continue;
    candles.push({ time: c.time, close: (c.close * usd.candles[j].close) / TROY_OUNCE_GRAMS, volume: null });
  }
  return { candles, currency: "TRY" };
}

/** Fon: TEFAS günlük fiyatları (~3 yıl; 0 fiyatlar atlanır). Hacim yok. */
async function fundCandles(code: string): Promise<CandleSet> {
  const f = await fetchFundPrices(code, 36);
  return { candles: f.history.map((p) => ({ time: Math.floor(fundDateMs(p.date) / 1000), close: p.price, volume: null })), currency: "TRY" };
}

/** Sikke / bilezik: gram altın mumları güncel fiyat oranıyla ölçeklenir (yaklaşık). */
async function goldKindCandles(symbol: string): Promise<CandleSet> {
  const kind = goldKind(symbol);
  const [gram, quotes] = await Promise.all([gramGoldCandles(), getQuotes([{ type: "gold", symbol: GOLD_SYMBOL }, { type: "gold", symbol }])]);
  const ratio = quotes[0].price && quotes[1].price ? quotes[1].price / quotes[0].price : (kind?.grams ?? 1) * (kind?.purity ?? 1);
  return { candles: gram.candles.map((c) => ({ ...c, close: c.close * ratio })), currency: "TRY" };
}

/** Günlük mumlar (önbellekli, eskiden yeniye). Kaynak yanıt vermezse hata fırlatır. */
export async function getDailyCandles(type: AssetType, symbol: string, opts: { force?: boolean } = {}): Promise<CandleSet> {
  const key = instrumentId(type, symbol);
  const hit = cache.get(key);
  if (!opts.force && hit && Date.now() - hit.at < CANDLE_TTL_MS) return hit.data;
  let data: CandleSet;
  if (type === "crypto") data = await binanceCandles(symbol);
  else if (type === "fund") data = await fundCandles(symbol);
  else if (type === "gold") data = symbol === GOLD_SYMBOL ? await gramGoldCandles() : await goldKindCandles(symbol);
  else data = await yahooCandles(yahooSymbolFor(type, symbol)!);
  // Sıralı ve tekrarsız
  const byTime = new Map<number, Candle>();
  for (const c of data.candles) byTime.set(c.time, c);
  data = { ...data, candles: [...byTime.values()].sort((a, b) => a.time - b.time) };
  if (data.candles.length > 0) cache.set(key, { at: Date.now(), data });
  return data;
}

// ---- Analiz -------------------------------------------------------------------

export interface Pt {
  time: number;
  value: number;
}

export interface TechnicalAnalysis {
  instrument: string;
  assetType: AssetType;
  symbol: string;
  name: string;
  currency: string;
  /** Son mumun zamanı (Unix saniye) */
  asOf: number | null;
  snapshot: TechnicalSnapshot;
  summary: SignalSummary;
  labelExplain: string;
  indicators: IndicatorRow[];
  /** Grafik katmanları (yalnızca istenirse) */
  overlays?: { sma50: Pt[]; sma200: Pt[]; bbUpper: Pt[]; bbLower: Pt[]; rsi: Pt[] };
}

const toPts = (times: number[], s: Series): Pt[] => {
  const out: Pt[] = [];
  for (let i = 0; i < s.length; i++) if (s[i] != null) out.push({ time: times[i], value: s[i] as number });
  return out;
};

/** Mumlardan göstergeleri ve sinyali hesaplar (ağ çağrısı yok). */
export function analyzeCandles(candles: Candle[], withOverlays = false, lastPartial = false) {
  const closes = candles.map((c) => c.close);
  const n = closes.length;
  const s20 = sma(closes, 20);
  const s50 = sma(closes, 50);
  const s200 = sma(closes, 200);
  const r = rsi(closes, 14);
  const m = macd(closes, 12, 26, 9);
  const bb = bollinger(closes, 20, 2);
  const prev = n >= 2 ? closes[n - 2] : null;
  const snapshot: TechnicalSnapshot = {
    bars: n,
    close: closes[n - 1] ?? 0,
    changePct: prev ? ((closes[n - 1] - prev) / prev) * 100 : null,
    sma20: last(s20),
    sma50: last(s50),
    sma200: last(s200),
    ema20: last(ema(closes, 20)),
    ema50: last(ema(closes, 50)),
    ema200: last(ema(closes, 200)),
    rsi: last(r),
    macd: last(m.macd),
    macdSignal: last(m.signal),
    macdHist: last(m.histogram),
    macdCross: recentCross(m.macd, m.signal, RULES.macd.crossLookback + 1),
    bbUpper: last(bb.upper),
    bbMiddle: last(bb.middle),
    bbLower: last(bb.lower),
    smaCross: recentCross(s50, s200, RULES.goldenCross.lookback + 1),
    volumeRatio: volumeRatio(candles.map((c) => c.volume), 20),
    volumePartial: lastPartial && candles[n - 1]?.volume != null,
  };
  const summary = evaluateSignals(snapshot);
  const times = candles.map((c) => c.time);
  const overlays = withOverlays
    ? { sma50: toPts(times, s50), sma200: toPts(times, s200), bbUpper: toPts(times, bb.upper), bbLower: toPts(times, bb.lower), rsi: toPts(times, r) }
    : undefined;
  return { snapshot, summary, overlays };
}

/** Bir varlığın teknik analizi. Veri alınamazsa hata fırlatır. */
export async function getTechnicalAnalysis(
  type: AssetType,
  symbol: string,
  opts: { overlays?: boolean; force?: boolean; name?: string | null } = {},
): Promise<TechnicalAnalysis> {
  const { candles, currency, lastPartial } = await getDailyCandles(type, symbol, { force: opts.force });
  if (candles.length === 0) throw new Error("Günlük fiyat verisi alınamadı.");
  const { snapshot, summary, overlays } = analyzeCandles(candles, !!opts.overlays, !!lastPartial);
  return {
    instrument: instrumentId(type, symbol),
    assetType: type,
    symbol,
    name: opts.name ?? displaySymbol(type, symbol),
    currency,
    asOf: candles[candles.length - 1]?.time ?? null,
    snapshot,
    summary,
    labelExplain: summary.insufficient ?? LABEL_EXPLAIN[summary.label],
    indicators: indicatorRows(snapshot),
    overlays,
  };
}

// ---- Tüm varlıklar (Sinyaller sayfası) -------------------------------------------

export type SignalSource = "gerçek" | "sanal" | "izleme";

export interface SignalRow {
  instrument: string;
  assetType: AssetType;
  symbol: string;
  name: string;
  sources: SignalSource[];
  label: SignalLabel | null;
  score: number | null;
  rsi: number | null;
  close: number | null;
  changePct: number | null;
  currency: string | null;
  /** En etkili neden (kısa) */
  topReason: string | null;
  insufficient: string | null;
  error: string | null;
}

/** Gerçek + sanal pozisyonlar ve izleme listesindeki varlıklar (tekrarsız). */
export async function collectSignalAssets(): Promise<{ assetType: AssetType; symbol: string; name: string; sources: SignalSource[] }[]> {
  const map = new Map<string, { assetType: AssetType; symbol: string; name: string; sources: SignalSource[] }>();
  const add = (assetType: AssetType, symbol: string, src: SignalSource, name?: string | null) => {
    const id = instrumentId(assetType, symbol);
    const e = map.get(id) ?? { assetType, symbol, name: name || displaySymbol(assetType, symbol), sources: [] };
    if (!e.sources.includes(src)) e.sources.push(src);
    map.set(id, e);
  };
  for (const mode of ["real", "virtual"] as const) {
    try {
      const p = await getPortfolio(mode);
      for (const h of p.holdings) add(h.assetType, h.symbol, mode === "real" ? "gerçek" : "sanal");
    } catch (err) {
      console.error("[teknik] portföy okunamadı", err);
    }
  }
  for (const w of (await listWatchlist())) add(w.assetType, w.symbol, "izleme", w.name);
  return [...map.values()];
}

/** Sınırlı eşzamanlılıkla eşleme */
async function mapLimit<T, R>(items: T[], limit: number, fn: (t: T) => Promise<R>): Promise<R[]> {
  const out = new Array<R>(items.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, async () => {
      while (next < items.length) {
        const i = next++;
        out[i] = await fn(items[i]);
      }
    }),
  );
  return out;
}

export async function computeSignalRows(
  assets: { assetType: AssetType; symbol: string; name: string; sources: SignalSource[] }[],
  opts: { force?: boolean } = {},
): Promise<SignalRow[]> {
  return mapLimit(assets, 4, async (a) => {
    const base = { instrument: instrumentId(a.assetType, a.symbol), assetType: a.assetType, symbol: a.symbol, name: a.name, sources: a.sources };
    try {
      const t = await getTechnicalAnalysis(a.assetType, a.symbol, { force: opts.force });
      return {
        ...base,
        label: t.summary.label,
        score: t.summary.score,
        rsi: t.snapshot.rsi,
        close: t.snapshot.close,
        changePct: t.snapshot.changePct,
        currency: t.currency,
        topReason: t.summary.reasons[0]?.title ?? null,
        insufficient: t.summary.insufficient,
        error: null,
      };
    } catch (err) {
      console.warn(`[teknik] ${base.instrument}:`, (err as Error).message);
      return { ...base, label: null, score: null, rsi: null, close: null, changePct: null, currency: null, topReason: null, insufficient: null, error: "Veri alınamadı." };
    }
  });
}

/** Sinyaller sayfası: tüm pozisyon ve izleme listesi varlıklarının güncel sinyali */
export async function listSignals(): Promise<SignalRow[]> {
  return computeSignalRows(await collectSignalAssets());
}

/** Haber analizi istemi için kısa teknik özet satırları (instrument → metin). Hata fırlatmaz. */
export async function technicalContext(assets: { assetType: AssetType; symbol: string }[], timeoutMs = 20_000): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  const job = mapLimit(assets, 4, async (a) => {
    try {
      const t = await getTechnicalAnalysis(a.assetType, a.symbol);
      const s = t.snapshot;
      const parts = [`teknik sinyal ${t.summary.label} (puan ${t.summary.score > 0 ? "+" : ""}${t.summary.score})`];
      if (s.rsi != null) parts.push(`RSI ${s.rsi.toFixed(0)}`);
      const reasons = t.summary.reasons.slice(0, 3).map((r) => r.title);
      if (reasons.length) parts.push(reasons.join(", "));
      if (t.summary.insufficient) parts.push("veri az");
      out.set(t.instrument, parts.join("; "));
    } catch {
      // teknik veri yoksa satır eklenmez
    }
  });
  await Promise.race([job, new Promise((r) => setTimeout(r, timeoutMs).unref?.())]);
  return out;
}

// ---- Günlük sinyal değişimi uyarısı -------------------------------------------------

/** Günlük kontrolün saati (İstanbul). BIST kapanışından sonra; kripto/ABD için o anki veri kullanılır. */
export const SIGNAL_CHECK_TIME = "19:00";

function istanbulParts(now: Date) {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/Istanbul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(now);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  return { date: `${get("year")}-${get("month")}-${get("day")}`, minutes: Number(get("hour")) * 60 + Number(get("minute")) };
}

export interface SignalChange {
  instrument: string;
  name: string;
  from: SignalLabel;
  to: SignalLabel;
  score: number;
}

/**
 * Yeni sinyalleri technical_signals tablosuna yazar; önceki kayıttan farklı olanlar
 * için bildirim + push üretir ve değişiklikleri döndürür. İlk kez görülen varlıkta
 * bildirim yapılmaz (yalnızca kaydedilir).
 */
export async function recordSignals(rows: SignalRow[], date: string): Promise<SignalChange[]> {
  const db = await getDb();
  const uid = await getCurrentUserId();
  const changes: SignalChange[] = [];

  for (const r of rows) {
    if (!r.label || r.score == null || r.insufficient) continue;
    const prev = await db.get<{ label: SignalLabel }>("SELECT label FROM technical_signals WHERE user_id = ? AND instrument = ?", [uid, r.instrument]);
    await db.run(
      `INSERT INTO technical_signals (user_id, instrument, label, score, checked_date, updated_at) VALUES (?, ?, ?, ?, ?, ?)
       ON CONFLICT(user_id, instrument) DO UPDATE SET label = excluded.label, score = excluded.score, checked_date = excluded.checked_date, updated_at = excluded.updated_at`,
      [uid, r.instrument, r.label, Math.round(r.score), date, sqlNow()],
    );
    if (prev && prev.label !== r.label) changes.push({ instrument: r.instrument, name: r.name, from: prev.label, to: r.label, score: r.score });
  }
  for (const c of changes) {
    const n = {
      kind: "signal_change",
      title: `Teknik sinyal değişti: ${c.name}`,
      body: `${c.from} → ${c.to} (puan ${c.score > 0 ? "+" : ""}${c.score}). Teknik sinyaller geçmiş fiyatlara dayanır, yatırım tavsiyesi değildir.`,
      data: c,
    };
    await addNotification(n);
    background(() => sendPushToAll({ title: n.title, body: n.body, url: `/piyasa/detay?id=${encodeURIComponent(c.instrument)}`, tag: `sinyal-${c.instrument}` }));
  }
  return changes;
}

/** Kontrolü süren kullanıcılar */
const gs = globalThis as unknown as { __yatirimSignalRunning?: Set<number> };
const signalRunning = () => (gs.__yatirimSignalRunning ??= new Set());

export type SignalAlertResult =
  | { ran: true; checked: number; changes: SignalChange[] }
  | { ran: false; reason: "kapali" | "zamani_degil" | "zaten_calisti" | "mesgul" | "hata" };

/**
 * Emir izleyici döngüsünden çağrılır. Her gün SIGNAL_CHECK_TIME'dan (İstanbul)
 * sonra bir kez çalışır: bellek bayrağı + scheduled_runs birincil anahtarı ile
 * çift çalışma engellenir.
 */
export async function maybeRunSignalAlerts(now = new Date()): Promise<SignalAlertResult> {
  if (!(await getSignalAlertsEnabled())) return { ran: false, reason: "kapali" };
  const p = istanbulParts(now);
  const [h, m] = SIGNAL_CHECK_TIME.split(":").map(Number);
  if (p.minutes < h * 60 + m) return { ran: false, reason: "zamani_degil" };
  const uid = await getCurrentUserId();
  if (signalRunning().has(uid)) return { ran: false, reason: "mesgul" };
  const slot = `u${uid} teknik ${p.date}`;
  const claim = await (await getDb()).run("INSERT INTO scheduled_runs (slot, created_at) VALUES (?, ?) ON CONFLICT DO NOTHING", [slot, sqlNow()]);
  if (Number(claim.changes) !== 1) return { ran: false, reason: "zaten_calisti" };
  signalRunning().add(uid);
  try {
    const rows = await computeSignalRows(await collectSignalAssets(), { force: true });
    const changes = await recordSignals(rows, p.date);
    console.log(`[teknik] ${slot}: ${rows.length} varlık kontrol edildi, ${changes.length} sinyal değişti`);
    return { ran: true, checked: rows.length, changes };
  } catch (err) {
    console.error("[teknik] günlük kontrol hatası", err);
    return { ran: false, reason: "hata" };
  } finally {
    signalRunning().delete(uid);
  }
}
