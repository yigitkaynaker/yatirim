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

  const db = getDb();
  const row = db.prepare("SELECT currency, events, fetched_at FROM dividend_history WHERE instrument = ?").get(instrument) as
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
    db.prepare(
      `INSERT INTO dividend_history (instrument, currency, events, fetched_at) VALUES (?, ?, ?, ?)
       ON CONFLICT(instrument) DO UPDATE SET currency = excluded.currency, events = excluded.events, fetched_at = excluded.fetched_at`,
    ).run(instrument, currency, JSON.stringify(events), now);
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

const fromRow = (r: DivRow): DividendRecord => {
  const fx = r.currency === "TRY" ? 1 : r.fx_try;
  return {
    id: r.id,
    mode: r.mode,
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

export function listDividendRecords(opts: { mode?: Mode; status?: "confirmed" | "dismissed" } = {}): DividendRecord[] {
  const where: string[] = [];
  const args: string[] = [];
  if (opts.mode) {
    where.push("mode = ?");
    args.push(opts.mode);
  }
  if (opts.status) {
    where.push("status = ?");
    args.push(opts.status);
  }
  const rows = getDb()
    .prepare(`SELECT * FROM dividends ${where.length ? `WHERE ${where.join(" AND ")}` : ""} ORDER BY ex_date DESC, id DESC`)
    .all(...args) as unknown as DivRow[];
  return rows.map(fromRow);
}

// ---- Öneriler -----------------------------------------------------------------------

export interface DividendSuggestion {
  mode: Mode;
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

/** İşlem geçmişindeki (gerçek + sanal) BIST / yabancı hisseler */
function dividendAssets(): { mode: Mode; assetType: AssetType; symbol: string }[] {
  const out: { mode: Mode; assetType: AssetType; symbol: string }[] = [];
  for (const mode of ["real", "virtual"] as const) {
    const seen = new Set<string>();
    for (const t of activeTransactions(mode)) {
      if (!supportsDividends(t.assetType)) continue;
      const id = instrumentId(t.assetType, t.symbol);
      if (seen.has(id) || t.symbol === "XU100") continue;
      seen.add(id);
      out.push({ mode, assetType: t.assetType, symbol: t.symbol });
    }
  }
  return out;
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
  const assets = dividendAssets();
  const known = new Set(
    (getDb().prepare("SELECT mode, asset_type, symbol, ex_date FROM dividends").all() as { mode: string; asset_type: string; symbol: string; ex_date: string }[]).map(
      (r) => `${r.mode}|${r.asset_type}:${r.symbol}|${r.ex_date}`,
    ),
  );
  const today = todayIstanbul();
  const lists = await mapLimit(assets, 3, async (a) => {
    const h = await getDividendHistory(a.assetType, a.symbol);
    const txs = activeTransactions(a.mode).filter((t) => t.assetType === a.assetType && t.symbol === a.symbol);
    return eligibleDividends(txs, h.events, today)
      .filter((e) => !known.has(`${a.mode}|${a.assetType}:${a.symbol}|${e.date}`))
      .map((e) => ({
        mode: a.mode,
        assetType: a.assetType,
        symbol: a.symbol,
        name: displaySymbol(a.assetType, a.symbol),
        exDate: e.date,
        perShare: e.amount,
        quantity: e.quantity,
        amount: netOfWithholding(e.total, getDividendWithholding()[a.assetType === "bist" ? "bist" : "foreign"]),
        grossAmount: e.total,
        withholdingPct: getDividendWithholding()[a.assetType === "bist" ? "bist" : "foreign"],
        currency: h.currency,
        splitAdjusted: (e.splitFactor ?? 1) !== 1,
      }));
  });
  return lists.flat().sort((a, b) => (a.exDate < b.exDate ? 1 : a.exDate > b.exDate ? -1 : 0));
}

// ---- Onay / gizleme ------------------------------------------------------------------

function parseRef(body: Record<string, unknown>) {
  if (!isMode(body.mode)) throw new ValidationError("Portföy modu geçersiz.");
  if (!isAssetType(body.assetType) || !supportsDividends(body.assetType)) throw new ValidationError("Temettü yalnızca hisselerde kaydedilebilir.");
  const symbol = normalizeSymbol(body.assetType, String(body.symbol ?? ""));
  if (!isValidSymbol(body.assetType, symbol)) throw new ValidationError("Sembol geçersiz.");
  const exDate = String(body.exDate ?? "");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(exDate)) throw new ValidationError("Tarih geçersiz.");
  return { mode: body.mode, assetType: body.assetType, symbol, exDate };
}

/**
 * Temettüyü gelir olarak kaydeder. Pay başına tutar kaynaktan, adet işlem
 * geçmişinden (hak kullanım tarihinden önceki gün) alınır. `amount` verilirse
 * (örn. stopaj sonrası net tutar) o kullanılır. Kur, hak kullanım günü kurudur.
 */
export async function confirmDividend(body: Record<string, unknown>): Promise<DividendRecord> {
  const ref = parseRef(body);
  const h = await getDividendHistory(ref.assetType, ref.symbol);
  const ev = h.events.find((e) => e.date === ref.exDate);
  if (!ev) throw new ValidationError("Bu tarihte bir temettü bulunamadı.");
  const txs = activeTransactions(ref.mode).filter((t) => t.assetType === ref.assetType && t.symbol === ref.symbol);
  const quantity = quantityHeldBefore(txs, ref.exDate);
  if (quantity <= 0) throw new ValidationError("Hak kullanım tarihinden önce bu hisse elinizde görünmüyor.");
  const existing = getRecord(ref);
  if (existing?.status === "confirmed" && body.overwrite !== true) {
    throw new ConflictError(
      `Bu temettü zaten kaydedilmiş (${existing.amount.toLocaleString("tr-TR", { maximumFractionDigits: 2 })} ${existing.currency}). Tutarı değiştirmek için kayıttaki "Düzenle"yi kullanın.`,
    );
  }
  const gross = quantity * ev.amount;
  const withholdingPct = getDividendWithholding()[ref.assetType === "bist" ? "bist" : "foreign"];
  let amount = netOfWithholding(gross, withholdingPct);
  if (body.amount !== undefined && body.amount !== null && body.amount !== "") {
    const a = parseDecimal(body.amount as string | number);
    if (!Number.isFinite(a) || a <= 0) throw new ValidationError("Tutar sıfırdan büyük olmalı.");
    amount = a;
  }
  const fx = h.currency === "TRY" ? 1 : await fxRateOn(h.currency, ref.exDate).catch(() => null);
  if (fx == null || !(fx > 0)) throw new ValidationError(`${h.currency}/TRY kuru alınamadı; biraz sonra tekrar deneyin.`);
  const note = typeof body.note === "string" && body.note.trim() ? body.note.trim().slice(0, 300) : null;
  getDb()
    .prepare(
      `INSERT INTO dividends (mode, asset_type, symbol, ex_date, per_share, quantity, amount, currency, fx_try, status, source, note, gross_amount, withholding_pct)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'confirmed', 'otomatik', ?, ?, ?)
       ON CONFLICT(mode, asset_type, symbol, ex_date) DO UPDATE SET per_share = excluded.per_share, quantity = excluded.quantity,
         amount = excluded.amount, currency = excluded.currency, fx_try = excluded.fx_try, status = 'confirmed', note = excluded.note,
         gross_amount = excluded.gross_amount, withholding_pct = excluded.withholding_pct`,
    )
    .run(ref.mode, ref.assetType, ref.symbol, ref.exDate, ev.amount, quantity, amount, h.currency, fx, note, gross, withholdingPct);
  return getRecord(ref)!;
}

/** Onaylanmış temettünün tutarını / notunu açıkça düzenler (örn. hesaba geçen gerçek net tutar). */
export function updateDividend(id: number, body: Record<string, unknown>): DividendRecord | null {
  const row = getDb().prepare("SELECT * FROM dividends WHERE id = ?").get(id) as unknown as DivRow | undefined;
  if (!row) return null;
  if (row.status !== "confirmed") throw new ValidationError("Yalnızca kaydedilmiş temettüler düzenlenebilir.");
  const a = parseDecimal((body.amount ?? "") as string | number);
  if (!Number.isFinite(a) || a <= 0) throw new ValidationError("Tutar sıfırdan büyük olmalı.");
  const note = typeof body.note === "string" ? body.note.trim().slice(0, 300) || null : row.note;
  getDb().prepare("UPDATE dividends SET amount = ?, note = ?, source = 'elle' WHERE id = ?").run(a, note, id);
  return getRecord({ mode: row.mode, assetType: row.asset_type, symbol: row.symbol, exDate: row.ex_date });
}

/** Öneriyi gizler (bir daha gösterilmez; gelir olarak sayılmaz). */
export function dismissDividend(body: Record<string, unknown>): DividendRecord {
  const ref = parseRef(body);
  getDb()
    .prepare(
      `INSERT INTO dividends (mode, asset_type, symbol, ex_date, per_share, quantity, amount, currency, fx_try, status)
       VALUES (?, ?, ?, ?, 0, 0, 0, 'TRY', 1, 'dismissed')
       ON CONFLICT(mode, asset_type, symbol, ex_date) DO UPDATE SET status = 'dismissed'`,
    )
    .run(ref.mode, ref.assetType, ref.symbol, ref.exDate);
  return getRecord(ref)!;
}

/** Kaydı siler (onaylanmış temettü geri alınır, gizlenen öneri yeniden görünür). */
export function deleteDividend(id: number): boolean {
  return Number(getDb().prepare("DELETE FROM dividends WHERE id = ?").run(id).changes) > 0;
}

function getRecord(ref: { mode: Mode; assetType: AssetType; symbol: string; exDate: string }): DividendRecord | null {
  const row = getDb()
    .prepare("SELECT * FROM dividends WHERE mode = ? AND asset_type = ? AND symbol = ? AND ex_date = ?")
    .get(ref.mode, ref.assetType, ref.symbol, ref.exDate) as unknown as DivRow | undefined;
  return row ? fromRow(row) : null;
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
function currentStockHoldings(): { assetType: AssetType; symbol: string; modes: Mode[] }[] {
  const map = new Map<string, { assetType: AssetType; symbol: string; modes: Mode[] }>();
  for (const mode of ["real", "virtual"] as const) {
    const txs = activeTransactions(mode).filter((t) => supportsDividends(t.assetType) && t.symbol !== "XU100");
    for (const p of buildPositions(txs, () => 1)) {
      if (p.quantity <= 1e-12) continue;
      const id = instrumentId(p.assetType, p.symbol);
      const e = map.get(id) ?? { assetType: p.assetType, symbol: p.symbol, modes: [] };
      e.modes.push(mode);
      map.set(id, e);
    }
  }
  return [...map.values()];
}

export async function getDividendOverview(): Promise<DividendOverview> {
  const confirmed = listDividendRecords({ status: "confirmed" });
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

  const held = currentStockHoldings();
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
  const kap: KapDisclosure[] = listKap({ dividendOnly: true, sinceMs: Date.now() - 120 * 86_400_000, limit: 50 });
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
