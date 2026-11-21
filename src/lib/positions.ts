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
  /** Komisyon / ücret, işlem para biriminde (alışta maliyete eklenir, satışta gelirden düşülür) */
  fee?: number;
  /** Gerçek işlemin hesabı (sanalda null). Pozisyonlar hesap başına ayrı tutulur. */
  accountId?: number | null;
}

/** Bir satışın gerçekleşen sonucu (yıllık rapor için), TL işlem günü kuruyla */
export interface SaleEvent {
  date: string;
  quantity: number;
  /** Satış geliri (komisyon düşülmüş) */
  proceedsTry: number;
  /** Satılan kısmın maliyeti (alış komisyonları dahil) */
  costTry: number;
  realizedTry: number;
  /** Bu satışın komisyonu */
  feeTry: number;
}

export interface Position {
  accountId: number | null;
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
  /** Ödenen tüm komisyonlar (alış + satış), işlem günü kuruyla TL */
  feesTry: number;
  /** Satışlar (tarih sırasıyla) */
  sales: SaleEvent[];
}

/** Pozisyon anahtarı: hesap + enstrüman */
export function positionKey(accountId: number | null | undefined, assetType: AssetType, symbol: string): string {
  return `${accountId ?? ""}|${instrumentId(assetType, symbol)}`;
}

type Seq = { date: string; id: number };
export function bySequence(a: Seq, b: Seq) {
  return a.date === b.date ? a.id - b.id : a.date < b.date ? -1 : 1;
}

/**
 * Ağırlıklı ortalama maliyet yöntemiyle pozisyonları çıkarır (hesap başına ayrı).
 * Komisyon alışta maliyete eklenir, satışta satış gelirinden düşülür.
 * `currentRate`: kuru bilinmeyen işlemler için yedek (bugünkü kur); o da yoksa
 * TL maliyet NaN olur ve çağıran "hesaplanamadı" sayar.
 */
export function buildPositions(txs: PositionTx[], currentRate: (cur: string) => number | null): Position[] {
  const map = new Map<string, Position>();
  for (const t of [...txs].sort(bySequence)) {
    const key = positionKey(t.accountId, t.assetType, t.symbol);
    let p = map.get(key);
    if (!p) {
      p = {
        accountId: t.accountId ?? null,
        assetType: t.assetType,
        symbol: t.symbol,
        quantity: 0,
        costBy: new Map(),
        realizedBy: new Map(),
        costTry: 0,
        realizedTry: 0,
        fxEstimated: false,
        firstDate: t.date,
        feesTry: 0,
        sales: [],
      };
      map.set(key, p);
    }
    let fx = t.currency === "TRY" ? 1 : t.fxTry;
    if (fx == null || !(fx > 0)) {
      fx = currentRate(t.currency) ?? NaN;
      p.fxEstimated = true;
    }
    const fee = t.fee && t.fee > 0 ? t.fee : 0;
    const gross = t.quantity * t.price;
    p.feesTry += fee * fx;
    if (t.side === "buy") {
      if (p.quantity <= 1e-12) p.firstDate = t.date;
      p.quantity += t.quantity;
      p.costBy.set(t.currency, (p.costBy.get(t.currency) ?? 0) + gross + fee);
      p.costTry += (gross + fee) * fx;
    } else {
      const net = gross - fee;
      const ratio = p.quantity > 0 ? Math.min(t.quantity / p.quantity, 1) : 0;
      // Satılan kısmın maliyeti her para biriminden orantılı düşülür.
      for (const [cur, c] of p.costBy) {
        const removed = c * ratio;
        p.costBy.set(cur, c - removed);
        p.realizedBy.set(cur, (p.realizedBy.get(cur) ?? 0) - removed);
      }
      p.realizedBy.set(t.currency, (p.realizedBy.get(t.currency) ?? 0) + net);
      const removedTry = p.costTry * ratio;
      p.costTry -= removedTry;
      p.realizedTry += net * fx - removedTry;
      p.sales.push({ date: t.date, quantity: t.quantity, proceedsTry: net * fx, costTry: removedTry, realizedTry: net * fx - removedTry, feeTry: fee * fx });
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

export interface DayChange {
  /** Bugünkü (son seans) değişim, TL */
  changeTry: number;
  /** Değişimin dayanağı: dünkü kapanış değeri + bugün yapılan alışların maliyeti, TL */
  baseTry: number;
}

/**
 * Bir pozisyonun "bugün" değişimi (TL). Dünkü kapanışa göre hesaplanır:
 * - seans gününden önce elde olan miktar: adet × (güncel fiyat × kur − önceki kapanış × önceki kur)
 * - bugün alınanlar: adet × (güncel değer − alış fiyatı), bugün satılanlar: satış fiyatı − önceki kapanış.
 * `sessionDate`: fiyatın ait olduğu gün (YYYY-MM-DD). Fiyat / önceki kapanış / kur yoksa null.
 */
export function dayChange(
  txs: PositionTx[],
  sessionDate: string,
  price: number | null,
  prevClose: number | null,
  rate: number | null,
  prevRate: number | null,
  currentRate: (cur: string) => number | null,
): DayChange | null {
  if (price == null || prevClose == null || rate == null || prevRate == null || !(prevClose > 0)) return null;
  const now = price * rate;
  const prev = prevClose * prevRate;
  let qtyStart = 0;
  let change = 0;
  let base = 0;
  for (const t of [...txs].sort(bySequence)) {
    if (t.date < sessionDate) {
      qtyStart = Math.max(0, qtyStart + (t.side === "buy" ? t.quantity : -t.quantity));
      continue;
    }
    // Fiyatın ait olduğu seanstan SONRA yapılan işlem (örn. hafta sonu / seans açılmadan girilen
    // alış) o seansın hareketine katılmadı: "bugün" hesabına girmez.
    if (t.date > sessionDate) continue;
    const fx = t.currency === "TRY" ? 1 : t.fxTry && t.fxTry > 0 ? t.fxTry : currentRate(t.currency);
    if (fx == null) return null;
    const txValue = t.price * fx;
    if (t.side === "buy") {
      change += t.quantity * (now - txValue);
      base += t.quantity * txValue;
    } else {
      change -= t.quantity * (now - txValue);
    }
  }
  change += qtyStart * (now - prev);
  base += qtyStart * prev;
  return { changeTry: cleanZero(change), baseTry: base };
}
