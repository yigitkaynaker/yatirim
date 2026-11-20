import "server-only";
import { getDb } from "./db";
import { getQuotes, yahooClient } from "./prices";
import { closeOnOrBefore } from "./positions";

// İşlem tarihindeki kur (transactions.fx_try).
// - Bugün (ya da ileri) tarihli işlem: canlı kur.
// - Geçmiş tarihli işlem: Yahoo'daki <PB>TRY=X günlük kapanışı (o gün ya da öncesindeki son gün).
// Kuru henüz bilinmeyen satırlar (eski kayıtlar, ağ hatası) portföy okunurken
// tamamlanır; başarısız olursa bir süre sonra yeniden denenir. O arada TL
// maliyet için güncel kur kullanılır (Holding.fxEstimated).

const RETRY_AFTER_MS = 5 * 60_000;
const DAY_MS = 86_400_000;

const g = globalThis as unknown as { __yatirimFxFill?: { inflight: Promise<void> | null; retryAt: number } };
function state() {
  return (g.__yatirimFxFill ??= { inflight: null, retryAt: 0 });
}

function istanbulDate(ms: number): string {
  return new Date(ms).toLocaleDateString("en-CA", { timeZone: "Europe/Istanbul" });
}

/** <PB>TRY=X günlük kapanışları (İstanbul tarihine göre, eskiden yeniye). */
async function historicalCloses(currency: string, from: string, to: string): Promise<{ date: string; close: number }[]> {
  const res = (await yahooClient().chart(
    `${currency}TRY=X`,
    { period1: new Date(Date.parse(from) - 10 * DAY_MS), period2: new Date(Date.parse(to) + 2 * DAY_MS), interval: "1d", return: "array" },
    { validateResult: false },
  )) as { quotes?: { date: Date | string | number; close: number | null }[] };
  const out: { date: string; close: number }[] = [];
  for (const q of res.quotes ?? []) {
    if (typeof q.close !== "number" || !Number.isFinite(q.close) || q.close <= 0) continue;
    const t = q.date instanceof Date ? q.date.getTime() : new Date(q.date).getTime();
    if (!Number.isFinite(t)) continue;
    // Yahoo döviz mumları gece yarısı (Londra) damgalı; İstanbul tarihi doğru günü verir.
    out.push({ date: istanbulDate(t), close: q.close });
  }
  out.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  return out;
}

/** Bir para biriminin verilen tarihteki TRY kuru. Bugün/ileri tarih → canlı kur. Alınamazsa null. */
export async function fxRateOn(currency: string, date: string): Promise<number | null> {
  if (currency === "TRY") return 1;
  const today = istanbulDate(Date.now());
  if (date >= today) {
    const [q] = await getQuotes([{ type: "fx", symbol: currency }]);
    return q.price ?? null;
  }
  const closes = await historicalCloses(currency, date, date);
  return closeOnOrBefore(closes, date);
}

interface MissingRow {
  id: number;
  currency: string;
  date: string;
}

async function fill(): Promise<void> {
  const db = getDb();
  const rows = db
    .prepare("SELECT id, currency, date FROM transactions WHERE fx_try IS NULL AND currency != 'TRY'")
    .all() as unknown as MissingRow[];
  if (rows.length === 0) return;
  const today = istanbulDate(Date.now());
  const update = db.prepare("UPDATE transactions SET fx_try = ? WHERE id = ? AND fx_try IS NULL");
  let failed = false;

  const byCurrency = new Map<string, MissingRow[]>();
  for (const r of rows) byCurrency.set(r.currency, [...(byCurrency.get(r.currency) ?? []), r]);
  for (const [currency, list] of byCurrency) {
    try {
      const past = list.filter((r) => r.date < today);
      const current = list.filter((r) => r.date >= today);
      if (current.length > 0) {
        const [q] = await getQuotes([{ type: "fx", symbol: currency }]);
        if (q.price != null && q.price > 0) for (const r of current) update.run(q.price, r.id);
        else failed = true;
      }
      if (past.length > 0) {
        const dates = past.map((r) => r.date).sort();
        const closes = await historicalCloses(currency, dates[0], dates[dates.length - 1]);
        for (const r of past) {
          const rate = closeOnOrBefore(closes, r.date);
          if (rate != null) update.run(rate, r.id);
          else failed = true;
        }
      }
    } catch (err) {
      failed = true;
      console.warn(`[kur] ${currency} geçmiş kurları alınamadı:`, (err as Error)?.message ?? err);
    }
  }
  if (failed) state().retryAt = Date.now() + RETRY_AFTER_MS;
}

/**
 * Kuru eksik işlemleri tamamlar (eşzamanlı çağrılar tek işi bekler). Hata fırlatmaz;
 * en fazla `timeoutMs` bekler, iş arka planda sürer.
 */
export async function ensureFxRates(opts: { timeoutMs?: number; force?: boolean } = {}): Promise<void> {
  const s = state();
  if (!s.inflight) {
    if (!opts.force && Date.now() < s.retryAt) return;
    // Bekleyen satır yoksa ağ çağrısı yapmadan dön.
    const any = getDb().prepare("SELECT 1 FROM transactions WHERE fx_try IS NULL AND currency != 'TRY' LIMIT 1").get();
    if (!any) return;
    s.inflight = fill()
      .catch((err) => {
        s.retryAt = Date.now() + RETRY_AFTER_MS;
        console.warn("[kur] tamamlama hatası", err);
      })
      .finally(() => {
        s.inflight = null;
      });
  }
  const timeout = opts.timeoutMs ?? 8_000;
  await Promise.race([s.inflight, new Promise((r) => setTimeout(r, timeout).unref?.())]);
}
