import "server-only";
import type { AssetType, Currency, Mode, Side } from "./assets";
import * as portfolio from "./portfolio";
import * as orders from "./orders";
import * as market from "./market";
import * as snapshots from "./snapshots";
import * as technical from "./technical";
import * as dividends from "./dividends";
import * as kap from "./kap";
import * as positionDetail from "./positionDetail";
import * as alarms from "./alarms";
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

// ---- Piyasa -----------------------------------------------------------------

export type { WatchItem, SearchResult, ChartData, ChartRange } from "./market";
export type { SnapshotPoint } from "./snapshots";

/** Kullanıcının izleme listesi (eklenme sırasıyla). */
export function listWatchlist() {
  return market.listWatchlist();
}

/** İzleme listesine varlık ekler (zaten varsa mevcut kaydı döndürür). */
export function addToWatchlist(p: { assetType: AssetType; symbol: string; name?: string | null }) {
  return market.addWatch(p.assetType, p.symbol, p.name);
}

/** İzleme listesinden çıkarır. Bulunamazsa false. */
export function removeFromWatchlist(id: number) {
  return market.removeWatch(id);
}

/** Sembol arama: Yahoo Finance + Binance USDT pariteleri + Türkçe hazır eşleşmeler. */
export function searchSymbols(query: string) {
  return market.searchSymbols(query);
}

/** Fiyat grafiği verisi. range: 1G, 1H, 1A, 3A, 1Y, 5Y */
export function getPriceChart(instrument: InstrumentRef, range: market.ChartRange) {
  return market.getChart(instrument.type, instrument.symbol, range);
}

/** Portföyün günlük değer geçmişi (ilk anlık görüntüden itibaren). */
export function getPortfolioHistory(mode: Mode) {
  return snapshots.listSnapshots(mode);
}

// ---- Teknik analiz ------------------------------------------------------------------

export type { TechnicalAnalysis, SignalRow } from "./technical";

/**
 * Bir varlığın teknik göstergeleri (SMA/EMA, RSI, MACD, Bollinger, hacim) ve
 * Güçlü Al … Güçlü Sat özet sinyali, nedenleri ve sade açıklamalarıyla.
 * overlays: true → grafik katmanları için seriler de döner.
 */
export function getTechnicalSignals(instrument: InstrumentRef, opts: { overlays?: boolean; name?: string | null } = {}) {
  return technical.getTechnicalAnalysis(instrument.type, instrument.symbol, opts);
}

/** Tüm pozisyon (gerçek + sanal) ve izleme listesi varlıklarının güncel teknik sinyali. */
export function listTechnicalSignals() {
  return technical.listSignals();
}

// ---- Temettü (kâr payı) -------------------------------------------------------------

export type { DividendRecord, DividendSuggestion, DividendOverview, DividendHistory } from "./dividends";

/** Temettü sayfası: yıllara göre alınan temettüler, öneriler, yaklaşanlar, hisse başına geçmiş. */
export function getDividendOverview() {
  return dividends.getDividendOverview();
}

/** Bir hissenin temettü geçmişi (Yahoo; önbellekli). */
export function getDividendHistory(instrument: InstrumentRef) {
  return dividends.getDividendHistory(instrument.type, instrument.symbol);
}

/** Elde tutulurken ödenmiş, henüz onaylanmamış temettüler. */
export function getDividendSuggestions() {
  return dividends.getDividendSuggestions();
}

/** Onaylanmış / gizlenmiş temettü kayıtları. */
export function listDividends(opts: { mode?: Mode; status?: "confirmed" | "dismissed" } = {}) {
  return dividends.listDividendRecords(opts);
}

/** Temettüyü gelir olarak kaydeder (gerçekleşen K/Z'ye eklenir). { mode, assetType, symbol, exDate, amount? } */
export function confirmDividend(p: { mode: Mode; assetType: AssetType; symbol: string; exDate: string; amount?: Num | null; note?: string | null; overwrite?: boolean }) {
  return dividends.confirmDividend(p as unknown as Record<string, unknown>);
}

/** Temettü önerisini gizler. */
export function dismissDividend(p: { mode: Mode; assetType: AssetType; symbol: string; exDate: string }) {
  return dividends.dismissDividend(p as unknown as Record<string, unknown>);
}

/** Kaydedilmiş temettünün tutarını açıkça düzenler. Bulunamazsa null. */
export function editDividend(id: number, p: { amount: Num; note?: string | null }) {
  return dividends.updateDividend(id, p as unknown as Record<string, unknown>);
}

/** Temettü kaydını siler. Bulunamazsa false. */
export function removeDividend(id: number) {
  return dividends.deleteDividend(id);
}

// ---- KAP bildirimleri -----------------------------------------------------------------

export type { KapDisclosure } from "./kap";

/** Saklanan KAP bildirimleri (en yeni önce); ticker verilirse yalnızca o hisse. */
export function listKapDisclosures(opts: { ticker?: string; limit?: number; sinceMs?: number } = {}) {
  return kap.listKap(opts);
}

// ---- Pozisyon detayı ----------------------------------------------------------------

/** Tek pozisyonun ayrıntısı: özet, işlemler, emirler, temettü, KAP, haber, değer geçmişi. */
export function getPositionDetail(mode: Mode, instrument: InstrumentRef) {
  return positionDetail.getPositionDetail(mode, instrument.type, instrument.symbol);
}

// ---- Alarmlar (işlem yapmaz, yalnızca bildirim) ----------------------------------------

export type { Alarm, AlarmEvent, AlarmKind, AlarmScope } from "./alarms";

/** Alarmlar (en yeni önce); instrument verilirse yalnızca o varlığınkiler. */
export function listAlarms(opts: { instrument?: string; activeOnly?: boolean } = {}) {
  return alarms.listAlarms(opts);
}

/** Son çalan alarmlar */
export function listAlarmEvents(limit?: number) {
  return alarms.listAlarmEvents(limit);
}

export interface CreateAlarmParams {
  kind: alarms.AlarmKind;
  scope?: alarms.AlarmScope;
  assetType?: AssetType;
  symbol?: string;
  /** cost_change: hangi portföyün maliyeti */
  mode?: Mode;
  /** price: up = üstüne çıkarsa, down = altına inerse; yüzde alarmlarında up/down/both */
  direction?: alarms.AlarmDirection;
  /** price: fiyat; day_change/cost_change: yüzde; volume_spike: kat */
  threshold?: Num;
  repeat?: alarms.AlarmRepeat;
  cooldownMin?: Num;
  note?: string | null;
}

/** Alarm kurar (süresi dolmaz). Koşul sağlanırsa bildirim + push gönderilir; işlem yapılmaz. */
export async function createAlarm(p: CreateAlarmParams, source = "manuel") {
  const alarm = await alarms.createAlarm(p as unknown as Record<string, unknown>, source);
  // Koşul zaten sağlanıyorsa beklemeden kontrol et.
  await alarms.checkAlarms().catch(() => undefined);
  return alarms.getAlarm(alarm.id)!;
}

/** Alarmı siler. Bulunamazsa false. */
export function deleteAlarm(id: number) {
  return alarms.deleteAlarm(id);
}

/** Alarmı açar / kapatır. */
export function setAlarmActive(id: number, active: boolean) {
  return alarms.setAlarmActive(id, active);
}
