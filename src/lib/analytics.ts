import "server-only";
import { getDb } from "./db";
import { ASSET_TYPE_INFO, ASSET_TYPES, displaySymbol, GOLD_SYMBOL, isAssetType, type AssetType, type Mode } from "./assets";
import { activeTransactions, getPortfolio, todayIstanbul, ValidationError } from "./portfolio";
import { listSnapshots } from "./snapshots";
import { getDailyCandles } from "./technical";
import { politeFetch } from "./http";
import { getSetting, setSetting } from "./settings";
import { parseDecimal } from "./format";
import { dailyReturns, rebalance, rebase, returnSince, riskMetrics, twrIndex, type DriftRow, type RiskMetrics } from "./perfMath";

// PORTFÖY ANALİTİĞİ: kıyaslama (benchmark), risk, hedef dağılım ve piyasa duygusu.

const istanbulDate = (sec: number) => new Date(sec * 1000).toLocaleDateString("en-CA", { timeZone: "Europe/Istanbul" });

async function closes(type: AssetType, symbol: string): Promise<{ date: string; close: number }[]> {
  const set = await getDailyCandles(type, symbol);
  return set.candles.map((c) => ({ date: istanbulDate(c.time), close: c.close }));
}

// ---- Kıyaslama ---------------------------------------------------------------------------

export interface BenchmarkSeries {
  key: string;
  label: string;
  color: string;
  points: (number | null)[];
  /** Dönem getirisi (%) */
  returnPct: number | null;
}

export interface BenchmarkResult {
  mode: Mode;
  dates: string[];
  series: BenchmarkSeries[];
  /** Yeterli veri yoksa açıklama */
  note: string | null;
  firstTxDate: string | null;
}

const BENCHMARKS: { key: string; label: string; color: string; type: AssetType; symbol: string }[] = [
  { key: "bist100", label: "BIST 100", color: "#38bdf8", type: "bist", symbol: "XU100" },
  { key: "usd", label: "Dolar", color: "#34d399", type: "fx", symbol: "USD" },
  { key: "gold", label: "Gram altın", color: "#facc15", type: "gold", symbol: GOLD_SYMBOL },
];

/** Gün başına net nakit akışı (TL): alış +, satış − (işlem tarihi kuruyla). */
function cashFlows(mode: Mode) {
  return activeTransactions(mode).map((t) => ({
    date: t.date,
    amount: (t.side === "buy" ? 1 : -1) * t.quantity * t.price * (t.currency === "TRY" ? 1 : (t.fxTry ?? 1)),
  }));
}

/**
 * "Portföyüm vs BIST 100 / Dolar / Gram altın": ilk işlem (ve ilk günlük kayıt) tarihinden
 * itibaren 100'e endeksli. Portföy çizgisi nakit akışından arındırılmış (zaman ağırlıklı)
 * getiridir: para eklemek/çekmek getiri sayılmaz.
 */
export async function getBenchmark(mode: Mode): Promise<BenchmarkResult> {
  const txs = activeTransactions(mode);
  const firstTxDate = txs.length ? txs.map((t) => t.date).sort()[0] : null;
  const snaps = listSnapshots(mode).filter((s) => !firstTxDate || s.date >= firstTxDate);
  const values = snaps.map((s) => ({ date: s.date, value: s.valueTry }));
  // Bugünün değeri henüz kaydedilmediyse canlı değeri ekle
  try {
    const today = todayIstanbul();
    if (values.length && values[values.length - 1].date !== today) {
      const p = await getPortfolio(mode);
      if (!p.totals.incomplete && p.holdings.length) values.push({ date: today, value: p.totals.valueTry });
    }
  } catch {}
  const index = twrIndex(values, cashFlows(mode));
  const dates = index.map((p) => p.date);
  const series: BenchmarkSeries[] = [
    { key: "portfolio", label: "Portföyüm", color: "#a78bfa", points: index.map((p) => p.value), returnPct: index.length ? index[index.length - 1].value - 100 : null },
  ];
  await Promise.all(
    BENCHMARKS.map(async (b) => {
      try {
        const pts = rebase(await closes(b.type, b.symbol), dates);
        const last = [...pts].reverse().find((v) => v != null) ?? null;
        series.push({ key: b.key, label: b.label, color: b.color, points: pts, returnPct: last != null ? last - 100 : null });
      } catch {
        series.push({ key: b.key, label: b.label, color: b.color, points: dates.map(() => null), returnPct: null });
      }
    }),
  );
  series.sort((a, b) => ["portfolio", "bist100", "usd", "gold"].indexOf(a.key) - ["portfolio", "bist100", "usd", "gold"].indexOf(b.key));
  return {
    mode,
    dates,
    series,
    firstTxDate,
    note:
      dates.length < 2
        ? "Karşılaştırma için en az iki günlük portföy kaydı gerekir. Uygulama her gün portföy değerinizi kaydeder; birkaç gün sonra çizgiler oluşur."
        : null,
  };
}

/** Pozisyon için "aldığımdan beri": varlık vs BIST 100 (ABD hissesinde S&P 500), fiyat getirisi. */
export async function getPositionBenchmark(mode: Mode, type: AssetType, symbol: string) {
  const txs = activeTransactions(mode).filter((t) => t.assetType === type && t.symbol === symbol && t.side === "buy");
  const since = txs.map((t) => t.date).sort()[0];
  if (!since) return null;
  const bench = type === "foreign" ? { label: "S&P 500", type: "foreign" as const, symbol: "^GSPC" } : { label: "BIST 100", type: "bist" as const, symbol: "XU100" };
  const [asset, b] = await Promise.all([closes(type, symbol).catch(() => []), closes(bench.type, bench.symbol).catch(() => [])]);
  return {
    since,
    asset: { label: displaySymbol(type, symbol), returnPct: returnSince(asset, since) },
    benchmark: { label: bench.label, returnPct: returnSince(b, since) },
  };
}

// ---- Risk ve hedef dağılım ---------------------------------------------------------------

export interface RiskResult {
  mode: Mode;
  metrics: RiskMetrics;
  allocation: { key: AssetType; label: string; valueTry: number }[];
  target: Partial<Record<AssetType, number>> | null;
  drift: (DriftRow & { label: string })[];
}

const TARGET_KEY = "target_allocation";

export function getTargetAllocation(): Partial<Record<AssetType, number>> | null {
  const raw = getSetting(TARGET_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as Partial<Record<AssetType, number>>;
  } catch {
    return null;
  }
}

/** Hedef dağılımı kaydeder: { bist: 40, gold: 20, … } toplam 100. null/boş → siler. */
export function setTargetAllocation(body: unknown) {
  if (body == null || (typeof body === "object" && Object.keys(body as object).length === 0)) {
    getDb().prepare("DELETE FROM settings WHERE key = ?").run(TARGET_KEY);
    return null;
  }
  if (typeof body !== "object") throw new ValidationError("Hedef dağılım geçersiz.");
  const out: Partial<Record<AssetType, number>> = {};
  let sum = 0;
  for (const [k, v] of Object.entries(body as Record<string, unknown>)) {
    if (!isAssetType(k)) throw new ValidationError(`Varlık türü geçersiz: ${k}`);
    const n = v === "" || v == null ? 0 : parseDecimal(v as string | number);
    if (!Number.isFinite(n) || n < 0 || n > 100) throw new ValidationError(`${ASSET_TYPE_INFO[k].label} için yüzde 0–100 arasında olmalı.`);
    if (n > 0) out[k] = n;
    sum += n;
  }
  if (Math.abs(sum - 100) > 0.5) throw new ValidationError(`Hedef yüzdelerin toplamı 100 olmalı (şu an ${sum.toLocaleString("tr-TR")}).`);
  setSetting(TARGET_KEY, JSON.stringify(out));
  return out;
}

export async function getRisk(mode: Mode): Promise<RiskResult> {
  const p = await getPortfolio(mode);
  const holdings = p.holdings
    .filter((h) => h.valueTry != null)
    .map((h) => ({ name: displaySymbol(h.assetType, h.symbol), assetType: h.assetType, currency: h.currency, valueTry: h.valueTry! }));
  const values = listSnapshots(mode).map((s) => ({ date: s.date, value: s.valueTry }));
  const returns = dailyReturns(twrIndex(values, cashFlows(mode)));
  const metrics = riskMetrics(holdings, returns);
  const allocation = p.allocation.map((a) => ({ key: a.assetType, label: ASSET_TYPE_INFO[a.assetType].label, valueTry: a.valueTry }));
  const target = getTargetAllocation();
  const drift = target
    ? rebalance(Object.fromEntries(allocation.map((a) => [a.key, a.valueTry])), target as Record<string, number>).map((d) => ({
        ...d,
        label: isAssetType(d.key) ? ASSET_TYPE_INFO[d.key].label : d.key,
      }))
    : [];
  return { mode, metrics, allocation, target, drift };
}

export const TARGETABLE_TYPES = ASSET_TYPES;

// ---- Piyasa duygusu (kripto Korku & Açgözlülük endeksi) ----------------------------------

export interface MarketMood {
  value: number;
  label: string;
  /** Kaynağın İngilizce sınıfı */
  classification: string;
  /** Endeksin günü (ms) */
  time: number;
  history: { time: number; value: number }[];
  fetchedAt: number;
  stale: boolean;
  source: "alternative.me";
}

const FNG_URL = "https://api.alternative.me/fng/?limit=30";
const FNG_KEY = "fng";

export function moodLabel(value: number): string {
  if (value <= 24) return "Aşırı Korku";
  if (value <= 44) return "Korku";
  if (value <= 55) return "Nötr";
  if (value <= 75) return "Açgözlülük";
  return "Aşırı Açgözlülük";
}

export function parseFng(text: string): { value: number; classification: string; time: number }[] {
  const j = JSON.parse(text) as { data?: { value?: string; value_classification?: string; timestamp?: string }[] };
  return (j.data ?? [])
    .map((d) => ({ value: Number(d.value), classification: String(d.value_classification ?? ""), time: Number(d.timestamp) * 1000 }))
    .filter((d) => Number.isFinite(d.value) && d.value >= 0 && d.value <= 100 && Number.isFinite(d.time))
    .sort((a, b) => a.time - b.time);
}

/** Günde bir kez çekilir (İstanbul günü değişince); hata olursa son bilinen değer. */
export async function getMarketMood(): Promise<MarketMood | null> {
  const db = getDb();
  const row = db.prepare("SELECT value, fetched_at FROM ext_cache WHERE key = ?").get(FNG_KEY) as { value: string; fetched_at: number } | undefined;
  const sameDay = row && new Date(row.fetched_at).toLocaleDateString("en-CA", { timeZone: "Europe/Istanbul" }) === todayIstanbul();
  let text = row?.value ?? null;
  let fetchedAt = row?.fetched_at ?? 0;
  let stale = false;
  if (!sameDay) {
    try {
      const fresh = await politeFetch("alternative.me", FNG_URL, { timeoutMs: 8_000, backoffBaseMs: 10 * 60_000 });
      if (parseFng(fresh).length === 0) throw new Error("boş veri");
      text = fresh;
      fetchedAt = Date.now();
      db.prepare("INSERT INTO ext_cache (key, value, fetched_at) VALUES (?, ?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value, fetched_at = excluded.fetched_at").run(FNG_KEY, text, fetchedAt);
    } catch (err) {
      console.warn("[duygu] alınamadı:", (err as Error).message);
      stale = true;
    }
  }
  if (!text) return null;
  const list = parseFng(text);
  const last = list[list.length - 1];
  if (!last) return null;
  return {
    value: last.value,
    label: moodLabel(last.value),
    classification: last.classification,
    time: last.time,
    history: list.map((d) => ({ time: d.time, value: d.value })),
    fetchedAt,
    stale,
    source: "alternative.me",
  };
}
