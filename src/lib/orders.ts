import "server-only";
import { getDb } from "./db";
import {
  displaySymbol,
  isAssetType,
  isMode,
  isValidSymbol,
  normalizeSymbol,
  type AssetType,
  type Currency,
  type Mode,
  type Side,
} from "./assets";
import { formatMoney, formatQuantity, parseDecimal } from "./format";
import { getQuotes } from "./prices";
import { parseSizing, priceAtMarket, recordTransaction, todayIstanbul, ValidationError } from "./portfolio";
import { sendPushToAll } from "./push";

// Koşullu al/sat emirleri. YALNIZCA uygulama içinde gerçekleşir: koşul
// sağlanınca ilgili portföye (gerçek/sanal) işlem kaydı düşülür. Aracı kurum ya
// da borsa bağlantısı yoktur, gerçek para hareketi olmaz.

export type OrderCondition = "lte" | "gte";
export type OrderStatus = "pending" | "executed" | "cancelled" | "failed";
export type OrderSource = "manuel" | "yapay_zeka";

export interface Order {
  id: number;
  mode: Mode;
  assetType: AssetType;
  symbol: string;
  side: Side;
  condition: OrderCondition;
  triggerPrice: number;
  triggerCurrency: string;
  quantity: number | null;
  amount: number | null;
  amountCurrency: Currency | null;
  status: OrderStatus;
  source: OrderSource;
  note: string | null;
  createdAt: string;
  executedAt: string | null;
  executedPrice: number | null;
  executedTxId: number | null;
  cancelledAt: string | null;
  error: string | null;
}

interface OrderRow {
  id: number;
  mode: Mode;
  asset_type: AssetType;
  symbol: string;
  side: Side;
  condition: OrderCondition;
  trigger_price: number;
  trigger_currency: string;
  quantity: number | null;
  amount: number | null;
  amount_currency: Currency | null;
  status: OrderStatus;
  source: OrderSource;
  note: string | null;
  created_at: string;
  executed_at: string | null;
  executed_price: number | null;
  executed_tx_id: number | null;
  cancelled_at: string | null;
  error: string | null;
}

function fromRow(r: OrderRow): Order {
  return {
    id: r.id,
    mode: r.mode,
    assetType: r.asset_type,
    symbol: r.symbol,
    side: r.side,
    condition: r.condition,
    triggerPrice: r.trigger_price,
    triggerCurrency: r.trigger_currency,
    quantity: r.quantity,
    amount: r.amount,
    amountCurrency: r.amount_currency,
    status: r.status,
    source: r.source,
    note: r.note,
    createdAt: r.created_at,
    executedAt: r.executed_at,
    executedPrice: r.executed_price,
    executedTxId: r.executed_tx_id,
    cancelledAt: r.cancelled_at,
    error: r.error,
  };
}

export function listOrders(status?: OrderStatus): Order[] {
  const db = getDb();
  const rows = (
    status
      ? db.prepare("SELECT * FROM orders WHERE status = ? ORDER BY id DESC").all(status)
      : db.prepare("SELECT * FROM orders ORDER BY id DESC").all()
  ) as unknown as OrderRow[];
  return rows.map(fromRow);
}

export function getOrder(id: number): Order | null {
  const row = getDb().prepare("SELECT * FROM orders WHERE id = ?").get(id) as unknown as OrderRow | undefined;
  return row ? fromRow(row) : null;
}

/**
 * Emir oluşturur. Gövde: { mode, assetType, symbol, side, condition, triggerPrice,
 * entryBy: "amount"|"quantity", amount, amountCurrency | quantity, note }
 * Tetik fiyatı, varlığın fiyat biriminde yorumlanır (BIST: TRY, AAPL: USD, BTC: USD, altın: TRY/gram).
 */
export async function createOrder(body: unknown, source: OrderSource = "manuel"): Promise<Order> {
  if (!body || typeof body !== "object") throw new ValidationError("Geçersiz istek.");
  const b = body as Record<string, unknown>;
  if (!isMode(b.mode)) throw new ValidationError("Portföy modu geçersiz.");
  if (!isAssetType(b.assetType)) throw new ValidationError("Varlık türü geçersiz.");
  const assetType = b.assetType;
  const symbol = normalizeSymbol(assetType, String(b.symbol ?? ""));
  if (!isValidSymbol(assetType, symbol)) throw new ValidationError("Sembol geçersiz.");
  if (b.side !== "buy" && b.side !== "sell") throw new ValidationError("İşlem yönü geçersiz.");
  if (b.condition !== "lte" && b.condition !== "gte") throw new ValidationError("Koşul geçersiz.");
  const triggerPrice = parseDecimal(b.triggerPrice as string | number);
  if (!Number.isFinite(triggerPrice) || triggerPrice <= 0) throw new ValidationError("Tetik fiyatı geçersiz.");
  const sizing = parseSizing(b);
  const noteRaw = typeof b.note === "string" ? b.note.trim() : "";

  // Sembolün fiyatı alınabiliyor mu? Tetik para birimini de buradan öğreniriz.
  const [q] = await getQuotes([{ type: assetType, symbol }]);
  if (q.price == null || !q.currency) throw new ValidationError(`${symbol} için fiyat bulunamadı; sembolü kontrol edin.`);

  const res = getDb()
    .prepare(
      `INSERT INTO orders (mode, asset_type, symbol, side, condition, trigger_price, trigger_currency,
         quantity, amount, amount_currency, source, note)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      b.mode,
      assetType,
      symbol,
      b.side,
      b.condition,
      triggerPrice,
      q.currency,
      sizing.quantity,
      sizing.amount,
      sizing.amountCurrency,
      source,
      noteRaw ? noteRaw.slice(0, 500) : null,
    );
  return getOrder(Number(res.lastInsertRowid))!;
}

export function cancelOrder(id: number): Order | null {
  const r = getDb()
    .prepare("UPDATE orders SET status = 'cancelled', cancelled_at = datetime('now') WHERE id = ? AND status = 'pending'")
    .run(id);
  if (Number(r.changes) === 0) {
    const o = getOrder(id);
    if (!o) return null;
    throw new ValidationError("Yalnızca bekleyen emirler iptal edilebilir.");
  }
  return getOrder(id);
}

// ---- Bildirimler ------------------------------------------------------------

export interface AppNotification {
  id: number;
  kind: string;
  title: string;
  body: string;
  orderId: number | null;
  createdAt: string;
  readAt: string | null;
}

export function addNotification(n: { kind: string; title: string; body: string; orderId?: number; data?: unknown }) {
  getDb()
    .prepare("INSERT INTO notifications (kind, title, body, order_id, data) VALUES (?, ?, ?, ?, ?)")
    .run(n.kind, n.title, n.body, n.orderId ?? null, n.data === undefined ? null : JSON.stringify(n.data));
}

export function listNotifications(limit = 30): { items: AppNotification[]; unread: number } {
  const db = getDb();
  const rows = db.prepare("SELECT * FROM notifications ORDER BY id DESC LIMIT ?").all(limit) as unknown as {
    id: number;
    kind: string;
    title: string;
    body: string;
    order_id: number | null;
    created_at: string;
    read_at: string | null;
  }[];
  const { c } = db.prepare("SELECT COUNT(*) AS c FROM notifications WHERE read_at IS NULL").get() as { c: number };
  return {
    items: rows.map((r) => ({
      id: r.id,
      kind: r.kind,
      title: r.title,
      body: r.body,
      orderId: r.order_id,
      createdAt: r.created_at,
      readAt: r.read_at,
    })),
    unread: c,
  };
}

export function markNotificationsRead() {
  getDb().prepare("UPDATE notifications SET read_at = datetime('now') WHERE read_at IS NULL").run();
}

// ---- Emir izleyici ----------------------------------------------------------

function conditionMet(o: Order, price: number) {
  return o.condition === "lte" ? price <= o.triggerPrice : price >= o.triggerPrice;
}

const sideLabel = (s: Side) => (s === "buy" ? "Alış" : "Satış");
const modeLabel = (m: Mode) => (m === "real" ? "gerçek" : "sanal");

/**
 * Bir emri gerçekleştirir. Önce emir atomik olarak "pending" → "executed"
 * durumuna alınır (WHERE status='pending'); yalnızca bunu başaran çağrı işlem
 * kaydeder. Aynı SQLite işlemi içinde yapıldığı için emir iki kez gerçekleşemez.
 */
async function executeOrder(o: Order): Promise<void> {
  let pricing;
  try {
    pricing = await priceAtMarket(o.assetType, o.symbol, {
      quantity: o.quantity,
      amount: o.amount,
      amountCurrency: o.amountCurrency,
    });
  } catch {
    return; // fiyat yok: sonraki turda tekrar denenir
  }
  if (!conditionMet(o, pricing.quotePrice)) return;

  const db = getDb();
  const name = displaySymbol(o.assetType, o.symbol);
  db.exec("BEGIN IMMEDIATE");
  try {
    const claim = db
      .prepare(
        "UPDATE orders SET status = 'executed', executed_at = datetime('now'), executed_price = ? WHERE id = ? AND status = 'pending'",
      )
      .run(pricing.quotePrice, o.id);
    if (Number(claim.changes) !== 1) {
      db.exec("ROLLBACK");
      return; // başka bir tur zaten işledi ya da iptal edildi
    }
    let txId: number;
    try {
      const tx = recordTransaction(
        {
          mode: o.mode,
          assetType: o.assetType,
          symbol: o.symbol,
          side: o.side,
          quantity: pricing.quantity,
          price: pricing.price,
          currency: pricing.currency,
          date: todayIstanbul(),
          note: `Emir #${o.id} ile otomatik${o.note ? ` · ${o.note}` : ""}`,
        },
        { orderId: o.id, priceTime: pricing.priceTime, amount: o.amount, amountCurrency: o.amountCurrency },
      );
      txId = tx.id;
    } catch (err) {
      // Örn. eldekinden fazla satış: emir başarısız olarak kapanır.
      const msg = err instanceof ValidationError ? err.message : "İşlem kaydedilemedi.";
      db.prepare("UPDATE orders SET status = 'failed', executed_at = NULL, executed_price = NULL, error = ? WHERE id = ?").run(msg, o.id);
      const failedNote = {
        kind: "order_failed",
        title: `Emir gerçekleşemedi: ${name}`,
        body: `${sideLabel(o.side)} emri (#${o.id}) tetiklendi ama kaydedilemedi: ${msg}`,
        orderId: o.id,
      };
      addNotification(failedNote);
      db.exec("COMMIT");
      void sendPushToAll({ title: failedNote.title, body: failedNote.body, url: "/emirler", tag: `emir-${o.id}` });
      return;
    }
    db.prepare("UPDATE orders SET executed_tx_id = ? WHERE id = ?").run(txId, o.id);
    const doneNote = {
      kind: "order_executed",
      title: `Emir gerçekleşti: ${name} ${sideLabel(o.side).toLocaleLowerCase("tr-TR")}`,
      body: `${formatQuantity(pricing.quantity)} adet, ${formatMoney(pricing.quotePrice, pricing.quoteCurrency, 4)} fiyatından ${modeLabel(o.mode)} portföye işlendi.`,
      orderId: o.id,
      data: { orderId: o.id, transactionId: txId, price: pricing.quotePrice, quantity: pricing.quantity },
    };
    addNotification(doneNote);
    db.exec("COMMIT");
    void sendPushToAll({ title: doneNote.title, body: doneNote.body, url: "/emirler", tag: `emir-${o.id}` });
  } catch (err) {
    try {
      db.exec("ROLLBACK");
    } catch {}
    console.error(`[emirler] #${o.id} işlenemedi`, err);
  }
}

/** Bekleyen tüm emirleri canlı fiyatlarla kontrol eder. */
export async function checkPendingOrders(): Promise<{ checked: number; executed: number }> {
  const pending = listOrders("pending");
  if (pending.length === 0) return { checked: 0, executed: 0 };
  const quotes = await getQuotes(pending.map((o) => ({ type: o.assetType, symbol: o.symbol })));
  let executed = 0;
  for (let i = 0; i < pending.length; i++) {
    const q = quotes[i];
    if (q.price == null || q.stale) continue; // eski fiyatla emir gerçekleştirme
    if (!conditionMet(pending[i], q.price)) continue;
    await executeOrder(pending[i]);
    if (getOrder(pending[i].id)?.status === "executed") executed++;
  }
  return { checked: pending.length, executed };
}
