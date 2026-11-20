// TEKNİK GÖSTERGE MOTORU (saf fonksiyonlar, istemci ve sunucuda kullanılabilir)
// Tüm fonksiyonlar girdiyle aynı uzunlukta dizi döndürür; hesaplanamayan
// (ısınma dönemi) noktalar null olur. Girdi: eskiden yeniye sıralı kapanışlar.
// Testler: scripts/test-indicators.ts (npm run test:indicators)

export type Series = (number | null)[];

/** Basit hareketli ortalama */
export function sma(values: number[], period: number): Series {
  const out: Series = new Array(values.length).fill(null);
  if (period <= 0) return out;
  let sum = 0;
  for (let i = 0; i < values.length; i++) {
    sum += values[i];
    if (i >= period) sum -= values[i - period];
    if (i >= period - 1) out[i] = sum / period;
  }
  return out;
}

/**
 * Üssel hareketli ortalama. İlk değer, ilk `period` değerin basit ortalamasıyla
 * başlatılır (yaygın kullanılan yöntem); sonrası α = 2 / (period + 1).
 * Girdide başta null'lar olabilir (örn. MACD çizgisi); bunlar atlanır.
 */
export function ema(values: Series | number[], period: number): Series {
  const out: Series = new Array(values.length).fill(null);
  if (period <= 0) return out;
  const k = 2 / (period + 1);
  let start = values.findIndex((v) => v != null);
  if (start < 0) return out;
  if (start + period > values.length) return out;
  let seed = 0;
  for (let i = start; i < start + period; i++) seed += values[i] as number;
  let prev = seed / period;
  start += period - 1;
  out[start] = prev;
  for (let i = start + 1; i < values.length; i++) {
    const v = values[i];
    if (v == null) continue;
    prev = v * k + prev * (1 - k);
    out[i] = prev;
  }
  return out;
}

/** RSI (Wilder yumuşatması). İlk değer `period`. indekste. */
export function rsi(values: number[], period = 14): Series {
  const out: Series = new Array(values.length).fill(null);
  if (values.length <= period) return out;
  let gain = 0;
  let loss = 0;
  for (let i = 1; i <= period; i++) {
    const d = values[i] - values[i - 1];
    if (d >= 0) gain += d;
    else loss -= d;
  }
  let avgGain = gain / period;
  let avgLoss = loss / period;
  const calc = () => (avgLoss === 0 ? (avgGain === 0 ? 50 : 100) : 100 - 100 / (1 + avgGain / avgLoss));
  out[period] = calc();
  for (let i = period + 1; i < values.length; i++) {
    const d = values[i] - values[i - 1];
    avgGain = (avgGain * (period - 1) + Math.max(d, 0)) / period;
    avgLoss = (avgLoss * (period - 1) + Math.max(-d, 0)) / period;
    out[i] = calc();
  }
  return out;
}

export interface MacdResult {
  macd: Series;
  signal: Series;
  histogram: Series;
}

/** MACD(12,26,9): MACD = EMA12 − EMA26, sinyal = MACD'nin EMA9'u, histogram = fark */
export function macd(values: number[], fast = 12, slow = 26, signalPeriod = 9): MacdResult {
  const ef = ema(values, fast);
  const es = ema(values, slow);
  const line: Series = values.map((_, i) => (ef[i] != null && es[i] != null ? (ef[i] as number) - (es[i] as number) : null));
  const signal = ema(line, signalPeriod);
  const histogram: Series = line.map((m, i) => (m != null && signal[i] != null ? m - (signal[i] as number) : null));
  return { macd: line, signal, histogram };
}

export interface BollingerResult {
  middle: Series;
  upper: Series;
  lower: Series;
}

/** Bollinger bantları: SMA(period) ± mult × standart sapma (popülasyon) */
export function bollinger(values: number[], period = 20, mult = 2): BollingerResult {
  const middle = sma(values, period);
  const upper: Series = new Array(values.length).fill(null);
  const lower: Series = new Array(values.length).fill(null);
  for (let i = period - 1; i < values.length; i++) {
    const m = middle[i] as number;
    let sq = 0;
    for (let j = i - period + 1; j <= i; j++) sq += (values[j] - m) ** 2;
    const sd = Math.sqrt(sq / period);
    upper[i] = m + mult * sd;
    lower[i] = m - mult * sd;
  }
  return { middle, upper, lower };
}

/** Son hacmin, kendinden önceki `period` günün ortalama hacmine oranı (1,5 = %50 fazla). */
export function volumeRatio(volumes: (number | null)[], period = 20): number | null {
  const n = volumes.length;
  if (n < period + 1) return null;
  const last = volumes[n - 1];
  if (last == null || !(last > 0)) return null;
  let sum = 0;
  for (let i = n - 1 - period; i < n - 1; i++) {
    const v = volumes[i];
    if (v == null || !(v > 0)) return null;
    sum += v;
  }
  return last / (sum / period);
}

/** a serisi b serisini son `lookback` mum içinde yukarı (1) / aşağı (-1) kesti mi; kesmediyse 0. */
export function recentCross(a: Series, b: Series, lookback: number): { dir: 1 | -1 | 0; barsAgo: number | null } {
  const n = Math.min(a.length, b.length);
  for (let i = n - 1; i >= Math.max(1, n - lookback); i--) {
    const a0 = a[i - 1];
    const b0 = b[i - 1];
    const a1 = a[i];
    const b1 = b[i];
    if (a0 == null || b0 == null || a1 == null || b1 == null) continue;
    if (a0 <= b0 && a1 > b1) return { dir: 1, barsAgo: n - 1 - i };
    if (a0 >= b0 && a1 < b1) return { dir: -1, barsAgo: n - 1 - i };
  }
  return { dir: 0, barsAgo: null };
}

/** Serinin son değeri (yoksa null) */
export function last(s: Series): number | null {
  return s.length ? (s[s.length - 1] ?? null) : null;
}
