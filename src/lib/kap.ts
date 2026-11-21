import "server-only";
import { background } from "./background";
import { getDb, sqlNow, type SqlValue } from "./db";
import { activeTransactions } from "./portfolio";
import { buildPositions } from "./positions";
import { listWatchlist } from "./market";
import { addNotification } from "./orders";
import { sendPushToAll } from "./push";
import { getKapNotifyScope, getSetting, setSetting } from "./settings";
import { politeFetch } from "./http";

// KAP (Kamuyu Aydınlatma Platformu) bildirimleri.
// Şirketlerin resmi açıklamaları (bilanço, kâr payı, yeni iş, geri alım…). Emir
// izleyici döngüsünden çağrılır; en fazla 10 dakikada bir ve yalnızca hafta içi
// 08:00–22:00 (İstanbul) arasında tarih aralığıyla çekilir. Hisse filtresi kaynakta
// güvenilir olmadığından yerelde süzülür: yalnızca gerçek / sanal pozisyonlardaki
// ve izleme listesindeki BIST hisseleriyle ilgili bildirimler saklanır.

const KAP_URL = "https://www.kap.org.tr/tr/api/disclosure/members/byCriteria";
const POLL_EVERY_MS = 10 * 60_000;
/** Sık tekrar eden, bildirim gerektirmeyen teknik duyurular (saklanır ama bildirim üretmez) */
const QUIET_SUBJECTS = /Devre Kesici|Piyasa Yapıcılığı|Likidite Sağlayıcılık|Günlük Bülten/i;
const DIVIDEND_SUBJECTS = /Kar Payı|Kâr Payı|Temettü|Nakit Ödeme/i;

export function kapLink(disclosureIndex: number): string {
  return `https://www.kap.org.tr/tr/Bildirim/${disclosureIndex}`;
}

export interface KapDisclosure {
  id: number;
  publishAt: number;
  stockCodes: string[];
  companyTitle: string | null;
  subject: string | null;
  summary: string | null;
  isDividend: boolean;
  url: string;
}

interface KapRow {
  disclosure_index: number;
  publish_at: number;
  stock_codes: string;
  kap_title: string | null;
  subject: string | null;
  summary: string | null;
  is_dividend: number;
}

const fromRow = (r: KapRow): KapDisclosure => ({
  id: r.disclosure_index,
  publishAt: r.publish_at,
  stockCodes: r.stock_codes.split(",").filter(Boolean),
  companyTitle: r.kap_title,
  subject: r.subject,
  summary: r.summary,
  isDividend: r.is_dividend === 1,
  url: kapLink(r.disclosure_index),
});

/** Kayıtlı KAP bildirimleri (en yeni önce). ticker verilirse yalnızca o hisse. */
export async function listKap(opts: { ticker?: string; limit?: number; sinceMs?: number; dividendOnly?: boolean } = {}): Promise<KapDisclosure[]> {
  const where: string[] = [];
  const args: (string | number)[] = [];
  if (opts.ticker) {
    where.push("stock_codes LIKE ?");
    args.push(`%,${opts.ticker.toUpperCase()},%`);
  }
  if (opts.sinceMs) {
    where.push("publish_at >= ?");
    args.push(opts.sinceMs);
  }
  if (opts.dividendOnly) where.push("is_dividend = 1");
  const sql = `SELECT * FROM kap_disclosures ${where.length ? `WHERE ${where.join(" AND ")}` : ""} ORDER BY publish_at DESC LIMIT ?`;
  args.push(Math.min(500, opts.limit ?? 100));
  return (await (await getDb()).all(sql, [...args]) as unknown as KapRow[]).map(fromRow);
}

// ---- İlgili hisseler ------------------------------------------------------------

export interface TickerInterest {
  real: boolean;
  virtual: boolean;
  watch: boolean;
}

/** Pozisyonlardaki (gerçek + sanal) ve izleme listesindeki BIST hisseleri. Ağ kullanmaz. */
export async function tickersOfInterest(): Promise<Map<string, TickerInterest>> {
  const out = new Map<string, TickerInterest>();
  const get = (t: string) => {
    let e = out.get(t);
    if (!e) {
      e = { real: false, virtual: false, watch: false };
      out.set(t, e);
    }
    return e;
  };
  for (const mode of ["real", "virtual"] as const) {
    const txs = (await activeTransactions(mode)).filter((t) => t.assetType === "bist");
    for (const p of buildPositions(txs, () => 1)) if (p.quantity > 1e-12) get(p.symbol)[mode] = true;
  }
  for (const w of (await listWatchlist())) if (w.assetType === "bist") get(w.symbol).watch = true;
  out.delete("XU100");
  return out;
}

// ---- Çekme ----------------------------------------------------------------------

interface KapApiItem {
  publishDate?: unknown;
  kapTitle?: unknown;
  summary?: unknown;
  subject?: unknown;
  disclosureIndex?: unknown;
  disclosureClass?: unknown;
  disclosureType?: unknown;
  stockCodes?: unknown;
  relatedStocks?: unknown;
}

/** "20.11.2026 15:52:26" (İstanbul) → ms */
export function parseKapDate(s: unknown): number | null {
  if (typeof s !== "string") return null;
  const m = /^(\d{2})\.(\d{2})\.(\d{4})\s+(\d{2}):(\d{2})(?::(\d{2}))?/.exec(s.trim());
  if (!m) return null;
  const t = Date.parse(`${m[3]}-${m[2]}-${m[1]}T${m[4]}:${m[5]}:${m[6] ?? "00"}+03:00`);
  return Number.isFinite(t) ? t : null;
}

/** "TVB, VAKBN" + relatedStocks → ["TVB", "VAKBN"] */
export function kapCodes(item: KapApiItem): string[] {
  const out = new Set<string>();
  for (const v of [item.stockCodes, item.relatedStocks]) {
    if (typeof v !== "string") continue;
    for (const c of v.split(/[,;\s]+/)) {
      const code = c.trim().toUpperCase();
      if (/^[A-Z0-9]{2,10}$/.test(code)) out.add(code);
    }
  }
  return [...out];
}

const istanbulDate = (ms: number) => new Date(ms).toLocaleDateString("en-CA", { timeZone: "Europe/Istanbul" });

async function fetchKap(fromDate: string, toDate: string): Promise<KapApiItem[]> {
  const text = await politeFetch("KAP", KAP_URL, { json: { fromDate, toDate }, timeoutMs: 30_000, backoffBaseMs: 5 * 60_000, backoffMaxMs: 2 * 3600_000 });
  const data = JSON.parse(text) as unknown;
  if (!Array.isArray(data)) throw new Error("KAP yanıtı beklenen biçimde değil");
  return data as KapApiItem[];
}

export interface KapPollResult {
  fetched: number;
  stored: number;
  notified: number;
}

/**
 * KAP'tan tarih aralığıyla bildirimleri çeker, ilgili hisselere ait olanları saklar,
 * pozisyon hisseleri için (ayara göre) bildirim + push üretir. Hata fırlatabilir.
 */
const LAST_OK_KEY = "kap_last_ok";
const DAY_MS = 86_400_000;

/** Sorgu başlangıcı (ms): son başarılı çekim / son saklanan bildirim − 1 gün, en fazla 7 gün geri; hiçbiri yoksa 3 gün. */
export function kapFromMs(now: number, lastOk: number | null, latestStored: number | null): number {
  const base = lastOk ?? latestStored;
  if (base == null) return now - 3 * DAY_MS;
  return Math.max(now - 7 * DAY_MS, Math.min(now - DAY_MS, base - DAY_MS));
}

export async function pollKapNow(now = Date.now()): Promise<KapPollResult> {
  const interest = await tickersOfInterest();
  if (interest.size === 0) return { fetched: 0, stored: 0, notified: 0 };
  const db = await getDb();
  // Boşluk kalmasın: son başarılı çekimden (yoksa en son saklanan bildirimden) 1 gün öncesinden
  // başla; en fazla 7 gün geriye git. Hiç çekim yoksa son 3 gün.
  const from = istanbulDate(kapFromMs(now, Number(await getSetting(LAST_OK_KEY)) || null, (await db.get("SELECT MAX(publish_at) AS m FROM kap_disclosures") as { m: number | null }).m));
  const items = await fetchKap(from, istanbulDate(now));
  await setSetting(LAST_OK_KEY, String(now));

  const insert = (...p: SqlValue[]) =>
    db.run(
      `INSERT INTO kap_disclosures (disclosure_index, publish_at, stock_codes, kap_title, subject, summary, disclosure_class, disclosure_type, is_dividend, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT DO NOTHING`,
      [...p, sqlNow()],
    );
  const scope = await getKapNotifyScope();
  const fresh: { item: KapDisclosure; codes: string[] }[] = [];
  let stored = 0;
  for (const it of items) {
    const id = typeof it.disclosureIndex === "number" ? it.disclosureIndex : Number(it.disclosureIndex);
    const publishAt = parseKapDate(it.publishDate);
    if (!Number.isInteger(id) || id <= 0 || publishAt == null) continue;
    const codes = kapCodes(it).filter((c) => interest.has(c));
    if (codes.length === 0) continue;
    const str = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim().slice(0, 1000) : null);
    const subject = str(it.subject);
    const summary = str(it.summary);
    const isDividend = DIVIDEND_SUBJECTS.test(`${subject ?? ""} ${summary ?? ""}`);
    const r = await insert(id, publishAt, `,${codes.join(",")},`, str(it.kapTitle), subject, summary, str(it.disclosureClass), str(it.disclosureType), isDividend ? 1 : 0);
    if (Number(r.changes) === 1) {
      stored++;
      const d = fromRow({ disclosure_index: id, publish_at: publishAt, stock_codes: `,${codes.join(",")},`, kap_title: str(it.kapTitle), subject, summary, is_dividend: isDividend ? 1 : 0 });
      fresh.push({ item: d, codes });
    }
  }

  // Bildirim: yalnızca pozisyon hisseleri, son 3 saatte yayımlananlar (ilk çalışmada eski bildirim yağmuru olmasın).
  let notified = 0;
  if (scope !== "off") {
    const relevant = fresh.filter(
      ({ item, codes }) =>
        now - item.publishAt < 3 * 3600_000 &&
        !QUIET_SUBJECTS.test(item.subject ?? "") &&
        codes.some((c) => interest.get(c)!.real || (scope === "all" && interest.get(c)!.virtual)),
    );
    for (const { item, codes } of relevant.slice(0, 5)) {
      const n = {
        kind: "kap",
        title: `KAP: ${codes.join(", ")} — ${item.subject ?? "yeni bildirim"}`.slice(0, 140),
        body: (item.summary ?? item.companyTitle ?? "Yeni şirket açıklaması.").slice(0, 300),
        data: { disclosureIndex: item.id, url: item.url, codes },
      };
      await addNotification(n);
      background(() => sendPushToAll({ title: n.title, body: n.body, url: `/kap?hisse=${encodeURIComponent(codes[0])}`, tag: `kap-${item.id}` }));
      notified++;
    }
    if (relevant.length > 5) {
      await addNotification({ kind: "kap", title: `KAP: ${relevant.length - 5} bildirim daha`, body: "Tümünü KAP sayfasında görebilirsiniz." });
    }
  }
  return { fetched: items.length, stored, notified };
}

const gk = globalThis as unknown as { __yatirimKap?: { at: number; running: boolean; lastOk: number | null; lastError: string | null } };
function kapState() {
  return (gk.__yatirimKap ??= { at: 0, running: false, lastOk: null, lastError: null });
}

/** KAP sorgu durumu (son başarılı çekim, son hata) */
export function kapStatus() {
  const s = kapState();
  return { lastOk: s.lastOk, lastError: s.lastError };
}

function istanbulClock(now: number) {
  const parts = new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Istanbul", weekday: "short", hour: "2-digit", hourCycle: "h23" }).formatToParts(new Date(now));
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  return { weekday: get("weekday"), hour: Number(get("hour")) };
}

/** Emir izleyici döngüsünden çağrılır: hafta içi 08–22 arası, en fazla 10 dk'da bir. Hata fırlatmaz. */
export async function maybePollKap(now = Date.now()): Promise<KapPollResult | null> {
  const s = kapState();
  if (s.running || now - s.at < POLL_EVERY_MS) return null;
  const { weekday, hour } = istanbulClock(now);
  if (weekday === "Sat" || weekday === "Sun" || hour < 8 || hour >= 22) return null;
  s.at = now;
  s.running = true;
  try {
    const r = await pollKapNow(now);
    s.lastOk = Date.now();
    s.lastError = null;
    if (r.stored > 0) console.log(`[kap] ${r.fetched} bildirimden ${r.stored} yenisi saklandı, ${r.notified} bildirim`);
    return r;
  } catch (err) {
    s.lastError = (err as Error)?.message ?? String(err);
    console.warn("[kap] alınamadı:", s.lastError);
    return null;
  } finally {
    s.running = false;
  }
}

/**
 * Yapay zeka istemleri için son `hours` saatin KAP bildirimleri (hisse → satırlar).
 * Ücretsiz resmi kaynak; web aramasını azaltmak için kullanılır.
 */
export async function kapContext(tickers: string[], hours = 48, perTicker = 5): Promise<Map<string, string[]>> {
  const out = new Map<string, string[]>();
  const since = Date.now() - hours * 3600_000;
  for (const t of tickers) {
    const items = await listKap({ ticker: t, sinceMs: since, limit: perTicker });
    if (items.length === 0) continue;
    out.set(
      t,
      items.map((d) => {
        const when = new Date(d.publishAt).toLocaleString("tr-TR", { timeZone: "Europe/Istanbul", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
        return `${when} ${d.subject ?? ""}${d.summary && d.summary !== d.subject ? `: ${d.summary}` : ""} (${d.url})`;
      }),
    );
  }
  return out;
}
