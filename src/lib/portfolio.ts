import "server-only";
import { getDb } from "./db";
import {
  ASSET_TYPES,
  instrumentId,
  isAssetType,
  isCurrency,
  isMode,
  isValidSymbol,
  normalizeSymbol,
  type AssetType,
  type Currency,
  type Mode,
  type Side,
} from "./assets";
import { getQuotes, type InstrumentRef, type Quote } from "./prices";
import { parseDecimal } from "./format";

// ---- İşlemler (transactions) ---------------------------------------------
// Gerçek ve sanal işlemler aynı tabloda, `mode` alanıyla ayrılır. Tüm hesaplama
// mantığı ortaktır; toplamlar her zaman tek bir mod için hesaplanır.

export interface Transaction {
  id: number;
  mode: Mode;
  assetType: AssetType;
  symbol: string;
  side: Side;
  quantity: number;
  price: number;
  currency: Currency;
  date: string; // YYYY-MM-DD
  note: string | null;
  /** Sanal girişte yatırılan tutar (adet girildiyse null) */
  amount: number | null;
  amountCurrency: Currency | null;
  /** Sanal girişte kullanılan canlı fiyatın zamanı (ms) */
  priceTime: number | null;
  /** Bu gerçek işlem bir sanal pozisyondan dönüştürüldüyse kaynak sanal işlem */
  sourceId: number | null;
  /** Sanal işlem gerçeğe dönüştürüldüyse zamanı; bu işlemler arşivdir, toplamlara girmez */
  convertedAt: string | null;
  convertedToId: number | null;
  /** Emirle otomatik oluştuysa emir kimliği */
  orderId: number | null;
  createdAt: string;
}

export interface TransactionInput {
  mode: Mode;
  assetType: AssetType;
  symbol: string;
  side: Side;
  quantity: number;
  price: number;
  currency: Currency;
  date: string;
  note: string | null;
}

interface TxRow {
  id: number;
  mode: Mode;
  asset_type: AssetType;
  symbol: string;
  side: Side;
  quantity: number;
  price: number;
  currency: Currency;
  date: string;
  note: string | null;
  amount: number | null;
  amount_currency: Currency | null;
  price_time: number | null;
  source_id: number | null;
  converted_at: string | null;
  converted_to_id: number | null;
  order_id: number | null;
  created_at: string;
}

function fromRow(r: TxRow): Transaction {
  return {
    id: r.id,
    mode: r.mode,
    assetType: r.asset_type,
    symbol: r.symbol,
    side: r.side,
    quantity: r.quantity,
    price: r.price,
    currency: r.currency,
    date: r.date,
    note: r.note,
    amount: r.amount,
    amountCurrency: r.amount_currency,
    priceTime: r.price_time,
    sourceId: r.source_id,
    convertedAt: r.converted_at,
    convertedToId: r.converted_to_id,
    orderId: r.order_id,
    createdAt: r.created_at,
  };
}

export function listTransactions(mode?: Mode): Transaction[] {
  const db = getDb();
  const rows = (
    mode
      ? db.prepare("SELECT * FROM transactions WHERE mode = ? ORDER BY date DESC, id DESC").all(mode)
      : db.prepare("SELECT * FROM transactions ORDER BY date DESC, id DESC").all()
  ) as unknown as TxRow[];
  return rows.map(fromRow);
}

/** Toplamlara giren işlemler: gerçeğe dönüştürülmüş (arşiv) sanal işlemler hariç */
function activeTransactions(mode: Mode): Transaction[] {
  return listTransactions(mode).filter((t) => !t.convertedAt);
}

export function getTransaction(id: number): Transaction | null {
  const row = getDb().prepare("SELECT * FROM transactions WHERE id = ?").get(id) as unknown as TxRow | undefined;
  return row ? fromRow(row) : null;
}

export class ValidationError extends Error {}

export function todayIstanbul(): string {
  return new Date().toLocaleDateString("en-CA", { timeZone: "Europe/Istanbul" });
}

function parseCommon(b: Record<string, unknown>) {
  if (b.mode !== undefined && !isMode(b.mode)) throw new ValidationError("Portföy modu geçersiz.");
  const mode: Mode = isMode(b.mode) ? b.mode : "real";
  if (!isAssetType(b.assetType)) throw new ValidationError("Varlık türü geçersiz.");
  const assetType = b.assetType;
  const symbol = normalizeSymbol(assetType, String(b.symbol ?? ""));
  if (!isValidSymbol(assetType, symbol)) throw new ValidationError("Sembol geçersiz.");
  const noteRaw = typeof b.note === "string" ? b.note.trim() : "";
  const note = noteRaw ? noteRaw.slice(0, 500) : null;
  return { mode, assetType, symbol, note };
}

/** İstek gövdesini doğrular ve normalize eder. Hatalı ise ValidationError fırlatır. */
export function parseTransactionInput(body: unknown): TransactionInput {
  if (!body || typeof body !== "object") throw new ValidationError("Geçersiz istek.");
  const b = body as Record<string, unknown>;
  const { mode, assetType, symbol, note } = parseCommon(b);

  if (b.side !== "buy" && b.side !== "sell") throw new ValidationError("İşlem yönü geçersiz.");

  const quantity = parseDecimal(b.quantity as string | number);
  if (!Number.isFinite(quantity) || quantity <= 0) throw new ValidationError("Miktar sıfırdan büyük olmalı.");

  const price = parseDecimal(b.price as string | number);
  if (!Number.isFinite(price) || price < 0) throw new ValidationError("Birim fiyat geçersiz.");

  if (!isCurrency(b.currency)) throw new ValidationError("Para birimi geçersiz.");

  const date = String(b.date ?? "");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || Number.isNaN(Date.parse(date))) throw new ValidationError("Tarih geçersiz.");

  return { mode, assetType, symbol, side: b.side, quantity, price, currency: b.currency, date, note };
}

type SeqItem = Pick<Transaction, "assetType" | "symbol" | "side" | "quantity" | "date" | "id">;

function bySequence(a: SeqItem, b: SeqItem) {
  return a.date === b.date ? a.id - b.id : a.date < b.date ? -1 : 1;
}

/**
 * Bir varlığın elde tutulan miktarının hiçbir anda eksiye düşmediğini kontrol
 * eder (eldekinden fazla satış engellenir).
 */
function assertNoOversell(txs: SeqItem[]) {
  let qty = 0;
  for (const t of [...txs].sort(bySequence)) {
    qty += t.side === "buy" ? t.quantity : -t.quantity;
    if (qty < -1e-9) {
      throw new ValidationError(`${t.symbol} için ${t.date} tarihinde eldekinden fazla satış yapılamaz.`);
    }
  }
}

function sameAsset(mode: Mode, assetType: AssetType, symbol: string, excludeId?: number) {
  return activeTransactions(mode).filter((t) => t.assetType === assetType && t.symbol === symbol && t.id !== excludeId);
}

export interface InsertExtras {
  /** Bu işlemi oluşturan emir */
  orderId?: number | null;
  amount?: number | null;
  amountCurrency?: Currency | null;
  priceTime?: number | null;
  sourceId?: number | null;
}

function insert(input: TransactionInput, extras: InsertExtras = {}): number {
  const res = getDb()
    .prepare(
      `INSERT INTO transactions (mode, asset_type, symbol, side, quantity, price, currency, date, note,
         amount, amount_currency, price_time, source_id, order_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      input.mode,
      input.assetType,
      input.symbol,
      input.side,
      input.quantity,
      input.price,
      input.currency,
      input.date,
      input.note,
      extras.amount ?? null,
      extras.amountCurrency ?? null,
      extras.priceTime ?? null,
      extras.sourceId ?? null,
      extras.orderId ?? null,
    );
  return Number(res.lastInsertRowid);
}

/** Eldekinden fazla satışı engelleyerek işlem kaydeder. */
export function recordTransaction(input: TransactionInput, extras: InsertExtras = {}): Transaction {
  assertNoOversell([
    ...sameAsset(input.mode, input.assetType, input.symbol),
    { ...input, id: Number.MAX_SAFE_INTEGER },
  ]);
  return getTransaction(insert(input, extras))!;
}

export function createTransaction(input: TransactionInput): Transaction {
  return recordTransaction(input);
}

/** Düzenleme. İşlemin modu değiştirilemez (sanal → gerçek için convertVirtualPosition). */
export function updateTransaction(id: number, input: TransactionInput): Transaction | null {
  const existing = getTransaction(id);
  if (!existing) return null;
  const mode = existing.mode;
  if (!existing.convertedAt) {
    assertNoOversell([...sameAsset(mode, input.assetType, input.symbol, id), { ...input, id }]);
    if (existing.assetType !== input.assetType || existing.symbol !== input.symbol) {
      assertNoOversell(sameAsset(mode, existing.assetType, existing.symbol, id));
    }
  }
  getDb()
    .prepare(
      `UPDATE transactions SET asset_type=?, symbol=?, side=?, quantity=?, price=?, currency=?, date=?, note=?,
         updated_at=datetime('now') WHERE id=?`,
    )
    .run(input.assetType, input.symbol, input.side, input.quantity, input.price, input.currency, input.date, input.note, id);
  return getTransaction(id);
}

export function deleteTransaction(id: number): boolean {
  const existing = getTransaction(id);
  if (!existing) return false;
  if (!existing.convertedAt) assertNoOversell(sameAsset(existing.mode, existing.assetType, existing.symbol, id));
  getDb().prepare("DELETE FROM transactions WHERE id = ?").run(id);
  return true;
}

// ---- Sanal giriş ve dönüştürme ---------------------------------------------

export interface Sizing {
  /** Tutar ile (örn. 10.000 TL) ya da adet ile */
  amount: number | null;
  amountCurrency: Currency | null;
  quantity: number | null;
}

/** { entryBy: "amount" | "quantity", amount, amountCurrency, quantity } gövdesini doğrular. */
export function parseSizing(b: Record<string, unknown>): Sizing {
  if (b.entryBy === "quantity") {
    const quantity = parseDecimal(b.quantity as string | number);
    if (!Number.isFinite(quantity) || quantity <= 0) throw new ValidationError("Miktar sıfırdan büyük olmalı.");
    return { amount: null, amountCurrency: null, quantity };
  }
  const amount = parseDecimal(b.amount as string | number);
  if (!Number.isFinite(amount) || amount <= 0) throw new ValidationError("Tutar sıfırdan büyük olmalı.");
  if (!isCurrency(b.amountCurrency)) throw new ValidationError("Tutar para birimi geçersiz.");
  return { amount, amountCurrency: b.amountCurrency, quantity: null };
}

export interface LivePricing {
  /** İşlem para biriminde birim fiyat */
  price: number;
  currency: Currency;
  quantity: number;
  priceTime: number | null;
  /** Kaynağın ham fiyatı ve para birimi (emir tetik karşılaştırması bununla yapılır) */
  quotePrice: number;
  quoteCurrency: string;
}

/**
 * Güncel canlı fiyatla işlem fiyatı ve adedi hesaplar: adet = tutar / fiyat
 * (gerekirse kur çevrimiyle). İşlem para birimi varlığın fiyat birimidir;
 * TRY/USD/EUR dışındaysa TRY'ye çevrilir.
 */
export async function priceAtMarket(
  assetType: AssetType,
  symbol: string,
  sizing: Sizing,
  opts: { force?: boolean } = {},
): Promise<LivePricing> {
  const [q] = await getQuotes([{ type: assetType, symbol }], opts);
  if (q.price == null || q.stale) throw new ValidationError(`${symbol} için canlı fiyat alınamadı; biraz sonra tekrar deneyin.`);

  const needFx = new Set<string>();
  if (q.currency !== "TRY") needFx.add(q.currency);
  if (sizing.amountCurrency && sizing.amountCurrency !== "TRY") needFx.add(sizing.amountCurrency);
  const fx = await getQuotes([...needFx].map((c) => ({ type: "fx" as const, symbol: c })));
  const rate = (cur: string) => {
    if (cur === "TRY") return 1;
    const r = fx.find((x) => x.id === `fx:${cur}`)?.price;
    if (r == null) throw new ValidationError(`${cur}/TRY kuru alınamadı.`);
    return r;
  };

  const currency: Currency = isCurrency(q.currency) ? q.currency : "TRY";
  const price = isCurrency(q.currency) ? q.price : q.price * rate(q.currency);
  if (price <= 0) throw new ValidationError("Geçersiz fiyat.");
  const quantity =
    sizing.amount != null && sizing.amountCurrency
      ? (sizing.amount * rate(sizing.amountCurrency)) / rate(currency) / price
      : sizing.quantity!;
  return { price, currency, quantity, priceTime: q.sourceTime ?? q.fetchedAt, quotePrice: q.price, quoteCurrency: q.currency };
}

/**
 * Sanal pozisyon açar: kullanıcı ya bir TUTAR (örn. 10.000 TL) ya da ADET girer;
 * güncel canlı fiyat alınır, adet = tutar / fiyat (gerekirse kur çevrimiyle).
 */
export async function createVirtualEntry(body: unknown): Promise<Transaction> {
  if (!body || typeof body !== "object") throw new ValidationError("Geçersiz istek.");
  const b = body as Record<string, unknown>;
  const { assetType, symbol, note } = parseCommon({ ...b, mode: "virtual" });
  const sizing = parseSizing(b);
  const p = await priceAtMarket(assetType, symbol, sizing, { force: true });
  return recordTransaction(
    { mode: "virtual", assetType, symbol, side: "buy", quantity: p.quantity, price: p.price, currency: p.currency, date: todayIstanbul(), note },
    { amount: sizing.amount, amountCurrency: sizing.amountCurrency, priceTime: p.priceTime },
  );
}

/**
 * "Gerçekten aldım": bir varlığın aktif sanal işlemlerini arşivler ve
 * kullanıcının onayladığı (düzenleyebildiği) gerçek bir alış işlemi oluşturur.
 * Sanal işlemler silinmez; converted_at / converted_to_id ile gerçeğe bağlanır.
 */
export function convertVirtualPosition(body: unknown): Transaction {
  const input = parseTransactionInput({ ...(body as object), mode: "real", side: "buy" });
  const virtual = sameAsset("virtual", input.assetType, input.symbol);
  if (virtual.length === 0) throw new ValidationError("Bu varlık için sanal pozisyon bulunamadı.");
  assertNoOversell([...sameAsset("real", input.assetType, input.symbol), { ...input, id: Number.MAX_SAFE_INTEGER }]);

  const db = getDb();
  const firstBuy = [...virtual].sort(bySequence).find((t) => t.side === "buy") ?? virtual[0];
  db.exec("BEGIN");
  try {
    const newId = insert(input, { sourceId: firstBuy.id });
    const stmt = db.prepare(
      "UPDATE transactions SET converted_at = datetime('now'), converted_to_id = ?, updated_at = datetime('now') WHERE id = ?",
    );
    for (const t of virtual) stmt.run(newId, t.id);
    db.exec("COMMIT");
    return getTransaction(newId)!;
  } catch (err) {
    db.exec("ROLLBACK");
    throw err;
  }
}

// ---- Pozisyonlar (holdings) ------------------------------------------------

export interface Holding {
  id: string;
  mode: Mode;
  assetType: AssetType;
  symbol: string;
  quantity: number;
  /** Ortalama maliyet (giriş fiyatı), varlığın fiyat para biriminde */
  avgCost: number | null;
  currency: string;
  price: number | null;
  changePct: number | null;
  stale: boolean;
  priceError?: string;
  fetchedAt: number | null;
  /** Değer ve K/Z, varlığın para biriminde */
  value: number | null;
  cost: number | null;
  pnl: number | null;
  pnlPct: number | null;
  /** TRY karşılıkları (güncel kur ile) */
  valueTry: number | null;
  costTry: number | null;
  pnlTry: number | null;
  realizedPnlTry: number | null;
  /** 1 birim varlık para birimi = ? TRY */
  fxRate: number | null;
  /** İlk alış tarihi ve o günden bu yana geçen gün */
  firstDate: string;
  days: number;
}

export interface AllocationSlice {
  assetType: AssetType;
  valueTry: number;
  pct: number;
}

export interface PortfolioSummary {
  mode: Mode;
  holdings: Holding[];
  totals: {
    valueTry: number;
    costTry: number;
    pnlTry: number;
    pnlPct: number | null;
    realizedPnlTry: number;
    /** Değeri hesaplanamayan pozisyon var mı */
    incomplete: boolean;
    anyStale: boolean;
  };
  allocation: AllocationSlice[];
  rates: Record<string, Quote>;
  updatedAt: number;
}

interface Position {
  assetType: AssetType;
  symbol: string;
  quantity: number;
  /** Maliyet tabanı, para birimine göre (karma para birimli işlemler için) */
  costBy: Map<string, number>;
  /** Gerçekleşen K/Z, para birimine göre */
  realizedBy: Map<string, number>;
  /** Mevcut pozisyonun açıldığı tarih (tamamen satılıp yeniden alınırsa sıfırlanır) */
  firstDate: string;
}

/** Ağırlıklı ortalama maliyet yöntemiyle pozisyonları çıkarır. */
function buildPositions(txs: Transaction[]): Position[] {
  const map = new Map<string, Position>();
  for (const t of [...txs].sort(bySequence)) {
    const key = instrumentId(t.assetType, t.symbol);
    let p = map.get(key);
    if (!p) {
      p = { assetType: t.assetType, symbol: t.symbol, quantity: 0, costBy: new Map(), realizedBy: new Map(), firstDate: t.date };
      map.set(key, p);
    }
    if (t.side === "buy") {
      if (p.quantity <= 1e-12) p.firstDate = t.date;
      p.quantity += t.quantity;
      p.costBy.set(t.currency, (p.costBy.get(t.currency) ?? 0) + t.quantity * t.price);
    } else {
      const ratio = p.quantity > 0 ? Math.min(t.quantity / p.quantity, 1) : 0;
      // Satılan kısmın maliyeti her para biriminden orantılı düşülür.
      for (const [cur, c] of p.costBy) {
        const removed = c * ratio;
        p.costBy.set(cur, c - removed);
        p.realizedBy.set(cur, (p.realizedBy.get(cur) ?? 0) - removed);
      }
      p.realizedBy.set(t.currency, (p.realizedBy.get(t.currency) ?? 0) + t.quantity * t.price);
      p.quantity = Math.max(0, p.quantity - t.quantity);
    }
  }
  return [...map.values()];
}

function daysSince(date: string): number {
  const start = Date.parse(`${date}T00:00:00Z`);
  const today = Date.parse(`${todayIstanbul()}T00:00:00Z`);
  return Math.max(0, Math.round((today - start) / 86_400_000));
}

export async function getPortfolio(mode: Mode, opts: { force?: boolean } = {}): Promise<PortfolioSummary> {
  const positions = buildPositions(activeTransactions(mode));

  // Fiyatlar + gereken tüm kurlar.
  const instruments: InstrumentRef[] = positions.map((p) => ({ type: p.assetType, symbol: p.symbol }));
  const fxNeeded = new Set<string>(["USD", "EUR"]);
  for (const p of positions) {
    for (const c of p.costBy.keys()) fxNeeded.add(c);
    for (const c of p.realizedBy.keys()) fxNeeded.add(c);
  }
  fxNeeded.delete("TRY");
  const firstPass = await getQuotes([...instruments, ...[...fxNeeded].map((c) => ({ type: "fx" as const, symbol: c }))], opts);
  // Yabancı hisseler USD dışında bir para biriminde olabilir (örn. GBP); o kurları da al.
  for (const q of firstPass.slice(0, instruments.length)) {
    if (q.currency && q.currency !== "TRY") fxNeeded.add(q.currency);
  }
  const fxQuotes = await getQuotes([...fxNeeded].map((c) => ({ type: "fx" as const, symbol: c })));
  const rates: Record<string, Quote> = {};
  for (const q of fxQuotes) rates[q.id.slice(3)] = q;
  const rate = (cur: string): number | null => (cur === "TRY" ? 1 : (rates[cur]?.price ?? null));
  const toTry = (byCur: Map<string, number>): number | null => {
    let sum = 0;
    for (const [cur, v] of byCur) {
      if (Math.abs(v) < 1e-12) continue;
      const r = rate(cur);
      if (r == null) return null;
      sum += v * r;
    }
    return sum;
  };

  const holdings: Holding[] = [];
  let realizedTotal = 0;
  for (let i = 0; i < positions.length; i++) {
    const p = positions[i];
    const q = firstPass[i];
    const realizedTry = toTry(p.realizedBy);
    if (realizedTry != null) realizedTotal += realizedTry;
    if (p.quantity <= 1e-12) continue; // tamamen satılmış

    const currency = q.currency || [...p.costBy.keys()][0] || "TRY";
    const fxRate = rate(currency);
    const costTry = toTry(p.costBy);
    const cost = costTry != null && fxRate ? costTry / fxRate : null;
    const value = q.price != null ? q.price * p.quantity : null;
    const valueTry = value != null && fxRate != null ? value * fxRate : null;
    const pnl = value != null && cost != null ? value - cost : null;

    holdings.push({
      id: q.id,
      mode,
      assetType: p.assetType,
      symbol: p.symbol,
      quantity: p.quantity,
      avgCost: cost != null ? cost / p.quantity : null,
      currency,
      price: q.price,
      changePct: q.changePct,
      stale: q.stale,
      priceError: q.error,
      fetchedAt: q.fetchedAt,
      value,
      cost,
      pnl,
      pnlPct: pnl != null && cost ? (pnl / cost) * 100 : null,
      valueTry,
      costTry,
      pnlTry: valueTry != null && costTry != null ? valueTry - costTry : null,
      realizedPnlTry: realizedTry,
      fxRate,
      firstDate: p.firstDate,
      days: daysSince(p.firstDate),
    });
  }

  holdings.sort((a, b) => (b.valueTry ?? -1) - (a.valueTry ?? -1));

  let valueTry = 0;
  let costTry = 0;
  let incomplete = false;
  const byType = new Map<AssetType, number>();
  for (const h of holdings) {
    if (h.valueTry == null || h.costTry == null) {
      incomplete = true;
      continue;
    }
    valueTry += h.valueTry;
    costTry += h.costTry;
    byType.set(h.assetType, (byType.get(h.assetType) ?? 0) + h.valueTry);
  }
  const allocation: AllocationSlice[] = ASSET_TYPES.filter((t) => (byType.get(t) ?? 0) > 0)
    .map((t) => ({ assetType: t, valueTry: byType.get(t)!, pct: valueTry > 0 ? (byType.get(t)! / valueTry) * 100 : 0 }))
    .sort((a, b) => b.valueTry - a.valueTry);

  return {
    mode,
    holdings,
    totals: {
      valueTry,
      costTry,
      pnlTry: valueTry - costTry,
      pnlPct: costTry > 0 ? ((valueTry - costTry) / costTry) * 100 : null,
      realizedPnlTry: realizedTotal,
      incomplete,
      anyStale: holdings.some((h) => h.stale) || Object.values(rates).some((r) => r.stale),
    },
    allocation,
    rates,
    updatedAt: Date.now(),
  };
}
