import "server-only";
import { displaySymbol, instrumentId, supportsDividends, type AssetType, type Mode } from "./assets";
import { activeTransactions, getPortfolio, type Holding, type Transaction } from "./portfolio";
import { listOrders, type Order } from "./orders";
import { getDividendSuggestions, listDividendRecords, type DividendRecord, type DividendSuggestion } from "./dividends";
import { listKap, type KapDisclosure } from "./kap";
import { getLatestReport, type NewsItem } from "./news";
import { getDailyCandles } from "./technical";
import { closeOnOrBefore } from "./positions";
import { defaultAccount, getAccount, listAccounts } from "./accounts";
import { getNote, type PositionNote } from "./notes";
import { listAlarms, type Alarm } from "./alarms";

// POZİSYON DETAYI
// Portföydeki tek bir yatırımın (gerçek ya da sanal) ayrıntısı: özet, işlemler,
// bekleyen emirler, temettüler, KAP bildirimleri, son haber analizi maddesi ve
// "yatırımımın değeri" serisi (adet × günlük kapanış × o günün kuru, TL).

export interface ValuePoint {
  /** Unix saniye (UTC) */
  time: number;
  value: number;
}

/** "Şimdi satarsam": tahmini net tutar (komisyon düşülmüş) ve vergi notu */
export interface SellEstimate {
  /** Güncel değer (altında kuyumcu alış fiyatıyla), TL */
  grossTry: number;
  feePct: number;
  feeTry: number;
  netTry: number;
  /** Net − maliyet: satarsanız gerçekleşecek tahmini K/Z (TL) */
  pnlTry: number | null;
  /** Varlık türüne göre stopaj / vergi bilgisi (bilgilendirme) */
  taxNote: string;
}

export interface PositionDetail {
  mode: Mode;
  /** Seçili hesap (null: birleşik görünüm / sanal) */
  account: number | null;
  /** Tüm hesaplar (ad eşlemesi ve seçim için) */
  accounts: { id: number; name: string; feePct: number; archived: boolean }[];
  /** Bu varlığın işlemi olan hesaplar (hesap filtresi için) */
  heldIn: number[];
  note: PositionNote | null;
  sell: SellEstimate | null;
  /** Bu varlığın etkin fiyat alarmları (hedef / stop alarmı kurulu mu) */
  priceAlarms: Pick<Alarm, "id" | "direction" | "threshold" | "description">[];
  instrument: string;
  assetType: AssetType;
  symbol: string;
  name: string;
  /** Pozisyon açıksa güncel özet; tamamen satıldıysa null */
  holding: Holding | null;
  transactions: Transaction[];
  orders: Order[];
  dividends: DividendRecord[];
  dividendSuggestions: DividendSuggestion[];
  kap: KapDisclosure[];
  news: { item: NewsItem; reportId: number; date: string } | null;
  valueHistory: ValuePoint[];
  valueHistoryError: string | null;
}

const istanbulDate = (sec: number) => new Date(sec * 1000).toLocaleDateString("en-CA", { timeZone: "Europe/Istanbul" });

/** Pozisyonun TL değer serisi: girişten bu yana her gün (o günkü adet × kapanış × kur). */
async function valueHistory(type: AssetType, symbol: string, txs: Transaction[], since: string): Promise<ValuePoint[]> {
  const set = await getDailyCandles(type, symbol);
  const currency = set.currency || "TRY";
  let fx: { date: string; close: number }[] | null = null;
  if (currency !== "TRY") {
    const f = await getDailyCandles("fx", currency);
    fx = f.candles.map((c) => ({ date: istanbulDate(c.time), close: c.close }));
  }
  const sorted = [...txs].sort((a, b) => (a.date === b.date ? a.id - b.id : a.date < b.date ? -1 : 1));
  const out: ValuePoint[] = [];
  for (const c of set.candles) {
    const d = istanbulDate(c.time);
    if (d < since) continue;
    let qty = 0;
    for (const t of sorted) {
      if (t.date > d) break;
      qty = Math.max(0, qty + (t.side === "buy" ? t.quantity : -t.quantity));
    }
    const rate = fx ? closeOnOrBefore(fx, d) : 1;
    if (rate == null || !(c.close > 0)) continue;
    out.push({ time: c.time, value: qty * c.close * rate });
  }
  return out;
}

/** Satış kazancı vergisi hakkında kısa bilgi (bilgilendirme, kesin değildir) */
export function taxNoteFor(type: AssetType): string {
  switch (type) {
    case "bist":
      return "Borsa İstanbul'da işlem gören hisselerin alım-satım kazancında bireysel yatırımcıya genellikle %0 stopaj uygulanır (temettü stopajı ayrıdır). Oranlar değişebilir.";
    case "fund":
      return "Fonlarda stopaj fon türüne ve alış tarihine göre değişir (hisse yoğun fonlarda genellikle %0, diğerlerinde %17,5'e kadar). Kesinti satışta otomatik yapılır.";
    case "foreign":
      return "Yurt dışı hisse kazancında stopaj yoktur; yıllık gelir vergisi beyannamesiyle beyan gerekebilir (enflasyon endekslemesi ve istisna kuralları vardır).";
    case "crypto":
      return "Kripto kazançları için şu an özel bir stopaj yoktur; mevzuat değişiyor olabilir.";
    case "gold":
      return "Fiziki altın satış kazancına stopaj uygulanmaz. Değer zaten kuyumcu alış fiyatıyla (makas düşülmüş) hesaplanır.";
    case "fx":
      return "Bireylerin döviz alım-satım kazancına stopaj uygulanmaz.";
  }
}

export async function getPositionDetail(mode: Mode, type: AssetType, symbol: string, opts: { account?: number | null } = {}): Promise<PositionDetail> {
  const instrument = instrumentId(type, symbol);
  const account = mode === "real" && opts.account != null ? opts.account : null;
  const txs = (await activeTransactions(mode)).filter((t) => t.assetType === type && t.symbol === symbol && (account == null || t.accountId === account));
  const portfolio = await getPortfolio(mode, { account });
  const holding = portfolio.holdings.find((h) => h.id === instrument) ?? null;
  const accounts = mode === "real" ? (await listAccounts({ includeArchived: true })).map((a) => ({ id: a.id, name: a.name, feePct: a.feePct, archived: a.archived })) : [];

  // Komisyon oranı: seçili hesap; tek hesapta tutuluyorsa o; yoksa varsayılan hesap. Sanalda varsayılan hesap (tahmin).
  const feeAcc =
    (account != null ? await getAccount(account) : null) ??
    (holding && holding.accounts.length === 1 ? await getAccount(holding.accounts[0].accountId) : null) ??
    (await defaultAccount());
  let sell: SellEstimate | null = null;
  if (holding?.valueTry != null) {
    const parts = holding.accounts.length > 1 ? holding.accounts : null;
    // Birden çok hesapta tutuluyorsa her hesabın kendi oranıyla.
    const feeTry = parts
      ? parts.reduce((s, p) => s + ((p.valueTry ?? 0) * (accounts.find((a) => a.id === p.accountId)?.feePct ?? 0)) / 100, 0)
      : (holding.valueTry * feeAcc.feePct) / 100;
    const netTry = holding.valueTry - feeTry;
    sell = {
      grossTry: holding.valueTry,
      feePct: parts ? (holding.valueTry > 0 ? (feeTry / holding.valueTry) * 100 : 0) : feeAcc.feePct,
      feeTry,
      netTry,
      pnlTry: holding.costTry != null ? netTry - holding.costTry : null,
      taxNote: taxNoteFor(type),
    };
  }

  const report = await getLatestReport(instrument);
  const item = report?.items.find((i) => i.instrument === instrument) ?? null;

  const [suggestions, history] = await Promise.all([
    supportsDividends(type) ? getDividendSuggestions().catch(() => []) : Promise.resolve([] as DividendSuggestion[]),
    txs.length > 0
      ? valueHistory(type, symbol, txs, holding?.firstDate ?? txs.map((t) => t.date).sort()[0])
          .then((v) => ({ v, e: null as string | null }))
          .catch((err: unknown) => {
            console.warn(`[pozisyon] ${instrument} değer geçmişi:`, (err as Error).message);
            return { v: [] as ValuePoint[], e: "Değer geçmişi için fiyat verisi alınamadı." };
          })
      : Promise.resolve({ v: [] as ValuePoint[], e: null }),
  ]);

  return {
    mode,
    account,
    accounts,
    heldIn:
      mode === "real"
        ? [...new Set((await activeTransactions(mode)).filter((t) => t.assetType === type && t.symbol === symbol && t.accountId != null).map((t) => t.accountId!))]
        : [],
    note: await getNote(mode, type, symbol),
    sell,
    priceAlarms: (await listAlarms({ instrument, activeOnly: true }))
      .filter((a) => a.kind === "price")
      .map((a) => ({ id: a.id, direction: a.direction, threshold: a.threshold, description: a.description })),
    instrument,
    assetType: type,
    symbol,
    name: holding?.name ?? displaySymbol(type, symbol),
    holding,
    transactions: [...txs].sort((a, b) => (a.date === b.date ? b.id - a.id : a.date < b.date ? 1 : -1)),
    orders: (await listOrders("pending")).filter((o) => o.mode === mode && o.assetType === type && o.symbol === symbol && (account == null || o.accountId === account)),
    dividends: (await listDividendRecords({ mode, status: "confirmed" })).filter((d) => d.assetType === type && d.symbol === symbol && (account == null || d.accountId === account)),
    dividendSuggestions: suggestions.filter((s) => s.mode === mode && s.assetType === type && s.symbol === symbol && (account == null || s.accountId === account)),
    kap: type === "bist" ? await listKap({ ticker: symbol, limit: 5 }) : [],
    news: item && report ? { item, reportId: report.id, date: report.finishedAt ?? report.createdAt } : null,
    valueHistory: history.v,
    valueHistoryError: history.e,
  };
}
