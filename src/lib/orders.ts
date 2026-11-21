import "server-only";
import { getDb, sqlNow } from "./db";
import { background } from "./background";
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
import { getQuotes, quoteUsable } from "./prices";
import { parseSizing, priceAtMarket, recordTransaction, todayIstanbul, ValidationError } from "./portfolio";
import { sendPushToAll, type PushPayload } from "./push";
import { accountNames, getAccount, resolveAccount } from "./accounts";

// Koşullu al/sat emirleri. YALNIZCA uygulama içinde gerçekleşir: koşul
// sağlanınca ilgili portföye (gerçek/sanal) işlem kaydı düşülür. Aracı kurum ya
// da borsa bağlantısı yoktur, gerçek para hareketi olmaz.

export type OrderCondition = "lte" | "gte";
export type OrderStatus = "pending" | "executed" | "cancelled" | "failed";
export type OrderSource = "manuel" | "yapay_zeka";

export interface Order {
  id: number;
  mode: Mode;
  /** Gerçek emirde hesap (sanalda null) */
  accountId: number | null;
  accountName: string | null;
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
  account_id: number | null;
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

function fromRow(r: OrderRow, names: Map<number, string>): Order {
  return {
    id: r.id,
    mode: r.mode,
    accountId: r.account_id,
    accountName: r.account_id != null ? (names.get(r.account_id) ?? null) : null,
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

export async function listOrders(status?: OrderStatus): Promise<Order[]> {
  const db = await getDb();
  const rows = (
    status
      ? await db.all("SELECT * FROM orders WHERE status = ? ORDER BY id DESC", [status])
      : await db.all("SELECT * FROM orders ORDER BY id DESC")
  ) as unknown as OrderRow[];
  const names = await accountNames();
  return rows.map((r) => fromRow(r, names));
}

export async function getOrder(id: number): Promise<Order | null> {
  const row = await (await getDb()).get("SELECT * FROM orders WHERE id = ?", [id]) as unknown as OrderRow | undefined;
  return row ? fromRow(row, await accountNames()) : null;
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
  const accountId = b.mode === "real" ? (await resolveAccount(b)).id : null;

  // Sembolün fiyatı alınabiliyor mu? Tetik para birimini de buradan öğreniriz.
  const [q] = await getQuotes([{ type: assetType, symbol }]);
  if (q.price == null || !q.currency) throw new ValidationError(`${symbol} için fiyat bulunamadı; sembolü kontrol edin.`);

  const res = await (await getDb()).run(`INSERT INTO orders (mode, asset_type, symbol, side, condition, trigger_price, trigger_currency,
         quantity, amount, amount_currency, source, note, account_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) RETURNING id`, [b.mode, assetType, symbol, b.side, b.condition, triggerPrice, q.currency, sizing.quantity, sizing.amount, sizing.amountCurrency, source, noteRaw ? noteRaw.slice(0, 500) : null, accountId]);
  return (await getOrder(res.lastId!))!;
}

export async function cancelOrder(id: number): Promise<Order | null> {
  const r = await (await getDb()).run("UPDATE orders SET status = 'cancelled', cancelled_at = ? WHERE id = ? AND status = 'pending'", [sqlNow(), id]);
  if (Number(r.changes) === 0) {
    const o = await getOrder(id);
    if (!o) return null;
    throw new ValidationError("Yalnızca bekleyen emirler iptal edilebilir.");
  }
  return await getOrder(id);
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

export async function addNotification(n: { kind: string; title: string; body: string; orderId?: number; data?: unknown }) {
  await (await getDb()).run("INSERT INTO notifications (kind, title, body, order_id, data) VALUES (?, ?, ?, ?, ?)", [n.kind, n.title, n.body, n.orderId ?? null, n.data === undefined ? null : JSON.stringify(n.data)]);
}

export async function listNotifications(limit = 30): Promise<{ items: AppNotification[]; unread: number }> {
  const db = await getDb();
  const rows = await db.all("SELECT * FROM notifications ORDER BY id DESC LIMIT ?", [limit]) as unknown as {
    id: number;
    kind: string;
    title: string;
    body: string;
    order_id: number | null;
    created_at: string;
    read_at: string | null;
  }[];
  const { c } = await db.get("SELECT COUNT(*) AS c FROM notifications WHERE read_at IS NULL") as { c: number };
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

export async function markNotificationsRead() {
  await (await getDb()).run("UPDATE notifications SET read_at = ? WHERE read_at IS NULL", [sqlNow()]);
}

// ---- Emir izleyici ----------------------------------------------------------

function conditionMet(o: Order, price: number) {
  return o.condition === "lte" ? price <= o.triggerPrice : price >= o.triggerPrice;
}

const sideLabel = (s: Side) => (s === "buy" ? "Alış" : "Satış");
const modeLabel = (m: Mode) => (m === "real" ? "gerçek" : "sanal");

/**
 * Bir emri gerçekleştirir. Önce emir atomik olarak "pending" → "executed"
 * durumuna alınır (UPDATE … WHERE status='pending'); yalnızca bunu başaran çağrı işlem
 * kaydeder. Hepsi tek bir veritabanı işlemi içinde yapıldığı için emir iki kez
 * gerçekleşemez (eşzamanlı iki nöbet çağrısında da). Gerçekleştiyse true.
 */
async function executeOrder(o: Order): Promise<boolean> {
  let pricing;
  try {
    pricing = await priceAtMarket(o.assetType, o.symbol, {
      quantity: o.quantity,
      amount: o.amount,
      amountCurrency: o.amountCurrency,
    });
  } catch {
    return false; // fiyat yok: sonraki turda tekrar denenir
  }
  if (!conditionMet(o, pricing.quotePrice)) return false;

  const db = await getDb();
  const name = displaySymbol(o.assetType, o.symbol);
  let push: PushPayload | null;
  let done = false;
  try {
    push = await db.tx(async (): Promise<PushPayload | null> => {
      const claim = await db.run(
        "UPDATE orders SET status = 'executed', executed_at = ?, executed_price = ? WHERE id = ? AND status = 'pending'",
        [sqlNow(), pricing.quotePrice, o.id],
      );
      // Başka bir tur zaten işledi ya da iptal edildi (değişiklik yok).
      if (claim.changes !== 1) return null;
      let txId: number;
      // Kayıt hatası (örn. eldekinden fazla satış) işlemin tamamını bozmasın: kayıt noktası.
      await db.exec("SAVEPOINT emir_kayit");
      try {
        // Gerçek emirde hesabın varsayılan komisyon oranı uygulanır.
        const acc = o.mode === "real" ? (o.accountId != null ? await getAccount(o.accountId) : null) : null;
        const fee = acc ? Math.round(((pricing.quantity * pricing.price * acc.feePct) / 100) * 1e6) / 1e6 : 0;
        const tx = await recordTransaction(
          {
            mode: o.mode,
            accountId: o.mode === "real" ? (acc?.id ?? (await resolveAccount({}, { allowArchived: true })).id) : null,
            fee,
            assetType: o.assetType,
            symbol: o.symbol,
            side: o.side,
            quantity: pricing.quantity,
            price: pricing.price,
            currency: pricing.currency,
            date: todayIstanbul(),
            note: `Emir #${o.id} ile otomatik${o.note ? ` · ${o.note}` : ""}`,
          },
          { orderId: o.id, priceTime: pricing.priceTime, amount: o.amount, amountCurrency: o.amountCurrency, fxTry: pricing.fxTry },
        );
        await db.exec("RELEASE SAVEPOINT emir_kayit");
        txId = tx.id;
      } catch (err) {
        await db.exec("ROLLBACK TO SAVEPOINT emir_kayit");
        // Örn. eldekinden fazla satış: emir başarısız olarak kapanır.
        const msg = err instanceof ValidationError ? err.message : "İşlem kaydedilemedi.";
        await db.run("UPDATE orders SET status = 'failed', executed_at = NULL, executed_price = NULL, error = ? WHERE id = ?", [msg, o.id]);
        const failedNote = {
          kind: "order_failed",
          title: `Emir gerçekleşemedi: ${name}`,
          body: `${sideLabel(o.side)} emri (#${o.id}) tetiklendi ama kaydedilemedi: ${msg}`,
          orderId: o.id,
        };
        await addNotification(failedNote);
        return { title: failedNote.title, body: failedNote.body, url: "/emirler", tag: `emir-${o.id}` };
      }
      await db.run("UPDATE orders SET executed_tx_id = ? WHERE id = ?", [txId, o.id]);
      const doneNote = {
        kind: "order_executed",
        title: `Emir gerçekleşti: ${name} ${sideLabel(o.side).toLocaleLowerCase("tr-TR")}`,
        body: `${formatQuantity(pricing.quantity)} adet, ${formatMoney(pricing.quotePrice, pricing.quoteCurrency, 4)} fiyatından ${modeLabel(o.mode)} portföye işlendi.`,
        orderId: o.id,
        data: { orderId: o.id, transactionId: txId, price: pricing.quotePrice, quantity: pricing.quantity },
      };
      await addNotification(doneNote);
      done = true;
      return { title: doneNote.title, body: doneNote.body, url: "/emirler", tag: `emir-${o.id}` };
    });
  } catch (err) {
    console.error(`[emirler] #${o.id} işlenemedi`, err);
    return false;
  }
  if (push) background(sendPushToAll(push));
  return done;
}

/** Bekleyen tüm emirleri canlı fiyatlarla kontrol eder. */
export async function checkPendingOrders(): Promise<{ checked: number; executed: number }> {
  const pending = await listOrders("pending");
  if (pending.length === 0) return { checked: 0, executed: 0 };
  const quotes = await getQuotes(pending.map((o) => ({ type: o.assetType, symbol: o.symbol })));
  let executed = 0;
  for (let i = 0; i < pending.length; i++) {
    const q = quotes[i];
    // Eski fiyatla emir gerçekleştirme (fonda kaynağın fiyat günü de yeni olmalı)
    if (!quoteUsable(q) || q.price == null) continue;
    if (!conditionMet(pending[i], q.price)) continue;
    if (await executeOrder(pending[i])) executed++;
  }
  return { checked: pending.length, executed };
}
