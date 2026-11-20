// Getiri ve risk hesapları (saf, testli). Sunucu servisi analytics.ts bunları kullanır.

// ---- Zaman ağırlıklı getiri (TWR) ----------------------------------------------------------

export interface DayValue {
  /** YYYY-MM-DD */
  date: string;
  /** Gün sonu portföy değeri (TL) */
  value: number;
}

export interface CashFlow {
  date: string;
  /** Portföye giren net para (alış +, satış −), TL */
  amount: number;
}

export interface IndexPoint {
  date: string;
  /** Başlangıç = 100 */
  value: number;
}

/**
 * Nakit akışından arındırılmış (zaman ağırlıklı) getiri endeksi, başlangıç 100.
 * Her dönem: r = (V_t − CF_t) / V_{t−1} − 1. CF_t, önceki kayıttan sonra ve t günü dahil
 * yapılan net alış/satışlardır (para eklemek getiri sayılmasın diye çıkarılır).
 * Önceki değeri 0 olan dönem (boş portföy) atlanır: endeks değişmez.
 */
export function twrIndex(values: DayValue[], flows: CashFlow[]): IndexPoint[] {
  const sorted = [...values].sort((a, b) => (a.date < b.date ? -1 : 1));
  if (sorted.length === 0) return [];
  const out: IndexPoint[] = [{ date: sorted[0].date, value: 100 }];
  let idx = 100;
  for (let i = 1; i < sorted.length; i++) {
    const prev = sorted[i - 1];
    const cur = sorted[i];
    const cf = flows.filter((f) => f.date > prev.date && f.date <= cur.date).reduce((s, f) => s + f.amount, 0);
    if (prev.value > 0) {
      const r = (cur.value - cf) / prev.value - 1;
      if (Number.isFinite(r) && r > -1) idx *= 1 + r;
    }
    out.push({ date: cur.date, value: idx });
  }
  return out;
}

/** Günlük getiriler (TWR endeksinden) */
export function dailyReturns(index: IndexPoint[]): number[] {
  const out: number[] = [];
  for (let i = 1; i < index.length; i++) if (index[i - 1].value > 0) out.push(index[i].value / index[i - 1].value - 1);
  return out;
}

/** Bir kapanış serisini verilen tarihlere göre 100'e endeksler (o güne kadarki son kapanış). */
export function rebase(closes: { date: string; close: number }[], dates: string[]): (number | null)[] {
  const sorted = [...closes].sort((a, b) => (a.date < b.date ? -1 : 1));
  const at = (d: string) => {
    let v: number | null = null;
    for (const c of sorted) {
      if (c.date > d) break;
      v = c.close;
    }
    return v;
  };
  const base = dates.length ? at(dates[0]) ?? sorted.find((c) => c.date >= dates[0])?.close ?? null : null;
  return dates.map((d) => {
    const v = at(d);
    return base && v ? (v / base) * 100 : null;
  });
}

/** Basit getiri (%): ilk tarihten son değere */
export function returnSince(closes: { date: string; close: number }[], since: string): number | null {
  const sorted = [...closes].sort((a, b) => (a.date < b.date ? -1 : 1));
  let start: number | null = null;
  for (const c of sorted) {
    if (c.date > since) break;
    start = c.close;
  }
  start ??= sorted.find((c) => c.date >= since)?.close ?? null;
  const last = sorted[sorted.length - 1]?.close ?? null;
  return start && last ? (last / start - 1) * 100 : null;
}

// ---- Risk ---------------------------------------------------------------------------------

export interface RiskHolding {
  name: string;
  assetType: string;
  /** Fiyat para birimi (TRY, USD, …) */
  currency: string;
  valueTry: number;
}

export interface RiskMetrics {
  totalTry: number;
  largest: { name: string; pct: number } | null;
  top3Pct: number;
  assetTypeCount: number;
  positionCount: number;
  /** TL dışı para birimindeki varlıkların payı (%) */
  foreignCurrencyPct: number;
  tryPct: number;
  /** Herfindahl endeksi (0–1) ve 0–100 yoğunlaşma puanı */
  hhi: number;
  concentrationScore: number;
  concentrationLabel: "iyi dağılmış" | "orta" | "yoğun";
  /** Yıllıklandırılmış oynaklık (%), yeterli veri yoksa null */
  volatilityPct: number | null;
  volatilityDays: number;
}

export const MIN_VOL_DAYS = 10;

export function stdev(xs: number[]): number | null {
  if (xs.length < 2) return null;
  const m = xs.reduce((s, x) => s + x, 0) / xs.length;
  return Math.sqrt(xs.reduce((s, x) => s + (x - m) ** 2, 0) / (xs.length - 1));
}

export function riskMetrics(holdings: RiskHolding[], returns: number[]): RiskMetrics {
  const list = holdings.filter((h) => h.valueTry > 0).sort((a, b) => b.valueTry - a.valueTry);
  const total = list.reduce((s, h) => s + h.valueTry, 0);
  const w = list.map((h) => (total > 0 ? h.valueTry / total : 0));
  const hhi = w.reduce((s, x) => s + x * x, 0);
  const score = Math.round(hhi * 100);
  const foreign = list.filter((h) => h.currency !== "TRY").reduce((s, h) => s + h.valueTry, 0);
  const sd = returns.length >= MIN_VOL_DAYS ? stdev(returns) : null;
  return {
    totalTry: total,
    largest: list[0] && total > 0 ? { name: list[0].name, pct: (list[0].valueTry / total) * 100 } : null,
    top3Pct: total > 0 ? (w.slice(0, 3).reduce((s, x) => s + x, 0) * 100) : 0,
    assetTypeCount: new Set(list.map((h) => h.assetType)).size,
    positionCount: list.length,
    foreignCurrencyPct: total > 0 ? (foreign / total) * 100 : 0,
    tryPct: total > 0 ? ((total - foreign) / total) * 100 : 0,
    hhi,
    concentrationScore: score,
    concentrationLabel: score < 25 ? "iyi dağılmış" : score <= 50 ? "orta" : "yoğun",
    volatilityPct: sd == null ? null : sd * Math.sqrt(252) * 100,
    volatilityDays: returns.length,
  };
}

// ---- Hedef dağılım ve dengeleme ----------------------------------------------------------

export interface DriftRow {
  key: string;
  actualPct: number;
  targetPct: number;
  /** actual − target (yüzde puan) */
  driftPct: number;
  /** Hedefe ulaşmak için eklenmesi (+) ya da azaltılması (−) gereken TL */
  adjustTry: number;
}

/**
 * Hedef dağılıma göre sapma ve dengeleme tutarları. Hedefler yüzde (toplam 100 olmalı);
 * hedefi olmayan ama portföyde bulunan tür hedef 0 sayılır.
 */
export function rebalance(actual: Record<string, number>, target: Record<string, number>): DriftRow[] {
  const total = Object.values(actual).reduce((s, v) => s + v, 0);
  const keys = [...new Set([...Object.keys(target), ...Object.keys(actual)])];
  return keys
    .map((key) => {
      const a = actual[key] ?? 0;
      const t = target[key] ?? 0;
      const actualPct = total > 0 ? (a / total) * 100 : 0;
      return { key, actualPct, targetPct: t, driftPct: actualPct - t, adjustTry: (t / 100) * total - a };
    })
    .sort((x, y) => Math.abs(y.driftPct) - Math.abs(x.driftPct));
}
