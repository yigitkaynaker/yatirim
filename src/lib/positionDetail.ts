import "server-only";
import { displaySymbol, instrumentId, supportsDividends, type AssetType, type Mode } from "./assets";
import { activeTransactions, getPortfolio, type Holding, type Transaction } from "./portfolio";
import { listOrders, type Order } from "./orders";
import { getDividendSuggestions, listDividendRecords, type DividendRecord, type DividendSuggestion } from "./dividends";
import { listKap, type KapDisclosure } from "./kap";
import { getLatestReport, type NewsItem } from "./news";
import { getDailyCandles } from "./technical";
import { closeOnOrBefore } from "./positions";

// POZİSYON DETAYI
// Portföydeki tek bir yatırımın (gerçek ya da sanal) ayrıntısı: özet, işlemler,
// bekleyen emirler, temettüler, KAP bildirimleri, son haber analizi maddesi ve
// "yatırımımın değeri" serisi (adet × günlük kapanış × o günün kuru, TL).

export interface ValuePoint {
  /** Unix saniye (UTC) */
  time: number;
  value: number;
}

export interface PositionDetail {
  mode: Mode;
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

export async function getPositionDetail(mode: Mode, type: AssetType, symbol: string): Promise<PositionDetail> {
  const instrument = instrumentId(type, symbol);
  const txs = activeTransactions(mode).filter((t) => t.assetType === type && t.symbol === symbol);
  const portfolio = await getPortfolio(mode);
  const holding = portfolio.holdings.find((h) => h.id === instrument) ?? null;

  const report = getLatestReport(instrument);
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
    instrument,
    assetType: type,
    symbol,
    name: holding?.name ?? displaySymbol(type, symbol),
    holding,
    transactions: [...txs].sort((a, b) => (a.date === b.date ? b.id - a.id : a.date < b.date ? 1 : -1)),
    orders: listOrders("pending").filter((o) => o.assetType === type && o.symbol === symbol),
    dividends: listDividendRecords({ mode, status: "confirmed" }).filter((d) => d.assetType === type && d.symbol === symbol),
    dividendSuggestions: suggestions.filter((s) => s.mode === mode && s.assetType === type && s.symbol === symbol),
    kap: type === "bist" ? listKap({ ticker: symbol, limit: 5 }) : [],
    news: item && report ? { item, reportId: report.id, date: report.finishedAt ?? report.createdAt } : null,
    valueHistory: history.v,
    valueHistoryError: history.e,
  };
}
