// Ders grafikleri için deterministik örnek mum verisi üreticileri.
// Veriler gerçek bir varlığa ait değildir; her açılışta aynı grafiği çizmek için
// sabit tohumlu sözde rastgele sayı üreteci kullanılır.

import type { Candle } from "./types";

/** Sabit tohumlu sözde rastgele sayı üreteci (mulberry32), 0…1 */
function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const r2 = (n: number) => Math.round(n * 100) / 100;

/** Anahtar nokta: [mum sırası, kapanış fiyatı, (isteğe bağlı) bu noktadan sonraki gürültü oranı] */
export type KeyPoint = [number, number] | [number, number, number];

export interface PathOptions {
  seed: number;
  /** Kapanışa eklenen rastgele sapma, fiyatın oranı olarak (varsayılan 0,012) */
  noise?: number;
  /** Fitil uzunluğu, fiyatın oranı olarak (varsayılan 0,008) */
  wick?: number;
  /** Ortalama hacim (varsayılan 1000) */
  volume?: number;
  /** Belirli mumlarda hacim çarpanı: [mum sırası, çarpan] */
  volumeBoost?: [number, number][];
  /** Hacmin bir aralıkta yavaşça değişmesi: [başlangıç, bitiş, başlangıç çarpanı, bitiş çarpanı] */
  volumeRamp?: [number, number, number, number][];
}

/**
 * Anahtar noktalar arasından doğrusal geçen, üzerine hafif gürültü eklenmiş mumlar üretir.
 * Örnek: [[0, 100], [30, 140], [45, 125]] → 46 mum; 30. mumda tepe, sonra düzeltme.
 */
export function pathCandles(keys: KeyPoint[], opts: PathOptions): Candle[] {
  const rand = rng(opts.seed);
  const n = keys[keys.length - 1][0] + 1;
  const out: Candle[] = [];
  const baseNoise = opts.noise ?? 0.012;
  const wick = opts.wick ?? 0.008;
  const vol = opts.volume ?? 1000;
  let prevClose = keys[0][1];
  for (let i = 0; i < n; i++) {
    let k = 0;
    while (k < keys.length - 2 && keys[k + 1][0] <= i) k++;
    const [i0, p0, nz] = keys[k];
    const [i1, p1] = keys[k + 1] ?? keys[k];
    const t = i1 === i0 ? 0 : (i - i0) / (i1 - i0);
    const target = p0 + (p1 - p0) * Math.min(1, Math.max(0, t));
    const noise = nz ?? baseNoise;
    const isKey = keys.some((kp) => kp[0] === i);
    const close = isKey ? target : target * (1 + (rand() * 2 - 1) * noise);
    const open = i === 0 ? close * (1 - 0.004) : prevClose + (close - prevClose) * (rand() * 0.25);
    const top = Math.max(open, close);
    const bottom = Math.min(open, close);
    const high = top * (1 + rand() * wick);
    const low = bottom * (1 - rand() * wick);
    let v = vol * (0.75 + rand() * 0.5);
    for (const [a, b, m0, m1] of opts.volumeRamp ?? []) {
      if (i >= a && i <= b) v *= m0 + ((m1 - m0) * (i - a)) / Math.max(1, b - a);
    }
    for (const [bi, m] of opts.volumeBoost ?? []) if (bi === i) v *= m;
    out.push({ o: r2(open), h: r2(high), l: r2(low), c: r2(close), v: Math.round(v) });
    prevClose = close;
  }
  return out;
}

/** Belirli mumların yerine elle tanımlanmış mumlar koyar (formasyon mumları için). */
export function withCandles(candles: Candle[], overrides: Record<number, Candle>): Candle[] {
  return candles.map((c, i) => {
    const o = overrides[i];
    if (!o) return c;
    return { ...o, v: o.v ?? c.v };
  });
}

/** Elle yazılmış [açılış, yüksek, düşük, kapanış, hacim?] satırlarını mumlara çevirir. */
export function rows(list: [number, number, number, number, number?][]): Candle[] {
  return list.map(([o, h, l, c, v]) => ({ o, h, l, c, v: v ?? 1000 }));
}
