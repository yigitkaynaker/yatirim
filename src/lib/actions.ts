import "server-only";
import type { AssetType, Currency, Mode, Side } from "./assets";
import * as portfolio from "./portfolio";
import * as orders from "./orders";
import { runOrderCheck } from "./orderWatcher";
import { getQuotes, type InstrumentRef } from "./prices";

// EYLEM KATMANI
// Portföyü değiştiren / okuyan tüm işlemler buradaki düz, tipli fonksiyonlardan
// geçer. API route'ları bunları kullanır; ileride Claude tool-use sohbeti de
// AYNI fonksiyonları araç olarak çağıracak. Doğrulama hataları ValidationError
// (Türkçe mesaj) olarak fırlatılır.
//
// Sayısal alanlar sayı ya da Türkçe metin ("10.000", "12,5") olabilir.

export { ValidationError } from "./portfolio";
export type { Transaction, PortfolioSummary, Holding } from "./portfolio";
export type { Order, OrderStatus, OrderSource, OrderCondition, AppNotification } from "./orders";

type Num = number | string;

// ---- Okuma ----------------------------------------------------------------

/** Gerçek ya da sanal portföy özeti (pozisyonlar, toplamlar TL, dağılım). İki mod asla karışmaz. */
export function getPortfolioSummary(mode: Mode, opts: { force?: boolean } = {}) {
  return portfolio.getPortfolio(mode, opts);
}

export function listTransactions(mode?: Mode) {
  return portfolio.listTransactions(mode);
}

/** Canlı fiyatlar (önbellekli). */
export function getPrices(instruments: InstrumentRef[], opts: { force?: boolean } = {}) {
  return getQuotes(instruments, opts);
}

export function listOrders(status?: orders.OrderStatus) {
  return orders.listOrders(status);
}

export function listNotifications(limit?: number) {
  return orders.listNotifications(limit);
}

// ---- İşlemler -------------------------------------------------------------

export interface AddTransactionParams {
  mode?: Mode;
  assetType: AssetType;
  symbol: string;
  side: Side;
  quantity: Num;
  price: Num;
  currency: Currency;
  /** YYYY-MM-DD */
  date: string;
  note?: string | null;
}

/** Elle işlem ekler (gerçek ya da sanal). */
export function addTransaction(p: AddTransactionParams) {
  return portfolio.createTransaction(portfolio.parseTransactionInput(p));
}

/** İşlemi düzenler (modu değişmez). Bulunamazsa null. */
export function editTransaction(id: number, p: AddTransactionParams) {
  return portfolio.updateTransaction(id, portfolio.parseTransactionInput(p));
}

/** İşlemi siler. Bulunamazsa false. */
export function removeTransaction(id: number) {
  return portfolio.deleteTransaction(id);
}

// ---- Sanal portföy ----------------------------------------------------------

export interface SanalPositionParams {
  assetType: AssetType;
  symbol: string;
  /** Tutar ile giriş (örn. 10000 + "TRY") ... */
  amount?: Num;
  amountCurrency?: Currency;
  /** ... ya da adet ile giriş */
  quantity?: Num;
  note?: string | null;
}

/** Güncel canlı fiyattan sanal pozisyon açar; adet = tutar / fiyat. */
export function createSanalPosition(p: SanalPositionParams) {
  const entryBy = p.quantity != null && p.quantity !== "" ? "quantity" : "amount";
  return portfolio.createVirtualEntry({ ...p, entryBy });
}

export interface PromoteParams {
  assetType: AssetType;
  symbol: string;
  /** Gerçekte alınan adet ve ödenen birim fiyat */
  quantity: Num;
  price: Num;
  currency: Currency;
  date: string;
  note?: string | null;
}

/** "Gerçekten aldım": sanal pozisyonu arşivler, gerçek portföye alış işlemi ekler. */
export function promoteSanalToGercek(p: PromoteParams) {
  return portfolio.convertVirtualPosition(p);
}

// ---- Emirler ----------------------------------------------------------------

export interface PlaceOrderParams {
  mode: Mode;
  assetType: AssetType;
  symbol: string;
  side: Side;
  /** "lte": fiyat <= tetik, "gte": fiyat >= tetik */
  condition: orders.OrderCondition;
  /** Varlığın fiyat biriminde */
  triggerPrice: Num;
  amount?: Num;
  amountCurrency?: Currency;
  quantity?: Num;
  note?: string | null;
}

/**
 * Koşullu emir verir. Emir yalnızca UYGULAMA İÇİNDE gerçekleşir (aracı kurum yok).
 * Koşul sağlanınca izleyici otomatik olarak işlemi kaydeder ve bildirim oluşturur.
 */
export async function placeOrder(p: PlaceOrderParams, source: orders.OrderSource = "manuel") {
  const entryBy = p.quantity != null && p.quantity !== "" ? "quantity" : "amount";
  const order = await orders.createOrder({ ...p, entryBy }, source);
  // Koşul zaten sağlanıyorsa beklemeden kontrol et.
  await runOrderCheck();
  return orders.getOrder(order.id)!;
}

/** Bekleyen emri iptal eder. Bulunamazsa null. */
export function cancelOrder(id: number) {
  return orders.cancelOrder(id);
}

export function markNotificationsRead() {
  orders.markNotificationsRead();
}
