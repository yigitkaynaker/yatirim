// YILLIK GETİRİ (XIRR, para ağırlıklı)
// Paranın NE ZAMAN girip çıktığını hesaba katan yıllık getiri. Nakit akışları:
// alış = eksi (cebinizden çıkan), satış / temettü = artı, bugünkü değer = artı (son akış).
// Excel'in XIRR fonksiyonuyla aynı tanım: Σ akış / (1 + r)^(gün/365) = 0.
// Saf fonksiyonlar: veritabanı ve ağ yok (birim testlenir).

export interface Flow {
  /** YYYY-MM-DD */
  date: string;
  /** TL; yatırım (alış) eksi, geri dönen para artı */
  amount: number;
}

const DAY_MS = 86_400_000;
const dayNum = (d: string) => Date.parse(`${d}T00:00:00Z`) / DAY_MS;

/** En az bu kadar günlük geçmiş olmadan yıllık getiri gösterilmez (kısa sürede yıllığa çevirmek yanıltıcıdır). */
export const XIRR_MIN_DAYS = 30;

function npv(rate: number, flows: { t: number; a: number }[]): number {
  let s = 0;
  for (const f of flows) s += f.a / Math.pow(1 + rate, f.t);
  return s;
}

function dnpv(rate: number, flows: { t: number; a: number }[]): number {
  let s = 0;
  for (const f of flows) s -= (f.t * f.a) / Math.pow(1 + rate, f.t + 1);
  return s;
}

/**
 * Para ağırlıklı yıllık getiri (ondalık; 0,12 = %12). Hesaplanamazsa null
 * (hem artı hem eksi akış yoksa ya da çözüm bulunamazsa).
 */
export function xirr(input: Flow[]): number | null {
  const list = input.filter((f) => Number.isFinite(f.amount) && Math.abs(f.amount) > 1e-9 && /^\d{4}-\d{2}-\d{2}$/.test(f.date));
  if (list.length < 2) return null;
  if (!list.some((f) => f.amount > 0) || !list.some((f) => f.amount < 0)) return null;
  const t0 = Math.min(...list.map((f) => dayNum(f.date)));
  const flows = list.map((f) => ({ t: (dayNum(f.date) - t0) / 365, a: f.amount }));
  if (flows.every((f) => f.t === 0)) return null;

  // Önce Newton (hızlı), olmazsa ikiye bölme (güvenli).
  let r = 0.1;
  for (let i = 0; i < 100; i++) {
    const v = npv(r, flows);
    const d = dnpv(r, flows);
    if (!Number.isFinite(v) || !Number.isFinite(d) || d === 0) break;
    const next = r - v / d;
    if (!Number.isFinite(next) || next <= -0.999999) break;
    if (Math.abs(next - r) < 1e-10) return Math.abs(npv(next, flows)) < 1e-4 * scale(flows) ? next : null;
    r = next;
  }
  let lo = -0.999999;
  let hi = 10;
  let flo = npv(lo, flows);
  let fhi = npv(hi, flows);
  // Çok yüksek getirilerde üst sınırı genişlet.
  for (let i = 0; i < 20 && flo * fhi > 0; i++) {
    hi *= 2;
    fhi = npv(hi, flows);
  }
  if (!Number.isFinite(flo) || !Number.isFinite(fhi) || flo * fhi > 0) return null;
  for (let i = 0; i < 300; i++) {
    const mid = (lo + hi) / 2;
    const fm = npv(mid, flows);
    if (Math.abs(fm) < 1e-9 * scale(flows) || hi - lo < 1e-12) return mid;
    if (flo * fm < 0) {
      hi = mid;
      fhi = fm;
    } else {
      lo = mid;
      flo = fm;
    }
  }
  return (lo + hi) / 2;
}

function scale(flows: { a: number }[]): number {
  return Math.max(1, ...flows.map((f) => Math.abs(f.a)));
}

/** Akışların kapsadığı gün sayısı */
export function flowSpanDays(flows: Flow[]): number {
  if (flows.length === 0) return 0;
  const ds = flows.map((f) => dayNum(f.date));
  return Math.round(Math.max(...ds) - Math.min(...ds));
}

export interface XirrResult {
  /** Yüzde (12,5 = %12,5); hesaplanamadıysa null */
  pct: number | null;
  /** Hesaplanamama ya da uyarı nedeni (kısa Türkçe) */
  note: string | null;
  days: number;
}

/** Ekranda gösterilecek yıllık getiri: kısa sürede gösterilmez. */
export function annualReturn(flows: Flow[]): XirrResult {
  const days = flowSpanDays(flows);
  if (days < XIRR_MIN_DAYS) return { pct: null, note: `Yıllık getiri için en az ${XIRR_MIN_DAYS} günlük geçmiş gerekir.`, days };
  const r = xirr(flows);
  if (r == null) return { pct: null, note: "Hesaplanamadı.", days };
  return { pct: r * 100, note: days < 365 ? "1 yıldan kısa süre yıllığa çevrildi; dalgalı olabilir." : null, days };
}

/** İşlem satırlarından TL nakit akışları (komisyon dahil). fx: işlem günü kuru, yoksa güncel kur. */
export function transactionFlows(
  txs: { side: "buy" | "sell"; quantity: number; price: number; fee?: number; currency: string; fxTry: number | null; date: string }[],
  currentRate: (cur: string) => number | null,
): Flow[] | null {
  const out: Flow[] = [];
  for (const t of txs) {
    const fx = t.currency === "TRY" ? 1 : t.fxTry && t.fxTry > 0 ? t.fxTry : currentRate(t.currency);
    if (fx == null) return null;
    const fee = t.fee && t.fee > 0 ? t.fee : 0;
    const gross = t.quantity * t.price;
    out.push({ date: t.date, amount: t.side === "buy" ? -(gross + fee) * fx : (gross - fee) * fx });
  }
  return out;
}
