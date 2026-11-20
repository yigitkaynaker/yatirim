// Pozisyon hesabı (ağırlıklı ortalama maliyet) ve TL K/Z'nin "fiyat etkisi" /
// "kur etkisi" ayrımı. Saf fonksiyonlar: veritabanı ve ağ yok (birim testlenir).
//
// TL maliyet ve gerçekleşen TL K/Z, her işlemin KENDİ tarihindeki kurla
// (transactions.fx_try) hesaplanır; güncel TL değer bugünkü kurla. Böylece
// dolar cinsinden bir varlıkta TL K/Z, alıştan bu yana kurdaki değişimi de içerir.

import { instrumentId, type AssetType, type Side } from "./assets";

export interface PositionTx {
  id: number;
  assetType: AssetType;
  symbol: string;
  side: Side;
  quantity: number;
  price: number;
  currency: string;
  date: string;
  /** İşlem para biriminin işlem tarihindeki TRY kuru (TRY için 1). Bilinmiyorsa null. */
  fxTry: number | null;
}

export interface Position {
  assetType: AssetType;
  symbol: string;
  quantity: number;
  /** Maliyet tabanı, para birimine göre (karma para birimli işlemler için) */
  costBy: Map<string, number>;
  /** Gerçekleşen K/Z, para birimine göre */
  realizedBy: Map<string, number>;
  /** Maliyet tabanının işlem tarihi kurlarıyla TL karşılığı */
  costTry: number;
  /** Gerçekleşen K/Z, işlem tarihi kurlarıyla TL */
  realizedTry: number;
  /** Kuru bilinmeyen (geçici olarak güncel kur kullanılan) işlem var mı */
  fxEstimated: boolean;
  /** Mevcut pozisyonun açıldığı tarih (tamamen satılıp yeniden alınırsa sıfırlanır) */
  firstDate: string;
}

type Seq = { date: string; id: number };
export function bySequence(a: Seq, b: Seq) {
  return a.date === b.date ? a.id - b.id : a.date < b.date ? -1 : 1;
}

/**
 * Ağırlıklı ortalama maliyet yöntemiyle pozisyonları çıkarır.
 * `currentRate`: kuru bilinmeyen işlemler için yedek (bugünkü kur); o da yoksa
 * TL maliyet NaN olur ve çağıran "hesaplanamadı" sayar.
 */
export function buildPositions(txs: PositionTx[], currentRate: (cur: string) => number | null): Position[] {
  const map = new Map<string, Position>();
  for (const t of [...txs].sort(bySequence)) {
    const key = instrumentId(t.assetType, t.symbol);
    let p = map.get(key);
    if (!p) {
      p = {
        assetType: t.assetType,
        symbol: t.symbol,
        quantity: 0,
        costBy: new Map(),
        realizedBy: new Map(),
        costTry: 0,
        realizedTry: 0,
        fxEstimated: false,
        firstDate: t.date,
      };
      map.set(key, p);
    }
    let fx = t.currency === "TRY" ? 1 : t.fxTry;
    if (fx == null || !(fx > 0)) {
      fx = currentRate(t.currency) ?? NaN;
      p.fxEstimated = true;
    }
    const gross = t.quantity * t.price;
    if (t.side === "buy") {
      if (p.quantity <= 1e-12) p.firstDate = t.date;
      p.quantity += t.quantity;
      p.costBy.set(t.currency, (p.costBy.get(t.currency) ?? 0) + gross);
      p.costTry += gross * fx;
    } else {
      const ratio = p.quantity > 0 ? Math.min(t.quantity / p.quantity, 1) : 0;
      // Satılan kısmın maliyeti her para biriminden orantılı düşülür.
      for (const [cur, c] of p.costBy) {
        const removed = c * ratio;
        p.costBy.set(cur, c - removed);
        p.realizedBy.set(cur, (p.realizedBy.get(cur) ?? 0) - removed);
      }
      p.realizedBy.set(t.currency, (p.realizedBy.get(t.currency) ?? 0) + gross);
      const removedTry = p.costTry * ratio;
      p.costTry -= removedTry;
      p.realizedTry += gross * fx - removedTry;
      p.quantity = Math.max(0, p.quantity - t.quantity);
    }
  }
  return [...map.values()];
}

export interface PnlBreakdown {
  /** Varlığın para biriminde maliyet (güncel kurla çevrilmiş karma maliyet) ve K/Z — kur değişiminden bağımsız */
  cost: number | null;
  value: number | null;
  pnl: number | null;
  /** TL: değer bugünkü kurla, maliyet işlem tarihi kurlarıyla */
  valueTry: number | null;
  costTry: number | null;
  pnlTry: number | null;
  /** TL K/Z'nin fiyat hareketinden gelen kısmı (bugünkü kurla) */
  priceEffectTry: number | null;
  /** TL K/Z'nin kur hareketinden gelen kısmı: maliyet × (bugünkü kur − alış kuru) */
  fxEffectTry: number | null;
}

/**
 * Bir pozisyonun değer / maliyet / K/Z hesabı.
 * `currency`: varlığın fiyat para birimi, `price`: güncel fiyat, `rate`: güncel kurlar.
 * pnlTry = priceEffectTry + fxEffectTry.
 */
export function positionPnl(
  p: Position,
  currency: string,
  price: number | null,
  rate: (cur: string) => number | null,
): PnlBreakdown {
  const fxRate = rate(currency);
  let costNowTry: number | null = 0;
  for (const [cur, v] of p.costBy) {
    if (Math.abs(v) < 1e-12) continue;
    const r = rate(cur);
    if (r == null) {
      costNowTry = null;
      break;
    }
    costNowTry += v * r;
  }
  const cost = costNowTry != null && fxRate ? costNowTry / fxRate : null;
  const value = price != null ? price * p.quantity : null;
  const valueTry = value != null && fxRate != null ? value * fxRate : null;
  const pnl = value != null && cost != null ? value - cost : null;
  const costTry = Number.isFinite(p.costTry) ? p.costTry : null;
  const pnlTry = valueTry != null && costTry != null ? valueTry - costTry : null;
  const priceEffectTry = pnl != null && fxRate != null ? pnl * fxRate : null;
  // Kayan nokta artığı (örn. 1e-13) "+0,00" diye görünmesin.
  const fxEffectTry = pnlTry != null && priceEffectTry != null ? cleanZero(pnlTry - priceEffectTry) : null;
  return { cost, value, pnl, valueTry, costTry, pnlTry, priceEffectTry, fxEffectTry };
}

const cleanZero = (v: number) => (Math.abs(v) < 1e-6 ? 0 : v);

/** Günlük mumlardan bir tarihteki (ya da öncesindeki son) kapanış. Mumlar eskiden yeniye, tarih YYYY-MM-DD. */
export function closeOnOrBefore(candles: { date: string; close: number }[], date: string): number | null {
  let found: number | null = null;
  for (const c of candles) {
    if (c.date > date) break;
    found = c.close;
  }
  return found;
}
