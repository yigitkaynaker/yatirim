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
import { bySequence, buildPositions, dayChange, positionPnl } from "./positions";
import { ensureFxRates } from "./fxRates";

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
  fx_try: number | null;
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
  /** İşlem tarihindeki kur (canlı fiyatla açılan işlemlerde bilinir). Verilmezse TRY → 1, diğerleri sonradan doldurulur. */
  fxTry?: number | null;
}

function insert(input: TransactionInput, extras: InsertExtras = {}): number {
  const res = getDb()
    .prepare(
      `INSERT INTO transactions (mode, asset_type, symbol, side, quantity, price, currency, date, note,
         amount, amount_currency, price_time, source_id, order_id, fx_try)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
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
    );
  const id = Number(res.lastInsertRowid);
  // Kur bilinmiyorsa (elle girilen USD/EUR işlem) arka planda o günün kuruyla doldur.
  if (input.currency !== "TRY" && extras.fxTry == null) void ensureFxRates({ force: true });
  return id;
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
  // Tarih ya da para birimi değiştiyse işlem tarihi kuru yeniden alınır.
  const fxTry =
    input.currency === "TRY" ? 1 : existing.currency === input.currency && existing.date === input.date ? existing.fxTry : null;
  getDb()
    .prepare(
      `UPDATE transactions SET asset_type=?, symbol=?, side=?, quantity=?, price=?, currency=?, date=?, note=?,
         fx_try=?, updated_at=datetime('now') WHERE id=?`,
    )
    .run(input.assetType, input.symbol, input.side, input.quantity, input.price, input.currency, input.date, input.note, fxTry, id);
  if (fxTry == null) void ensureFxRates({ force: true });
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
    { mode: "virtual", assetType, symbol, side: "buy", quantity: p.quantity, price: p.price, currency: p.currency, date: todayIstanbul(), note },
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
  /** Fiyatın kaynaktaki zamanı (ms), kaynağı ve gecikme / günlük fiyat / yaklaşık bilgisi */
  sourceTime: number | null;
  source: string;
  delayed: boolean;
  daily: boolean;
  approx: boolean;
  /** Altın: kuyumcu alış fiyatı (satarsanız alacağınız), fiyat = satış fiyatı */
  bid: number | null;
  /** Kaynaktan gelen ad (fon unvanı) */
  name: string | null;
  /** "Bugün" (son seans) değişimi: önceki kapanışa göre, TL ve % */
  dayChangeTry: number | null;
  dayChangePct: number | null;
  /** true: fiyat bugüne değil önceki bir seansa ait (hafta sonu / tatil / fonun son açıklanan günü) */
  dayIsPastSession: boolean;
  /** Onaylanmış temettü gelirleri (TL, hak kullanım günü kuruyla) */
  dividendsTry: number;
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
    /** Gerçekleşen K/Z: satışlardan + onaylanmış temettü gelirleri */
    realizedPnlTry: number;
    /** Gerçekleşen K/Z'nin temettü kısmı */
    dividendsTry: number;
    /** "Bugün" değişimi (önceki kapanışa göre) — hesaplanamayan pozisyonlar hariç */
    dayChangeTry: number | null;
    dayChangePct: number | null;
    /** Değeri hesaplanamayan pozisyon var mı */
    incomplete: boolean;
    anyStale: boolean;
  };
  allocation: AllocationSlice[];
  rates: Record<string, Quote>;
  updatedAt: number;
}

function daysSince(date: string): number {
  const start = Date.parse(`${date}T00:00:00Z`);
  const today = Date.parse(`${todayIstanbul()}T00:00:00Z`);
  return Math.max(0, Math.round((today - start) / 86_400_000));
}

export async function getPortfolio(mode: Mode, opts: { force?: boolean } = {}): Promise<PortfolioSummary> {
  // Eski kayıtların / yeni elle girilen işlemlerin işlem tarihi kurunu tamamla (kısa süre bekler).
  await ensureFxRates({ timeoutMs: 5_000 });
  const txs = activeTransactions(mode);

  // Fiyatlar + gereken tüm kurlar.
  const instrumentKeys = new Map<string, InstrumentRef>();
  const fxNeeded = new Set<string>(["USD", "EUR"]);
  for (const t of txs) {
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

  const positions = buildPositions(txs, rate);
  const dividends = confirmedDividendsTry(mode, rate);
  const holdings: Holding[] = [];
  let realizedTotal = dividends.total;
  let dayTotal = 0;
  let dayBase = 0;
  let dayMissing = false;
  for (const p of positions) {
    const q = quoteById.get(instrumentId(p.assetType, p.symbol))!;
    const realizedTry = Number.isFinite(p.realizedTry) ? p.realizedTry : null;
    if (realizedTry != null) realizedTotal += realizedTry;
    if (p.quantity <= 1e-12) continue; // tamamen satılmış

    const currency = q.currency || [...p.costBy.keys()][0] || "TRY";
    const fxRate = rate(currency);
    const b = positionPnl(p, currency, q.price, rate);
    const foreign = currency !== "TRY";

    // "Bugün": fiyatın ait olduğu seans gününe göre (hafta sonu son seans, fonda son açıklanan gün).
    const sessionDate = q.sourceTime ? new Date(q.sourceTime).toLocaleDateString("en-CA", { timeZone: "Europe/Istanbul" }) : today;
    const assetTxs = txs.filter((t) => t.assetType === p.assetType && t.symbol === p.symbol);
    const day = dayChange(assetTxs, sessionDate, q.price, q.prevClose, fxRate, prevRate(currency), rate);
    if (day) {
      dayTotal += day.changeTry;
      dayBase += day.baseTry;
    } else dayMissing = true;

    holdings.push({
      id: q.id,
      mode,
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
      name: q.name ?? null,
      dayChangeTry: day?.changeTry ?? null,
      dayChangePct: day && day.baseTry > 0 ? (day.changeTry / day.baseTry) * 100 : null,
      dayIsPastSession: sessionDate < today,
      dividendsTry: dividends.byInstrument.get(q.id) ?? 0,
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
      dividendsTry: dividends.total,
      dayChangeTry: holdings.length === 0 || (dayMissing && dayBase === 0) ? null : dayTotal,
      dayChangePct: dayBase > 0 ? (dayTotal / dayBase) * 100 : null,
      incomplete,
      anyStale: holdings.some((h) => h.stale) || Object.values(rates).some((r) => r.stale),
    },
    allocation,
    rates,
    updatedAt: Date.now(),
  };
}

/**
 * Onaylanmış temettü gelirleri (TL). Hak kullanım günü kuru (fx_try) ile; kur
 * kaydedilmemişse güncel kur kullanılır.
 */
function confirmedDividendsTry(mode: Mode, rate: (cur: string) => number | null): { total: number; byInstrument: Map<string, number> } {
  const rows = getDb()
    .prepare("SELECT asset_type, symbol, amount, currency, fx_try FROM dividends WHERE mode = ? AND status = 'confirmed'")
    .all(mode) as { asset_type: AssetType; symbol: string; amount: number; currency: string; fx_try: number | null }[];
  const byInstrument = new Map<string, number>();
  let total = 0;
  for (const r of rows) {
    const fx = r.currency === "TRY" ? 1 : (r.fx_try ?? rate(r.currency));
    if (fx == null) continue;
    const v = r.amount * fx;
    total += v;
    const id = instrumentId(r.asset_type, r.symbol);
    byInstrument.set(id, (byInstrument.get(id) ?? 0) + v);
  }
  return { total, byInstrument };
}
