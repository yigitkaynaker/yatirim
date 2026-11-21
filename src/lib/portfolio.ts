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
import { bySequence, buildPositions, dayChange, positionKey, positionPnl, type Position } from "./positions";
import { ensureFxRates } from "./fxRates";
import { listAccounts, resolveAccount, type Account } from "./accounts";
import { annualReturn, transactionFlows, type Flow, type XirrResult } from "./xirr";

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
  /** İşlem para biriminin işlem tarihindeki TRY kuru (TRY için 1; henüz bilinmiyorsa null) */
  fxTry: number | null;
  /** Gerçek işlemin hesabı (sanalda null) */
  accountId: number | null;
  /** Komisyon / ücret, işlem para biriminde */
  fee: number;
  createdAt: string;
}

export interface TransactionInput {
  mode: Mode;
  /** Gerçekte hesap, sanalda null */
  accountId: number | null;
  /** Komisyon / ücret (işlem para biriminde, ≥ 0) */
  fee: number;
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
  fx_try: number | null;
  account_id: number | null;
  fee: number | null;
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
    fxTry: r.fx_try,
    accountId: r.account_id,
    fee: r.fee ?? 0,
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
export function activeTransactions(mode: Mode): Transaction[] {
  return listTransactions(mode).filter((t) => !t.convertedAt);
}

export function getTransaction(id: number): Transaction | null {
  const row = getDb().prepare("SELECT * FROM transactions WHERE id = ?").get(id) as unknown as TxRow | undefined;
  return row ? fromRow(row) : null;
}

export class ValidationError extends Error {}

/** Kayıt zaten var / çakışma (API'de 409). */
export class ConflictError extends ValidationError {}

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

/**
 * Komisyon: fee (tutar, işlem para biriminde) ya da feePct (% işlem tutarı). İkisi de yoksa
 * hesabın varsayılan oranı kullanılır (sanalda 0).
 */
export function parseFee(b: Record<string, unknown>, gross: number, account: Account | null): number {
  const given = (v: unknown) => v !== undefined && v !== null && v !== "";
  let fee: number;
  if (given(b.fee)) {
    fee = parseDecimal(b.fee as string | number);
    if (!Number.isFinite(fee) || fee < 0) throw new ValidationError("Komisyon tutarı geçersiz.");
  } else if (given(b.feePct)) {
    const pct = parseDecimal(b.feePct as string | number);
    if (!Number.isFinite(pct) || pct < 0 || pct > 10) throw new ValidationError("Komisyon oranı %0 ile %10 arasında olmalı.");
    fee = (gross * pct) / 100;
  } else {
    fee = account ? (gross * account.feePct) / 100 : 0;
  }
  fee = Math.round(fee * 1e6) / 1e6;
  if (gross > 0 && fee > gross) throw new ValidationError("Komisyon işlem tutarından büyük olamaz.");
  return fee;
}

/** İstek gövdesini doğrular ve normalize eder. Hatalı ise ValidationError fırlatır. */
export function parseTransactionInput(body: unknown, opts: { allowArchived?: boolean } = {}): TransactionInput {
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

  const account = mode === "real" ? resolveAccount(b, opts) : null;
  const fee = parseFee(b, quantity * price, account);
  return { mode, accountId: account?.id ?? null, fee, assetType, symbol, side: b.side, quantity, price, currency: b.currency, date, note };
}

type SeqItem = Pick<Transaction, "assetType" | "symbol" | "side" | "quantity" | "date" | "id">;

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

/** Aynı hesaptaki aynı varlığın aktif işlemleri (pozisyonlar hesap başına ayrıdır) */
function sameAsset(mode: Mode, assetType: AssetType, symbol: string, accountId: number | null, excludeId?: number) {
  return activeTransactions(mode).filter(
    (t) => t.assetType === assetType && t.symbol === symbol && (mode === "virtual" || t.accountId === accountId) && t.id !== excludeId,
  );
}

export interface InsertExtras {
  /** Bu işlemi oluşturan emir */
  orderId?: number | null;
  amount?: number | null;
  amountCurrency?: Currency | null;
  priceTime?: number | null;
  sourceId?: number | null;
  /** İşlem tarihindeki kur (canlı fiyatla açılan işlemlerde bilinir). Verilmezse TRY → 1, diğerleri sonradan doldurulur. */
  fxTry?: number | null;
  /** Toplu içe aktarmada kur tamamlamayı işlem bitince bir kez başlatmak için */
  deferFx?: boolean;
}

function insert(input: TransactionInput, extras: InsertExtras = {}): number {
  const res = getDb()
    .prepare(
      `INSERT INTO transactions (mode, asset_type, symbol, side, quantity, price, currency, date, note,
         amount, amount_currency, price_time, source_id, order_id, fx_try, account_id, fee)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
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
      input.currency === "TRY" ? 1 : (extras.fxTry ?? null),
      input.mode === "real" ? input.accountId : null,
      input.fee,
    );
  const id = Number(res.lastInsertRowid);
  // Kur bilinmiyorsa (elle girilen USD/EUR işlem) arka planda o günün kuruyla doldur.
  if (input.currency !== "TRY" && extras.fxTry == null && !extras.deferFx) void ensureFxRates({ force: true });
  return id;
}

/** Eldekinden fazla satışı engelleyerek işlem kaydeder. */
export function recordTransaction(input: TransactionInput, extras: InsertExtras = {}): Transaction {
  assertNoOversell([
    ...sameAsset(input.mode, input.assetType, input.symbol, input.accountId),
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
  const accountId = mode === "real" ? input.accountId : null;
  if (!existing.convertedAt) {
    assertNoOversell([...sameAsset(mode, input.assetType, input.symbol, accountId, id), { ...input, id }]);
    if (existing.assetType !== input.assetType || existing.symbol !== input.symbol || existing.accountId !== accountId) {
      assertNoOversell(sameAsset(mode, existing.assetType, existing.symbol, existing.accountId, id));
    }
  }
  // Tarih ya da para birimi değiştiyse işlem tarihi kuru yeniden alınır.
  const fxTry =
    input.currency === "TRY" ? 1 : existing.currency === input.currency && existing.date === input.date ? existing.fxTry : null;
  getDb()
    .prepare(
      `UPDATE transactions SET asset_type=?, symbol=?, side=?, quantity=?, price=?, currency=?, date=?, note=?,
         fx_try=?, account_id=?, fee=?, updated_at=datetime('now') WHERE id=?`,
    )
    .run(input.assetType, input.symbol, input.side, input.quantity, input.price, input.currency, input.date, input.note, fxTry, accountId, input.fee, id);
  if (fxTry == null) void ensureFxRates({ force: true });
  return getTransaction(id);
}

export function deleteTransaction(id: number): boolean {
  const existing = getTransaction(id);
  if (!existing) return false;
  if (!existing.convertedAt) assertNoOversell(sameAsset(existing.mode, existing.assetType, existing.symbol, existing.accountId, id));
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
  /** İşlem para biriminin şu anki TRY kuru (işleme kaydedilir) */
  fxTry: number;
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
  return {
    price,
    currency,
    quantity,
    priceTime: q.sourceTime ?? q.fetchedAt,
    quotePrice: q.price,
    quoteCurrency: q.currency,
    fxTry: rate(currency),
  };
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
    { mode: "virtual", accountId: null, fee: 0, assetType, symbol, side: "buy", quantity: p.quantity, price: p.price, currency: p.currency, date: todayIstanbul(), note },
    { amount: sizing.amount, amountCurrency: sizing.amountCurrency, priceTime: p.priceTime, fxTry: p.fxTry },
  );
}

/**
 * "Gerçekten aldım": bir varlığın aktif sanal işlemlerini arşivler ve
 * kullanıcının onayladığı (düzenleyebildiği) gerçek bir alış işlemi oluşturur.
 * Sanal işlemler silinmez; converted_at / converted_to_id ile gerçeğe bağlanır.
 */
export function convertVirtualPosition(body: unknown): Transaction {
  const input = parseTransactionInput({ ...(body as object), mode: "real", side: "buy" });
  const virtual = sameAsset("virtual", input.assetType, input.symbol, null);
  if (virtual.length === 0) throw new ValidationError("Bu varlık için sanal pozisyon bulunamadı.");
  assertNoOversell([...sameAsset("real", input.assetType, input.symbol, input.accountId), { ...input, id: Number.MAX_SAFE_INTEGER }]);

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

/** Birleşik görünümde bir pozisyonun hesap kırılımı */
export interface HoldingAccountPart {
  accountId: number;
  name: string;
  quantity: number;
  avgCost: number | null;
  valueTry: number | null;
  costTry: number | null;
  pnlTry: number | null;
  pnlPct: number | null;
}

export interface Holding {
  id: string;
  mode: Mode;
  /** Hesap görünümünde o hesap; birleşik görünümde ve sanalda null (kırılım: accounts) */
  accountId: number | null;
  /** Gerçek portföyde pozisyonun hesaplara dağılımı */
  accounts: HoldingAccountPart[];
  assetType: AssetType;
  symbol: string;
  quantity: number;
  /** Ortalama maliyet (giriş fiyatı), varlığın fiyat para biriminde — komisyon dahil */
  avgCost: number | null;
  currency: string;
  price: number | null;
  changePct: number | null;
  stale: boolean;
  priceError?: string;
  fetchedAt: number | null;
  /** Fiyatın kaynaktaki zamanı (ms), kaynağı ve gecikme / günlük fiyat / yaklaşık bilgisi */
  sourceTime: number | null;
  source: string;
  delayed: boolean;
  daily: boolean;
  approx: boolean;
  /** Altın: kuyumcu alış fiyatı (satarsanız alacağınız). Varsa price = bid (değerleme bununla) */
  bid: number | null;
  /** Altın: kuyumcu satış fiyatı (alırken ödediğiniz) */
  ask: number | null;
  /** Kaynaktan gelen ad (fon unvanı) */
  name: string | null;
  /** "Bugün" (son seans) değişimi: önceki kapanışa göre, TL ve % */
  dayChangeTry: number | null;
  dayChangePct: number | null;
  /** true: fiyat bugüne değil önceki bir seansa ait (hafta sonu / tatil / fonun son açıklanan günü) */
  dayIsPastSession: boolean;
  /** Onaylanmış temettü gelirleri (TL, hak kullanım günü kuruyla) */
  dividendsTry: number;
  /** Ödenen komisyonlar (TL, işlem günü kuruyla) */
  feesTry: number;
  /** Değer ve K/Z, varlığın para biriminde */
  value: number | null;
  cost: number | null;
  pnl: number | null;
  pnlPct: number | null;
  /** TRY karşılıkları: değer güncel kurla, maliyet ve gerçekleşen K/Z işlem tarihi kurlarıyla */
  valueTry: number | null;
  costTry: number | null;
  pnlTry: number | null;
  realizedPnlTry: number | null;
  /** Döviz cinsinden varlıklarda TL K/Z ayrımı: fiyat hareketi (güncel kurla) + kur hareketi. TRY varlıkta null. */
  priceEffectTry: number | null;
  fxEffectTry: number | null;
  /** İşlem tarihi kuru henüz alınamadı; TL maliyette geçici olarak güncel kur kullanıldı */
  fxEstimated: boolean;
  /** 1 birim varlık para birimi = ? TRY */
  fxRate: number | null;
  /** İlk alış tarihi ve o günden bu yana geçen gün */
  firstDate: string;
  days: number;
  /** Para ağırlıklı yıllık getiri (XIRR): paranın ne zaman girdiğini hesaba katar */
  annual: XirrResult | null;
}

export interface AllocationSlice {
  assetType: AssetType;
  valueTry: number;
  pct: number;
}

/** Hesap başına toplamlar (gerçek portföy) */
export interface AccountTotal {
  accountId: number;
  name: string;
  includeInTotal: boolean;
  archived: boolean;
  feePct: number;
  valueTry: number;
  costTry: number;
  pnlTry: number;
  pnlPct: number | null;
  realizedPnlTry: number;
  positions: number;
  incomplete: boolean;
  annual: XirrResult | null;
}

export interface PortfolioSummary {
  mode: Mode;
  /** Seçili hesap (null: tüm "toplama dahil" hesaplar / sanal) */
  account: number | null;
  holdings: Holding[];
  totals: {
    valueTry: number;
    costTry: number;
    pnlTry: number;
    pnlPct: number | null;
    /** Gerçekleşen K/Z: satışlardan (komisyon düşülmüş) + onaylanmış temettü gelirleri */
    realizedPnlTry: number;
    /** Gerçekleşen K/Z'nin temettü kısmı */
    dividendsTry: number;
    /** Ödenen toplam komisyon (TL) */
    feesTry: number;
    /** "Bugün" değişimi (önceki kapanışa göre) — hesaplanamayan pozisyonlar hariç */
    dayChangeTry: number | null;
    dayChangePct: number | null;
    /** Değeri hesaplanamayan pozisyon var mı */
    incomplete: boolean;
    anyStale: boolean;
    /** Para ağırlıklı yıllık getiri (XIRR) */
    annual: XirrResult | null;
  };
  /** Gerçek portföyde tüm (arşivlenmemiş) hesapların toplamları */
  accounts: AccountTotal[];
  allocation: AllocationSlice[];
  rates: Record<string, Quote>;
  updatedAt: number;
}

/**
 * Pozisyon değerlemesinde kullanılacak fiyat: altında kuyumcu alış (bid) fiyatı varsa o,
 * önceki kapanış da aynı oranla ölçeklenir. Diğer varlıklarda fiyat aynen kalır.
 */
export function holdingQuote(type: AssetType, q: Quote): Quote {
  if (type !== "gold" || q.bid == null || !(q.bid > 0) || q.price == null || !(q.price > 0)) return q;
  const ratio = q.bid / q.price;
  return { ...q, price: q.bid, prevClose: q.prevClose != null ? q.prevClose * ratio : null };
}

function daysSince(date: string): number {
  const start = Date.parse(`${date}T00:00:00Z`);
  const today = Date.parse(`${todayIstanbul()}T00:00:00Z`);
  return Math.max(0, Math.round((today - start) / 86_400_000));
}

interface DivRowTry {
  accountId: number | null;
  instrument: string;
  date: string;
  amountTry: number;
}

/**
 * Onaylanmış temettü gelirleri (TL, net). Hak kullanım günü kuru (fx_try) ile; kur
 * kaydedilmemişse güncel kur kullanılır.
 */
function confirmedDividendRows(mode: Mode, rate: (cur: string) => number | null): DivRowTry[] {
  const rows = getDb()
    .prepare("SELECT account_id, asset_type, symbol, ex_date, amount, currency, fx_try FROM dividends WHERE mode = ? AND status = 'confirmed'")
    .all(mode) as { account_id: number; asset_type: AssetType; symbol: string; ex_date: string; amount: number; currency: string; fx_try: number | null }[];
  const out: DivRowTry[] = [];
  for (const r of rows) {
    const fx = r.currency === "TRY" ? 1 : (r.fx_try ?? rate(r.currency));
    if (fx == null) continue;
    out.push({ accountId: mode === "real" ? r.account_id : null, instrument: instrumentId(r.asset_type, r.symbol), date: r.ex_date, amountTry: r.amount * fx });
  }
  return out;
}

/** Bir pozisyon satırı (hesap + enstrüman), kapalı olanlar dahil */
interface Row {
  key: string;
  accountId: number | null;
  instrument: string;
  p: Position;
  holding: Holding | null;
  realizedTry: number | null;
  dividendsTry: number;
  dayBase: number;
  dayMissing: boolean;
}

function sumOrNull(vals: (number | null)[]): number | null {
  let s = 0;
  for (const v of vals) {
    if (v == null) return null;
    s += v;
  }
  return s;
}

/** Birden çok hesaptaki aynı varlığı tek satırda birleştirir. */
function mergeHoldings(parts: Row[], txFlows: (rows: Row[]) => Flow[] | null): Holding {
  const hs = parts.map((r) => r.holding!);
  const first = hs[0];
  const quantity = hs.reduce((s, h) => s + h.quantity, 0);
  const cost = sumOrNull(hs.map((h) => h.cost));
  const value = sumOrNull(hs.map((h) => h.value));
  const pnl = value != null && cost != null ? value - cost : null;
  const valueTry = sumOrNull(hs.map((h) => h.valueTry));
  const costTry = sumOrNull(hs.map((h) => h.costTry));
  const dayVals = hs.map((h) => h.dayChangeTry).filter((v): v is number => v != null);
  const dayChangeTry = dayVals.length ? dayVals.reduce((a, b) => a + b, 0) : null;
  const dayBase = parts.reduce((s, r) => s + r.dayBase, 0);
  const firstDate = hs.map((h) => h.firstDate).sort()[0];
  const merged: Holding = {
    ...first,
    accountId: null,
    quantity,
    avgCost: cost != null && quantity > 0 ? cost / quantity : null,
    value,
    cost,
    pnl,
    pnlPct: pnl != null && cost ? (pnl / cost) * 100 : null,
    valueTry,
    costTry,
    pnlTry: valueTry != null && costTry != null ? valueTry - costTry : null,
    realizedPnlTry: sumOrNull(hs.map((h) => h.realizedPnlTry)),
    priceEffectTry: sumOrNull(hs.map((h) => h.priceEffectTry)),
    fxEffectTry: sumOrNull(hs.map((h) => h.fxEffectTry)),
    fxEstimated: hs.some((h) => h.fxEstimated),
    dividendsTry: hs.reduce((s, h) => s + h.dividendsTry, 0),
    feesTry: hs.reduce((s, h) => s + h.feesTry, 0),
    dayChangeTry,
    dayChangePct: dayChangeTry != null && dayBase > 0 ? (dayChangeTry / dayBase) * 100 : null,
    firstDate,
    days: daysSince(firstDate),
    accounts: hs.flatMap((h) => h.accounts),
    annual: null,
  };
  const flows = txFlows(parts);
  merged.annual = flows && valueTry != null ? annualReturn([...flows, { date: todayIstanbul(), amount: valueTry }]) : null;
  return merged;
}

/**
 * Portföy özeti. Gerçek portföyde pozisyonlar hesap başına hesaplanır (her hesabın kendi
 * ortalama maliyeti). opts.account verilirse yalnızca o hesap; verilmezse "toplama dahil"
 * hesaplar birleştirilir (aynı varlık tek satır, hesap kırılımıyla). Sanal portföy tek hesaptır.
 */
export async function getPortfolio(mode: Mode, opts: { force?: boolean; account?: number | null } = {}): Promise<PortfolioSummary> {
  // Eski kayıtların / yeni elle girilen işlemlerin işlem tarihi kurunu tamamla (kısa süre bekler).
  await ensureFxRates({ timeoutMs: 5_000 });
  const allTxs = activeTransactions(mode);
  const accounts = mode === "real" ? listAccounts({ includeArchived: true }) : [];
  const accName = new Map(accounts.map((a) => [a.id, a.name]));
  const selectedAccount = mode === "real" && opts.account != null ? opts.account : null;
  if (selectedAccount != null && !accName.has(selectedAccount)) throw new ValidationError("Hesap bulunamadı.");
  const included = new Set(accounts.filter((a) => a.includeInTotal).map((a) => a.id));
  const inSelection = (accountId: number | null) =>
    mode === "virtual" ? true : selectedAccount != null ? accountId === selectedAccount : accountId != null && included.has(accountId);

  // Fiyatlar + gereken tüm kurlar (hesap toplamları için tüm hesapların varlıkları).
  const instrumentKeys = new Map<string, InstrumentRef>();
  const fxNeeded = new Set<string>(["USD", "EUR"]);
  for (const t of allTxs) {
    instrumentKeys.set(instrumentId(t.assetType, t.symbol), { type: t.assetType, symbol: t.symbol });
    fxNeeded.add(t.currency);
  }
  const instruments = [...instrumentKeys.values()];
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
  const quoteById = new Map(firstPass.slice(0, instruments.length).map((q) => [q.id, q]));

  const prevRate = (cur: string): number | null => (cur === "TRY" ? 1 : (rates[cur]?.prevClose ?? rates[cur]?.price ?? null));
  const today = todayIstanbul();

  const divRows = confirmedDividendRows(mode, rate);
  const divByKey = new Map<string, number>();
  for (const d of divRows) {
    const k = `${d.accountId ?? ""}|${d.instrument}`;
    divByKey.set(k, (divByKey.get(k) ?? 0) + d.amountTry);
  }
  const txsByKey = new Map<string, Transaction[]>();
  for (const t of allTxs) {
    const k = positionKey(mode === "real" ? t.accountId : null, t.assetType, t.symbol);
    txsByKey.set(k, [...(txsByKey.get(k) ?? []), t]);
  }
  /** Satırların işlem + temettü nakit akışları (TL); kur yoksa null */
  const flowsOf = (rows: Row[]): Flow[] | null => {
    const out: Flow[] = [];
    for (const r of rows) {
      const f = transactionFlows(txsByKey.get(r.key) ?? [], rate);
      if (!f) return null;
      out.push(...f);
      for (const d of divRows) if ((d.accountId ?? null) === r.accountId && d.instrument === r.instrument) out.push({ date: d.date, amount: d.amountTry });
    }
    return out;
  };

  const positions = buildPositions(
    allTxs.map((t) => ({ ...t, accountId: mode === "real" ? t.accountId : null })),
    rate,
  );
  const rows: Row[] = [];
  for (const p of positions) {
    const instrument = instrumentId(p.assetType, p.symbol);
    const key = positionKey(p.accountId, p.assetType, p.symbol);
    const rawQ = quoteById.get(instrument)!;
    // Altın: elinizdekinin değeri kuyumcunun ALIŞ fiyatıyladır (satsanız eline geçen).
    // Kaynak satış (ask) fiyatı verir; alış (bid) varsa değerleme onunla yapılır.
    const q = holdingQuote(p.assetType, rawQ);
    const realizedTry = Number.isFinite(p.realizedTry) ? p.realizedTry : null;
    const dividendsTry = divByKey.get(`${p.accountId ?? ""}|${instrument}`) ?? 0;
    const row: Row = { key, accountId: p.accountId, instrument, p, holding: null, realizedTry, dividendsTry, dayBase: 0, dayMissing: false };
    rows.push(row);
    if (p.quantity <= 1e-12) continue; // tamamen satılmış

    const currency = q.currency || [...p.costBy.keys()][0] || "TRY";
    const fxRate = rate(currency);
    const b = positionPnl(p, currency, q.price, rate);
    const foreign = currency !== "TRY";

    // "Bugün": fiyatın ait olduğu seans gününe göre (hafta sonu son seans, fonda son açıklanan gün).
    const sessionDate = q.sourceTime ? new Date(q.sourceTime).toLocaleDateString("en-CA", { timeZone: "Europe/Istanbul" }) : today;
    const day = dayChange(txsByKey.get(key) ?? [], sessionDate, q.price, q.prevClose, fxRate, prevRate(currency), rate);
    if (day) row.dayBase = day.baseTry;
    else row.dayMissing = true;
    const accountPart: HoldingAccountPart[] =
      p.accountId != null
        ? [
            {
              accountId: p.accountId,
              name: accName.get(p.accountId) ?? "?",
              quantity: p.quantity,
              avgCost: b.cost != null ? b.cost / p.quantity : null,
              valueTry: b.valueTry,
              costTry: b.costTry,
              pnlTry: b.pnlTry,
              pnlPct: b.pnlTry != null && b.costTry ? (b.pnlTry / b.costTry) * 100 : null,
            },
          ]
        : [];

    row.holding = {
      id: q.id,
      mode,
      accountId: p.accountId,
      accounts: accountPart,
      assetType: p.assetType,
      symbol: p.symbol,
      quantity: p.quantity,
      avgCost: b.cost != null ? b.cost / p.quantity : null,
      currency,
      price: q.price,
      changePct: q.changePct,
      stale: q.stale,
      priceError: q.error,
      fetchedAt: q.fetchedAt,
      sourceTime: q.sourceTime,
      source: q.source,
      delayed: q.delayed,
      daily: q.daily,
      approx: !!q.approx,
      bid: q.bid ?? null,
      ask: p.assetType === "gold" ? rawQ.price : null,
      name: q.name ?? null,
      dayChangeTry: day?.changeTry ?? null,
      dayChangePct: day && day.baseTry > 0 ? (day.changeTry / day.baseTry) * 100 : null,
      dayIsPastSession: sessionDate < today,
      dividendsTry,
      feesTry: p.feesTry,
      value: b.value,
      cost: b.cost,
      pnl: b.pnl,
      pnlPct: b.pnl != null && b.cost ? (b.pnl / b.cost) * 100 : null,
      valueTry: b.valueTry,
      costTry: b.costTry,
      pnlTry: b.pnlTry,
      realizedPnlTry: realizedTry,
      priceEffectTry: foreign ? b.priceEffectTry : null,
      fxEffectTry: foreign ? b.fxEffectTry : null,
      fxEstimated: p.fxEstimated,
      fxRate,
      firstDate: p.firstDate,
      days: daysSince(p.firstDate),
      annual: null,
    };
    const flows = flowsOf([row]);
    row.holding.annual = flows && b.valueTry != null ? annualReturn([...flows, { date: today, amount: b.valueTry }]) : null;
  }

  /** Satır kümesinin toplamları */
  const totalsOf = (set: Row[], divSel: (accountId: number | null) => boolean) => {
    let valueTry = 0;
    let costTry = 0;
    let incomplete = false;
    let realized = 0;
    let dividends = 0;
    let fees = 0;
    let dayTotal = 0;
    let dayBase = 0;
    let dayMissing = false;
    let open = 0;
    for (const r of set) {
      if (r.realizedTry != null) realized += r.realizedTry;
      fees += Number.isFinite(r.p.feesTry) ? r.p.feesTry : 0;
      const h = r.holding;
      if (!h) continue;
      open++;
      if (h.dayChangeTry != null) {
        dayTotal += h.dayChangeTry;
        dayBase += r.dayBase;
      }
      if (r.dayMissing) dayMissing = true;
      if (h.valueTry == null || h.costTry == null) {
        incomplete = true;
        continue;
      }
      valueTry += h.valueTry;
      costTry += h.costTry;
    }
    // Temettüler: pozisyon satırı olmayan (ör. işlemi silinmiş) kayıtlar dahil, seçili hesaplarınki.
    for (const d of divRows) if (divSel(d.accountId)) dividends += d.amountTry;
    realized += dividends;
    const flows = flowsOf(set);
    const annual =
      flows && !incomplete && set.length > 0
        ? annualReturn([...flows, ...(valueTry > 0 ? [{ date: today, amount: valueTry }] : [])])
        : null;
    return { valueTry, costTry, incomplete, realized, dividends, fees, dayTotal, dayBase, dayMissing, open, annual };
  };

  const selectedRows = rows.filter((r) => inSelection(r.accountId));
  // Görünümdeki pozisyonlar: hesap seçiliyse / sanalda satır satır, birleşikte varlık başına.
  let holdings: Holding[];
  if (mode === "real" && selectedAccount == null) {
    const byInstrument = new Map<string, Row[]>();
    for (const r of selectedRows) if (r.holding) byInstrument.set(r.instrument, [...(byInstrument.get(r.instrument) ?? []), r]);
    holdings = [...byInstrument.values()].map((parts) => (parts.length === 1 ? parts[0].holding! : mergeHoldings(parts, flowsOf)));
  } else {
    holdings = selectedRows.filter((r) => r.holding).map((r) => r.holding!);
  }
  holdings.sort((a, b) => (b.valueTry ?? -1) - (a.valueTry ?? -1));

  const t = totalsOf(selectedRows, inSelection);
  const byType = new Map<AssetType, number>();
  for (const h of holdings) if (h.valueTry != null && h.costTry != null) byType.set(h.assetType, (byType.get(h.assetType) ?? 0) + h.valueTry);
  const allocation: AllocationSlice[] = ASSET_TYPES.filter((ty) => (byType.get(ty) ?? 0) > 0)
    .map((ty) => ({ assetType: ty, valueTry: byType.get(ty)!, pct: t.valueTry > 0 ? (byType.get(ty)! / t.valueTry) * 100 : 0 }))
    .sort((a, b) => b.valueTry - a.valueTry);

  const accountTotals: AccountTotal[] = accounts
    .filter((a) => !a.archived || rows.some((r) => r.accountId === a.id && r.holding))
    .map((a) => {
      const set = rows.filter((r) => r.accountId === a.id);
      const at = totalsOf(set, (id) => id === a.id);
      return {
        accountId: a.id,
        name: a.name,
        includeInTotal: a.includeInTotal,
        archived: a.archived,
        feePct: a.feePct,
        valueTry: at.valueTry,
        costTry: at.costTry,
        pnlTry: at.valueTry - at.costTry,
        pnlPct: at.costTry > 0 ? ((at.valueTry - at.costTry) / at.costTry) * 100 : null,
        realizedPnlTry: at.realized,
        positions: at.open,
        incomplete: at.incomplete,
        annual: at.annual,
      };
    });

  return {
    mode,
    account: selectedAccount,
    holdings,
    totals: {
      valueTry: t.valueTry,
      costTry: t.costTry,
      pnlTry: t.valueTry - t.costTry,
      pnlPct: t.costTry > 0 ? ((t.valueTry - t.costTry) / t.costTry) * 100 : null,
      realizedPnlTry: t.realized,
      dividendsTry: t.dividends,
      feesTry: t.fees,
      dayChangeTry: holdings.length === 0 || (t.dayMissing && t.dayBase === 0) ? null : t.dayTotal,
      dayChangePct: t.dayBase > 0 ? (t.dayTotal / t.dayBase) * 100 : null,
      incomplete: t.incomplete,
      anyStale: holdings.some((h) => h.stale) || Object.values(rates).some((r) => r.stale),
      annual: t.annual,
    },
    accounts: accountTotals,
    allocation,
    rates,
    updatedAt: Date.now(),
  };
}
