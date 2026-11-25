import "server-only";
import { getDb } from "./db";
import {
  displaySymbol,
  instrumentId,
  isAssetType,
  isMode,
  isValidSymbol,
  normalizeSymbol,
  supportsDividends,
  type AssetType,
  type Mode,
} from "./assets";
import { activeTransactions, ConflictError, todayIstanbul, ValidationError } from "./portfolio";
import { buildPositions } from "./positions";
import { eligibleDividends, netOfWithholding, quantityHeldBefore, unadjustForSplits, type DividendEvent, type SplitEvent } from "./dividendLogic";
import { getDividendWithholding } from "./settings";
import { yahooSymbolFor } from "./prices";
import { fxRateOn } from "./fxRates";
import { politeFetch } from "./http";
import { listKap, type KapDisclosure } from "./kap";
import { parseDecimal } from "./format";
import { accountNames, resolveAccount } from "./accounts";
import { getCurrentUserId } from "./userContext";

// TEMETTÜ (KÂR PAYI)
// - Geçmiş: Yahoo Finance aylık grafik uç noktasının "div" olayları (BIST .IS ve ABD hisseleri).
//   12 saat bellekte, ayrıca dividend_history tablosunda tutulur; kaynak yanıt vermezse
//   son kayıtlı geçmiş "eski" olarak kullanılır.
// - Öneri: kullanıcı hak kullanım tarihinden önceki gün o hisseyi tutuyorduysa
//   (dividendLogic.ts) "Temettü geliri" önerisi çıkar; tek tıkla onaylanır.
// - Onaylanan temettü dividends tablosuna, hak kullanım günü kuruyla (fx_try) yazılır
//   ve gerçekleşen K/Z'ye eklenir (portfolio.ts).

const HISTORY_TTL_MS = 12 * 3600_000;

export interface DividendHistory {
  instrument: string;
  assetType: AssetType;
  symbol: string;
  currency: string;
  /** Eskiden yeniye */
  events: DividendEvent[];
  fetchedAt: number | null;
  stale: boolean;
  error?: string;
}

const gh = globalThis as unknown as { __yatirimDivHist?: Map<string, DividendHistory> };
const memo = () => (gh.__yatirimDivHist ??= new Map());

async function fetchYahooDividends(yahooSymbol: string): Promise<{ currency: string; events: DividendEvent[] }> {
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(yahooSymbol)}?range=10y&interval=1mo&events=div%2Csplits`;
  const text = await politeFetch("Yahoo temettü", url, { backoffBaseMs: 60_000 });
  const data = JSON.parse(text) as {
    chart?: {
      result?:
        | {
            meta?: { currency?: string; exchangeTimezoneName?: string };
            events?: { dividends?: Record<string, { amount?: number; date?: number }>; splits?: Record<string, { date?: number; numerator?: number; denominator?: number }> };
          }[]
        | null;
      error?: unknown;
    };
  };
  const r = data.chart?.result?.[0];
  if (!r) throw new Error("Yahoo temettü yanıtı boş");
  let currency = (r.meta?.currency ?? "USD").toString();
  const tz = r.meta?.exchangeTimezoneName || "UTC";
  const div = currency === "GBp" || currency === "ZAc" ? 100 : 1;
  if (div !== 1) currency = currency === "GBp" ? "GBP" : "ZAR";
  const events: DividendEvent[] = [];
  for (const e of Object.values(r.events?.dividends ?? {})) {
    if (typeof e?.amount !== "number" || !Number.isFinite(e.amount) || e.amount <= 0 || typeof e.date !== "number") continue;
    let date: string;
    try {
      date = new Date(e.date * 1000).toLocaleDateString("en-CA", { timeZone: tz });
    } catch {
      date = new Date(e.date * 1000).toISOString().slice(0, 10);
    }
    events.push({ date, amount: e.amount / div });
  }
  events.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  const toDate = (t: number) => {
    try {
      return new Date(t * 1000).toLocaleDateString("en-CA", { timeZone: tz });
    } catch {
      return new Date(t * 1000).toISOString().slice(0, 10);
    }
  };
  const splits: SplitEvent[] = Object.values(r.events?.splits ?? {})
    .filter((s) => typeof s?.date === "number" && Number(s.numerator) > 0 && Number(s.denominator) > 0)
    .map((s) => ({ date: toDate(s.date!), ratio: Number(s.numerator) / Number(s.denominator) }));
  return { currency: currency.toUpperCase(), events: unadjustForSplits(events, splits) };
}

/** Bir hissenin temettü geçmişi (önbellekli). Hata fırlatmaz; kaynak yoksa error doludur. */
export async function getDividendHistory(type: AssetType, symbol: string, opts: { force?: boolean } = {}): Promise<DividendHistory> {
  const instrument = instrumentId(type, symbol);
  const base = { instrument, assetType: type, symbol };
  if (!supportsDividends(type)) return { ...base, currency: "TRY", events: [], fetchedAt: null, stale: false, error: "Bu varlık türünde temettü yok." };
  const hit = memo().get(instrument);
  if (!opts.force && hit && hit.fetchedAt && Date.now() - hit.fetchedAt < HISTORY_TTL_MS) return hit;

  const db = await getDb();
  const row = await db.get("SELECT currency, events, fetched_at FROM dividend_history WHERE instrument = ?", [instrument]) as
    | { currency: string | null; events: string; fetched_at: number }
    | undefined;
  if (!opts.force && row && Date.now() - row.fetched_at < HISTORY_TTL_MS) {
    const h: DividendHistory = { ...base, currency: row.currency ?? "TRY", events: safeEvents(row.events), fetchedAt: row.fetched_at, stale: false };
    memo().set(instrument, h);
    return h;
  }
  try {
    const { currency, events } = await fetchYahooDividends(yahooSymbolFor(type, symbol)!);
    const now = Date.now();
    await db.run(`INSERT INTO dividend_history (instrument, currency, events, fetched_at) VALUES (?, ?, ?, ?)
       ON CONFLICT(instrument) DO UPDATE SET currency = excluded.currency, events = excluded.events, fetched_at = excluded.fetched_at`, [instrument, currency, JSON.stringify(events), now]);
    const h: DividendHistory = { ...base, currency, events, fetchedAt: now, stale: false };
    memo().set(instrument, h);
    return h;
  } catch (err) {
    console.warn(`[temettü] ${instrument} geçmişi alınamadı:`, (err as Error)?.message ?? err);
    if (row) return { ...base, currency: row.currency ?? "TRY", events: safeEvents(row.events), fetchedAt: row.fetched_at, stale: true };
    return { ...base, currency: type === "bist" ? "TRY" : "USD", events: [], fetchedAt: null, stale: true, error: "Temettü geçmişi şu an alınamadı." };
  }
}

function safeEvents(json: string): DividendEvent[] {
  try {
    const v = JSON.parse(json) as DividendEvent[];
    return Array.isArray(v) ? v.filter((e) => typeof e?.date === "string" && typeof e?.amount === "number" && e.amount > 0) : [];
  } catch {
    return [];
  }
}

// ---- Kayıtlar ---------------------------------------------------------------------

export interface DividendRecord {
  id: number;
  mode: Mode;
  /** Gerçekte hesap (sanalda null) */
  accountId: number | null;
  accountName: string | null;
  assetType: AssetType;
  symbol: string;
  exDate: string;
  perShare: number;
  quantity: number;
  amount: number;
  /** Brüt tutar ve uygulanan stopaj (%); eski kayıtlarda null */
  grossAmount: number | null;
  withholdingPct: number | null;
  currency: string;
  fxTry: number | null;
  amountTry: number | null;
  status: "confirmed" | "dismissed";
  source: string;
  note: string | null;
  createdAt: string;
}

interface DivRow {
  id: number;
  mode: Mode;
  account_id: number;
  asset_type: AssetType;
  symbol: string;
  ex_date: string;
  per_share: number;
  quantity: number;
  amount: number;
  currency: string;
  fx_try: number | null;
  gross_amount: number | null;
  withholding_pct: number | null;
  status: "confirmed" | "dismissed";
  source: string;
  note: string | null;
  created_at: string;
}

const fromRow = (r: DivRow, names: Map<number, string>): DividendRecord => {
  const fx = r.currency === "TRY" ? 1 : r.fx_try;
  const accountId = r.mode === "real" ? r.account_id : null;
  return {
    id: r.id,
    mode: r.mode,
    accountId,
    accountName: accountId != null ? (names.get(accountId) ?? null) : null,
    assetType: r.asset_type,
    symbol: r.symbol,
    exDate: r.ex_date,
    perShare: r.per_share,
    quantity: r.quantity,
    amount: r.amount,
    grossAmount: r.gross_amount,
    withholdingPct: r.withholding_pct,
    currency: r.currency,
    fxTry: fx,
    amountTry: fx != null ? r.amount * fx : null,
    status: r.status,
    source: r.source,
    note: r.note,
    createdAt: r.created_at,
  };
};

export async function listDividendRecords(opts: { mode?: Mode; status?: "confirmed" | "dismissed" } = {}): Promise<DividendRecord[]> {
  const where: string[] = ["user_id = ?"];
  const args: (string | number)[] = [await getCurrentUserId()];
  if (opts.mode) {
    where.push("mode = ?");
    args.push(opts.mode);
  }
  if (opts.status) {
    where.push("status = ?");
    args.push(opts.status);
  }
  const rows = await (await getDb()).all(`SELECT * FROM dividends ${where.length ? `WHERE ${where.join(" AND ")}` : ""} ORDER BY ex_date DESC, id DESC`, [...args]) as unknown as DivRow[];
  const names = await accountNames();
  return rows.map((r) => fromRow(r, names));
}

// ---- Öneriler -----------------------------------------------------------------------

export interface DividendSuggestion {
  mode: Mode;
  /** Gerçekte hesap (sanalda null) */
  accountId: number | null;
  accountName: string | null;
  assetType: AssetType;
  symbol: string;
  name: string;
  exDate: string;
  perShare: number;
  quantity: number;
  /** Önerilen tutar = NET (stopaj sonrası) */
  amount: number;
  grossAmount: number;
  withholdingPct: number;
  currency: string;
  /** Tutar bölünmeye göre geri çevrildi (bilgi notu için) */
  splitAdjusted: boolean;
}

type DivAsset = { mode: Mode; accountId: number | null; assetType: AssetType; symbol: string };

/** İşlem geçmişindeki (gerçek + sanal) BIST / yabancı hisseler; gerçekte hesap başına */
async function dividendAssets(): Promise<DivAsset[]> {
  const out: DivAsset[] = [];
  for (const mode of ["real", "virtual"] as const) {
    const seen = new Set<string>();
    for (const t of (await activeTransactions(mode))) {
      if (!supportsDividends(t.assetType)) continue;
      const accountId = mode === "real" ? t.accountId : null;
      const id = `${accountId ?? 0}|${instrumentId(t.assetType, t.symbol)}`;
      if (seen.has(id) || t.symbol === "XU100") continue;
      seen.add(id);
      out.push({ mode, accountId, assetType: t.assetType, symbol: t.symbol });
    }
  }
  return out;
}

/** Bir hesaptaki (sanalda tüm) varlık işlemleri */
async function assetTxs(a: DivAsset) {
  return (await activeTransactions(a.mode)).filter(
    (t) => t.assetType === a.assetType && t.symbol === a.symbol && (a.mode === "virtual" || t.accountId === a.accountId),
  );
}

async function mapLimit<T, R>(items: T[], limit: number, fn: (t: T) => Promise<R>): Promise<R[]> {
  const out = new Array<R>(items.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, async () => {
      while (next < items.length) {
        const i = next++;
        out[i] = await fn(items[i]);
      }
    }),
  );
  return out;
}

/** Elde tutulurken ödenmiş ama henüz onaylanmamış / gizlenmemiş temettüler. */
export async function getDividendSuggestions(): Promise<DividendSuggestion[]> {
  const assets = await dividendAssets();
  const known = new Set(
    (
      await (await getDb()).all("SELECT mode, account_id, asset_type, symbol, ex_date FROM dividends WHERE user_id = ?", [await getCurrentUserId()]) as {
        mode: string;
        account_id: number;
        asset_type: string;
        symbol: string;
        ex_date: string;
      }[]
    ).map((r) => `${r.mode}|${r.mode === "real" ? r.account_id : 0}|${r.asset_type}:${r.symbol}|${r.ex_date}`),
  );
  const names = await accountNames();
  const withholding = await getDividendWithholding();
  const today = todayIstanbul();
  const lists = await mapLimit(assets, 3, async (a) => {
    const h = await getDividendHistory(a.assetType, a.symbol);
    const txs = await assetTxs(a);
    return eligibleDividends(txs, h.events, today)
      .filter((e) => !known.has(`${a.mode}|${a.accountId ?? 0}|${a.assetType}:${a.symbol}|${e.date}`))
      .map((e) => ({
        mode: a.mode,
        accountId: a.accountId,
        accountName: a.accountId != null ? (names.get(a.accountId) ?? null) : null,
        assetType: a.assetType,
        symbol: a.symbol,
        name: displaySymbol(a.assetType, a.symbol),
        exDate: e.date,
        perShare: e.amount,
        quantity: e.quantity,
        amount: netOfWithholding(e.total, withholding[a.assetType === "bist" ? "bist" : "foreign"]),
        grossAmount: e.total,
        withholdingPct: withholding[a.assetType === "bist" ? "bist" : "foreign"],
        currency: h.currency,
        splitAdjusted: (e.splitFactor ?? 1) !== 1,
      }));
  });
  return lists.flat().sort((a, b) => (a.exDate < b.exDate ? 1 : a.exDate > b.exDate ? -1 : 0));
}

// ---- Onay / gizleme ------------------------------------------------------------------

async function parseRef(body: Record<string, unknown>) {
  if (!isMode(body.mode)) throw new ValidationError("Portföy modu geçersiz.");
  if (!isAssetType(body.assetType) || !supportsDividends(body.assetType)) throw new ValidationError("Temettü yalnızca hisselerde kaydedilebilir.");
  const symbol = normalizeSymbol(body.assetType, String(body.symbol ?? ""));
  if (!isValidSymbol(body.assetType, symbol)) throw new ValidationError("Sembol geçersiz.");
  const exDate = String(body.exDate ?? "");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(exDate)) throw new ValidationError("Tarih geçersiz.");
  // Gerçekte hesap (verilmezse varsayılan hesap), sanalda 0.
  const accountId = body.mode === "real" ? (await resolveAccount(body, { allowArchived: true })).id : 0;
  return { mode: body.mode, accountId, assetType: body.assetType, symbol, exDate };
}

type DivRef = { mode: Mode; accountId: number; assetType: AssetType; symbol: string; exDate: string };

/**
 * Temettüyü gelir olarak kaydeder. Pay başına tutar kaynaktan, adet işlem
 * geçmişinden (hak kullanım tarihinden önceki gün) alınır. `amount` verilirse
 * (örn. stopaj sonrası net tutar) o kullanılır. Kur, hak kullanım günü kurudur.
 */
export async function confirmDividend(body: Record<string, unknown>): Promise<DividendRecord> {
  const ref = await parseRef(body);
  const h = await getDividendHistory(ref.assetType, ref.symbol);
  const ev = h.events.find((e) => e.date === ref.exDate);
  if (!ev) throw new ValidationError("Bu tarihte bir temettü bulunamadı.");
  const txs = await assetTxs({ mode: ref.mode, accountId: ref.mode === "real" ? ref.accountId : null, assetType: ref.assetType, symbol: ref.symbol });
  const quantity = quantityHeldBefore(txs, ref.exDate);
  if (quantity <= 0) throw new ValidationError("Hak kullanım tarihinden önce bu hisse elinizde görünmüyor.");
  const existing = await getRecord(ref);
  if (existing?.status === "confirmed" && body.overwrite !== true) {
    throw new ConflictError(
      `Bu temettü zaten kaydedilmiş (${existing.amount.toLocaleString("tr-TR", { maximumFractionDigits: 2 })} ${existing.currency}). Tutarı değiştirmek için kayıttaki "Düzenle"yi kullanın.`,
    );
  }
  const gross = quantity * ev.amount;
  const withholdingPct = (await getDividendWithholding())[ref.assetType === "bist" ? "bist" : "foreign"];
  let amount = netOfWithholding(gross, withholdingPct);
  if (body.amount !== undefined && body.amount !== null && body.amount !== "") {
    const a = parseDecimal(body.amount as string | number);
    if (!Number.isFinite(a) || a <= 0) throw new ValidationError("Tutar sıfırdan büyük olmalı.");
    amount = a;
  }
  const fx = h.currency === "TRY" ? 1 : await fxRateOn(h.currency, ref.exDate).catch(() => null);
  if (fx == null || !(fx > 0)) throw new ValidationError(`${h.currency}/TRY kuru alınamadı; biraz sonra tekrar deneyin.`);
  const note = typeof body.note === "string" && body.note.trim() ? body.note.trim().slice(0, 300) : null;
  await (await getDb()).run(`INSERT INTO dividends (user_id, mode, account_id, asset_type, symbol, ex_date, per_share, quantity, amount, currency, fx_try, status, source, note, gross_amount, withholding_pct)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'confirmed', 'otomatik', ?, ?, ?)
       ON CONFLICT(user_id, mode, account_id, asset_type, symbol, ex_date) DO UPDATE SET per_share = excluded.per_share, quantity = excluded.quantity,
         amount = excluded.amount, currency = excluded.currency, fx_try = excluded.fx_try, status = 'confirmed', note = excluded.note,
         gross_amount = excluded.gross_amount, withholding_pct = excluded.withholding_pct`, [await getCurrentUserId(), ref.mode, ref.accountId, ref.assetType, ref.symbol, ref.exDate, ev.amount, quantity, amount, h.currency, fx, note, gross, withholdingPct]);
  return (await getRecord(ref))!;
}

/** Onaylanmış temettünün tutarını / notunu açıkça düzenler (örn. hesaba geçen gerçek net tutar). */
export async function updateDividend(id: number, body: Record<string, unknown>): Promise<DividendRecord | null> {
  const row = await (await getDb()).get("SELECT * FROM dividends WHERE id = ? AND user_id = ?", [id, await getCurrentUserId()]) as unknown as DivRow | undefined;
  if (!row) return null;
  if (row.status !== "confirmed") throw new ValidationError("Yalnızca kaydedilmiş temettüler düzenlenebilir.");
  const a = parseDecimal((body.amount ?? "") as string | number);
  if (!Number.isFinite(a) || a <= 0) throw new ValidationError("Tutar sıfırdan büyük olmalı.");
  const note = typeof body.note === "string" ? body.note.trim().slice(0, 300) || null : row.note;
  await (await getDb()).run("UPDATE dividends SET amount = ?, note = ?, source = 'elle' WHERE id = ? AND user_id = ?", [a, note, id, await getCurrentUserId()]);
  return await getRecord({ mode: row.mode, accountId: row.account_id, assetType: row.asset_type, symbol: row.symbol, exDate: row.ex_date });
}

/** Öneriyi gizler (bir daha gösterilmez; gelir olarak sayılmaz). */
export async function dismissDividend(body: Record<string, unknown>): Promise<DividendRecord> {
  const ref = await parseRef(body);
  await (await getDb()).run(`INSERT INTO dividends (user_id, mode, account_id, asset_type, symbol, ex_date, per_share, quantity, amount, currency, fx_try, status)
       VALUES (?, ?, ?, ?, ?, ?, 0, 0, 0, 'TRY', 1, 'dismissed')
       ON CONFLICT(user_id, mode, account_id, asset_type, symbol, ex_date) DO UPDATE SET status = 'dismissed'`, [await getCurrentUserId(), ref.mode, ref.accountId, ref.assetType, ref.symbol, ref.exDate]);
  return (await getRecord(ref))!;
}

/** Kaydı siler (onaylanmış temettü geri alınır, gizlenen öneri yeniden görünür). */
export async function deleteDividend(id: number): Promise<boolean> {
  return Number((await (await getDb()).run("DELETE FROM dividends WHERE id = ? AND user_id = ?", [id, await getCurrentUserId()])).changes) > 0;
}

async function getRecord(ref: DivRef): Promise<DividendRecord | null> {
  const row = await (await getDb()).get("SELECT * FROM dividends WHERE user_id = ? AND mode = ? AND account_id = ? AND asset_type = ? AND symbol = ? AND ex_date = ?", [await getCurrentUserId(), ref.mode, ref.accountId, ref.assetType, ref.symbol, ref.exDate]) as unknown as DivRow | undefined;
  return row ? fromRow(row, await accountNames()) : null;
}

// ---- Temettü sayfası ----------------------------------------------------------------

export interface DividendYear {
  year: string;
  totalTry: number;
  items: DividendRecord[];
}

export interface HoldingDividends {
  instrument: string;
  assetType: AssetType;
  symbol: string;
  name: string;
  modes: Mode[];
  history: DividendHistory;
}

export interface UpcomingDividend {
  symbol: string;
  /** KAP bildirimi (kâr payı dağıtım duyurusu) ya da kaynakta ileri tarihli temettü */
  kind: "kap" | "kaynak";
  date: string | null;
  title: string;
  detail: string | null;
  url: string | null;
}

export interface DividendOverview {
  received: DividendYear[];
  receivedTotalTry: number;
  suggestions: DividendSuggestion[];
  upcoming: UpcomingDividend[];
  holdings: HoldingDividends[];
}

/** Şu an elde tutulan (gerçek ya da sanal) BIST / yabancı hisseler */
async function currentStockHoldings(): Promise<{ assetType: AssetType; symbol: string; modes: Mode[] }[]> {
  const map = new Map<string, { assetType: AssetType; symbol: string; modes: Mode[] }>();
  for (const mode of ["real", "virtual"] as const) {
    const txs = (await activeTransactions(mode)).filter((t) => supportsDividends(t.assetType) && t.symbol !== "XU100");
    for (const p of buildPositions(txs, () => 1)) {
      if (p.quantity <= 1e-12) continue;
      const id = instrumentId(p.assetType, p.symbol);
      const e = map.get(id) ?? { assetType: p.assetType, symbol: p.symbol, modes: [] };
      if (!e.modes.includes(mode)) e.modes.push(mode);
      map.set(id, e);
    }
  }
  return [...map.values()];
}

export async function getDividendOverview(): Promise<DividendOverview> {
  const confirmed = await listDividendRecords({ status: "confirmed" });
  const years = new Map<string, DividendYear>();
  let receivedTotalTry = 0;
  for (const r of confirmed) {
    const y = r.exDate.slice(0, 4);
    const e = years.get(y) ?? { year: y, totalTry: 0, items: [] };
    e.items.push(r);
    if (r.mode === "real" && r.amountTry != null) {
      e.totalTry += r.amountTry;
      receivedTotalTry += r.amountTry;
    }
    years.set(y, e);
  }

  const held = await currentStockHoldings();
  const [suggestions, histories] = await Promise.all([
    getDividendSuggestions(),
    mapLimit(held, 3, (h) => getDividendHistory(h.assetType, h.symbol)),
  ]);
  const holdings: HoldingDividends[] = held.map((h, i) => ({
    instrument: instrumentId(h.assetType, h.symbol),
    assetType: h.assetType,
    symbol: h.symbol,
    name: displaySymbol(h.assetType, h.symbol),
    modes: h.modes,
    history: histories[i],
  }));

  const today = todayIstanbul();
  const upcoming: UpcomingDividend[] = [];
  for (const h of holdings) {
    for (const e of h.history.events) {
      if (e.date > today) {
        upcoming.push({ symbol: h.symbol, kind: "kaynak", date: e.date, title: `Pay başına ${e.amount} ${h.history.currency}`, detail: "Hak kullanım tarihi", url: null });
      }
    }
  }
  const bistHeld = new Set(held.filter((h) => h.assetType === "bist").map((h) => h.symbol));
  const kap: KapDisclosure[] = await listKap({ dividendOnly: true, sinceMs: Date.now() - 120 * 86_400_000, limit: 50 });
  for (const d of kap) {
    const codes = d.stockCodes.filter((c) => bistHeld.has(c));
    if (codes.length === 0) continue;
    upcoming.push({
      symbol: codes.join(", "),
      kind: "kap",
      date: new Date(d.publishAt).toLocaleDateString("en-CA", { timeZone: "Europe/Istanbul" }),
      title: d.subject ?? "Kâr payı dağıtım bildirimi",
      detail: d.summary,
      url: d.url,
    });
  }
  upcoming.sort((a, b) => ((a.date ?? "") < (b.date ?? "") ? 1 : -1));

  return {
    received: [...years.values()].sort((a, b) => (a.year < b.year ? 1 : -1)),
    receivedTotalTry,
    suggestions,
    upcoming,
    holdings,
  };
}
