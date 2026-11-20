// Temettü (kâr payı) hak ediş mantığı. Saf fonksiyonlar (birim testlenir: npm run test:sources).
//
// Kural: kâr payını, hak kullanım (ex-dividend) tarihinden ÖNCEKİ günün sonunda
// elde tutulan pay sahibi alır. Yani tarihi < hak kullanım tarihi olan alış/satış
// işlemleri sayılır; o gün yapılan alış hak kazandırmaz, o gün yapılan satış
// hakkı kaybettirmez.

import type { Side } from "./assets";

export interface HoldingTx {
  id: number;
  side: Side;
  quantity: number;
  /** YYYY-MM-DD */
  date: string;
}

export interface DividendEvent {
  /** Hak kullanım (ex-dividend) tarihi, YYYY-MM-DD */
  date: string;
  /** Pay başına brüt tutar, varlığın para biriminde */
  amount: number;
}

export interface EligibleDividend extends DividendEvent {
  /** Hak kullanım tarihinden önceki gün elde tutulan adet */
  quantity: number;
  /** quantity × amount */
  total: number;
}

/** Verilen tarihten ÖNCEKİ günün sonunda elde tutulan miktar (tarih dahil değil). */
export function quantityHeldBefore(txs: HoldingTx[], date: string): number {
  let qty = 0;
  const sorted = [...txs].sort((a, b) => (a.date === b.date ? a.id - b.id : a.date < b.date ? -1 : 1));
  for (const t of sorted) {
    if (t.date >= date) break;
    qty += t.side === "buy" ? t.quantity : -t.quantity;
    if (qty < 0) qty = 0;
  }
  return qty < 1e-9 ? 0 : qty;
}

/**
 * İşlem geçmişine göre hak edilen kâr payları. Bugünden sonraki (henüz
 * gerçekleşmemiş) ve tutarı geçersiz olan olaylar atlanır.
 */
export function eligibleDividends(txs: HoldingTx[], events: DividendEvent[], today: string): EligibleDividend[] {
  const out: EligibleDividend[] = [];
  for (const e of events) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(e.date) || e.date > today) continue;
    if (!Number.isFinite(e.amount) || e.amount <= 0) continue;
    const quantity = quantityHeldBefore(txs, e.date);
    if (quantity <= 0) continue;
    out.push({ ...e, quantity, total: quantity * e.amount });
  }
  return out.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
}
