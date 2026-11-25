import "server-only";
import { getDb } from "./db";
import { displaySymbol, instrumentId, type AssetType } from "./assets";
import { activeTransactions, getPortfolio, listTransactions, todayIstanbul } from "./portfolio";
import { buildPositions } from "./positions";
import { getQuotes } from "./prices";
import { defaultAccount, listAccounts } from "./accounts";
import { listSnapshots } from "./snapshots";
import { maxDrawdown, twrIndex } from "./perfMath";
import { getCurrentUserId } from "./userContext";

// RAPORLAR
// 1) Yıllık gerçekleşen kazanç raporu: yıl → varlık; satışlardan gerçekleşen K/Z (işlem günü
//    kurlarıyla TL), temettü brüt / stopaj / net, komisyonlar. Resmî vergi beyanı DEĞİLDİR.
// 2) Sanal → gerçek gerçeklik kontrolü: sanal işlemlerin kazanan/kaybeden sayısı, en iyi/kötü,
//    en büyük düşüş ve tahmini komisyon maliyeti.

export interface YearAssetRow {
  instrument: string;
  assetType: AssetType;
  symbol: string;
  name: string;
  /** Satış adedi toplamı (bilgi) */
  soldQuantity: number;
  /** Satış geliri (komisyon düşülmüş), TL */
  proceedsTry: number;
  /** Satılan kısmın maliyeti (alış komisyonları dahil), TL */
  costTry: number;
  realizedTry: number;
  dividendsGrossTry: number;
  withholdingTry: number;
  dividendsNetTry: number;
  /** O yıl ödenen tüm komisyonlar (alış + satış), TL — bilgi; K/Z'ye zaten dahil */
  feesTry: number;
  /** Gerçekleşen K/Z + net temettü */
  totalTry: number;
}

export interface YearReport {
  year: string;
  rows: YearAssetRow[];
  totals: Omit<YearAssetRow, "instrument" | "assetType" | "symbol" | "name" | "soldQuantity">;
}

export interface YearlyReport {
  accountId: number | null;
  accountName: string | null;
  years: YearReport[];
  /** Kuru bilinmeyen işlem için güncel kur kullanıldı */
  fxEstimated: boolean;
  generatedAt: number;
}

const ZERO = () => ({
  proceedsTry: 0,
  costTry: 0,
  realizedTry: 0,
  dividendsGrossTry: 0,
  withholdingTry: 0,
  dividendsNetTry: 0,
  feesTry: 0,
  totalTry: 0,
});

/** Yıllık gerçekleşen kazanç raporu (gerçek portföy). account verilmezse tüm hesaplar. */
export async function getYearlyReport(opts: { account?: number | null } = {}): Promise<YearlyReport> {
  const accounts = await listAccounts({ includeArchived: true });
  const account = opts.account != null ? (accounts.find((a) => a.id === opts.account) ?? null) : null;
  const txs = (await activeTransactions("real")).filter((t) => !account || t.accountId === account.id);

  // Kuru kaydedilmemiş işlemler için güncel kur (önbellekli).
  const curs = [...new Set(txs.map((t) => t.currency).filter((c) => c !== "TRY"))];
  const fxq = curs.length ? await getQuotes(curs.map((c) => ({ type: "fx" as const, symbol: c }))).catch(() => []) : [];
  const rate = (cur: string) => (cur === "TRY" ? 1 : (fxq.find((q) => q.id === `fx:${cur}`)?.price ?? null));
  let fxEstimated = false;

  const years = new Map<string, Map<string, YearAssetRow>>();
  const rowFor = (year: string, assetType: AssetType, symbol: string): YearAssetRow => {
    const y = years.get(year) ?? new Map<string, YearAssetRow>();
    years.set(year, y);
    const id = instrumentId(assetType, symbol);
    let r = y.get(id);
    if (!r) {
      r = { instrument: id, assetType, symbol, name: displaySymbol(assetType, symbol), soldQuantity: 0, ...ZERO() };
      y.set(id, r);
    }
    return r;
  };

  for (const p of buildPositions(txs, rate)) {
    if (p.fxEstimated) fxEstimated = true;
    for (const s of p.sales) {
      const r = rowFor(s.date.slice(0, 4), p.assetType, p.symbol);
      r.soldQuantity += s.quantity;
      r.proceedsTry += s.proceedsTry;
      r.costTry += s.costTry;
      r.realizedTry += s.realizedTry;
    }
  }
  for (const t of txs) {
    if (!(t.fee > 0)) continue;
    const fx = t.currency === "TRY" ? 1 : (t.fxTry ?? rate(t.currency));
    if (fx == null) continue;
    rowFor(t.date.slice(0, 4), t.assetType, t.symbol).feesTry += t.fee * fx;
  }

  const divs = await (await getDb()).all("SELECT account_id, asset_type, symbol, ex_date, amount, gross_amount, currency, fx_try FROM dividends WHERE user_id = ? AND mode = 'real' AND status = 'confirmed'", [await getCurrentUserId()]) as { account_id: number; asset_type: AssetType; symbol: string; ex_date: string; amount: number; gross_amount: number | null; currency: string; fx_try: number | null }[];
  for (const d of divs) {
    if (account && d.account_id !== account.id) continue;
    const fx = d.currency === "TRY" ? 1 : (d.fx_try ?? rate(d.currency));
    if (fx == null) continue;
    const gross = (d.gross_amount ?? d.amount) * fx;
    const net = d.amount * fx;
    const r = rowFor(d.ex_date.slice(0, 4), d.asset_type, d.symbol);
    r.dividendsGrossTry += gross;
    r.dividendsNetTry += net;
    r.withholdingTry += Math.max(0, gross - net);
  }

  const out: YearReport[] = [...years.entries()]
    .sort((a, b) => (a[0] < b[0] ? 1 : -1))
    .map(([year, m]) => {
      const rows = [...m.values()]
        .map((r) => ({ ...r, totalTry: r.realizedTry + r.dividendsNetTry }))
        .sort((a, b) => Math.abs(b.totalTry) - Math.abs(a.totalTry) || b.feesTry - a.feesTry);
      const totals = ZERO();
      for (const r of rows) for (const k of Object.keys(totals) as (keyof typeof totals)[]) totals[k] += r[k];
      return { year, rows, totals };
    });
  return { accountId: account?.id ?? null, accountName: account?.name ?? null, years: out, fxEstimated, generatedAt: Date.now() };
}

// ---- Sanal gerçeklik kontrolü -------------------------------------------------------------

export interface SanalOutcome {
  name: string;
  instrument: string;
  open: boolean;
  pnlTry: number;
  pnlPct: number | null;
}

export interface SanalRealityCheck {
  /** Tüm sanal işlemler (gerçeğe aktarılıp arşivlenenler dahil) */
  trades: number;
  /** Sonucu belli olan pozisyonlar: açık (gerçekleşmemiş) + kapanmış (gerçekleşen) */
  positions: number;
  wins: number;
  losses: number;
  best: SanalOutcome | null;
  worst: SanalOutcome | null;
  /** Sanal portföyün en büyük düşüşü (%; zirveden dibe, para giriş/çıkışından arındırılmış). Yetersiz veri: null */
  maxDrawdownPct: number | null;
  snapshotDays: number;
  /** Bu işlemler gerçek olsaydı ödenecek tahmini komisyon (TL) */
  estFeesTry: number;
  /** Kullanılan oran (%) ve kaynağı */
  feePct: number;
  feeAssumed: boolean;
}

/** Hesapta oran yoksa kullanılan varsayılan komisyon tahmini (%; BIST'te tipik aralık 0,1–0,3) */
export const ASSUMED_FEE_PCT = 0.2;

export async function getSanalRealityCheck(): Promise<SanalRealityCheck> {
  const all = await listTransactions("virtual");
  const active = all.filter((t) => !t.convertedAt);
  const acc = await defaultAccount();
  const feeAssumed = !(acc.feePct > 0);
  const feePct = feeAssumed ? ASSUMED_FEE_PCT : acc.feePct;

  const curs = [...new Set(all.map((t) => t.currency).filter((c) => c !== "TRY"))];
  const fxq = curs.length ? await getQuotes(curs.map((c) => ({ type: "fx" as const, symbol: c }))).catch(() => []) : [];
  const rate = (cur: string) => (cur === "TRY" ? 1 : (fxq.find((q) => q.id === `fx:${cur}`)?.price ?? null));

  let estFeesTry = 0;
  for (const t of all) {
    const fx = t.currency === "TRY" ? 1 : (t.fxTry ?? rate(t.currency));
    if (fx != null) estFeesTry += (t.quantity * t.price * fx * feePct) / 100;
  }

  const outcomes: SanalOutcome[] = [];
  const summary = await getPortfolio("virtual").catch(() => null);
  for (const h of summary?.holdings ?? []) {
    if (h.pnlTry == null) continue;
    outcomes.push({ name: displaySymbol(h.assetType, h.symbol), instrument: h.id, open: true, pnlTry: h.pnlTry, pnlPct: h.pnlPct });
  }
  for (const p of buildPositions(active, rate)) {
    if (p.quantity > 1e-12 || p.sales.length === 0) continue; // açık olanlar yukarıda
    const cost = p.sales.reduce((s, x) => s + x.costTry, 0);
    outcomes.push({
      name: displaySymbol(p.assetType, p.symbol),
      instrument: instrumentId(p.assetType, p.symbol),
      open: false,
      pnlTry: p.realizedTry,
      pnlPct: cost > 0 ? (p.realizedTry / cost) * 100 : null,
    });
  }
  const byPct = [...outcomes].filter((o) => o.pnlPct != null).sort((a, b) => b.pnlPct! - a.pnlPct!);

  const snaps = await listSnapshots("virtual");
  const flows = active.map((t) => ({
    date: t.date,
    amount: (t.side === "buy" ? 1 : -1) * t.quantity * t.price * (t.currency === "TRY" ? 1 : (t.fxTry ?? rate(t.currency) ?? 1)),
  }));
  const values = snaps.map((s) => ({ date: s.date, value: s.valueTry }));
  if (summary && !summary.totals.incomplete && values.length && values[values.length - 1].date !== todayIstanbul()) {
    values.push({ date: todayIstanbul(), value: summary.totals.valueTry });
  }
  const dd = values.length >= 2 ? maxDrawdown(twrIndex(values, flows).map((p) => p.value)) : null;

  return {
    trades: all.length,
    positions: outcomes.length,
    wins: outcomes.filter((o) => o.pnlTry > 0).length,
    losses: outcomes.filter((o) => o.pnlTry < 0).length,
    best: byPct[0] ?? null,
    worst: byPct.length > 1 ? byPct[byPct.length - 1] : null,
    maxDrawdownPct: dd,
    snapshotDays: snaps.length,
    estFeesTry,
    feePct,
    feeAssumed,
  };
}
