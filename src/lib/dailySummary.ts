import "server-only";
import { background } from "./background";
import { getDb, sqlNow } from "./db";
import { displaySymbol, instrumentId, parseInstrumentId, type Mode } from "./assets";
import { getBudgetStatus, isAiConfigured } from "./aiClient";
import { getProvider, type AiBackend } from "./aiProvider";
import { getPortfolio, type PortfolioSummary } from "./portfolio";
import { listKap, tickersOfInterest } from "./kap";
import { cachedHeadlines, getHeadlines, headlineLine, type Headline } from "./freeNews";
import { alarmEventsSince } from "./alarms";
import { addNotification } from "./orders";
import { sendPushToAll } from "./push";
import { getQuotes } from "./prices";
import { unverifiedNumbers } from "./numberCheck";
import { usesSharedAi } from "./settings";
import { getCurrentUserId } from "./userContext";

// GÜNLÜK ÖZET ve "NEDEN HAREKET EDİYOR?"
// Günlük özet: hafta içi 18:45'ten (İstanbul) sonra bir kez. YALNIZCA önbellekteki /
// yerel verilerden kurulur (portföy, günün hareketleri, kayıtlı teknik sinyaller, KAP,
// önbellekteki RSS başlıkları, bugün çalan alarmlar); web araması YOK. Anahtar varsa ve
// bütçe uygunsa ucuz modelle tek çağrı; yoksa kurallı (yapay zekasız) özet yazılır.
// "Neden hareket ediyor?": günlük hareketi %3 ve üstü olan varlık için ücretsiz RSS + KAP
// bağlamıyla kısa açıklama (yapay zeka yoksa başlık listesi). 30 dk önbellekli.

export const SUMMARY_TIME = "18:45";
export const WHY_MIN_MOVE_PCT = 3;

export interface DailySummary {
  date: string;
  text: string;
  ai: boolean;
  model: string | null;
  costUsd: number;
  createdAt: string;
  unverified: string[];
}

function istanbulParts(now: Date) {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/Istanbul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    weekday: "short",
    hourCycle: "h23",
  }).formatToParts(now);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  return { date: `${get("year")}-${get("month")}-${get("day")}`, minutes: Number(get("hour")) * 60 + Number(get("minute")), weekday: get("weekday") };
}

const pct = (v: number | null | undefined) =>
  v == null || !Number.isFinite(v) ? "?" : `${v > 0 ? "+" : v < 0 ? "-" : ""}%${Math.abs(v).toLocaleString("tr-TR", { maximumFractionDigits: 2 })}`;
const tl = (v: number | null | undefined) =>
  v == null || !Number.isFinite(v) ? "?" : `${v > 0 ? "+" : ""}${v.toLocaleString("tr-TR", { maximumFractionDigits: 0 })} TL`;
const tlPlain = (v: number) => `${v.toLocaleString("tr-TR", { maximumFractionDigits: 0 })} TL`;

// ---- Veri toplama (ağ yok ya da yalnızca önbellekli fiyat) --------------------------------

export interface SummaryData {
  date: string;
  portfolios: { mode: Mode; valueTry: number; dayChangeTry: number | null; dayChangePct: number | null; pnlTry: number; holdings: number }[];
  movers: { name: string; instrument: string; mode: Mode; dayChangePct: number }[];
  signals: { name: string; label: string; date: string }[];
  kap: { ticker: string; subject: string; url: string }[];
  headlines: { name: string; items: Headline[] }[];
  alarms: string[];
}

export async function collectSummaryData(now = new Date()): Promise<SummaryData> {
  const date = istanbulParts(now).date;
  const portfolios: SummaryData["portfolios"] = [];
  const movers: SummaryData["movers"] = [];
  const held = new Map<string, { type: PortfolioSummary["holdings"][number]["assetType"]; symbol: string; name: string }>();
  for (const mode of ["real", "virtual"] as const) {
    try {
      const p = await getPortfolio(mode);
      if (p.holdings.length === 0) continue;
      portfolios.push({ mode, valueTry: p.totals.valueTry, dayChangeTry: p.totals.dayChangeTry, dayChangePct: p.totals.dayChangePct, pnlTry: p.totals.pnlTry, holdings: p.holdings.length });
      for (const h of p.holdings) {
        const name = displaySymbol(h.assetType, h.symbol);
        held.set(h.id, { type: h.assetType, symbol: h.symbol, name });
        if (h.dayChangePct != null && !h.dayIsPastSession) movers.push({ name, instrument: h.id, mode, dayChangePct: h.dayChangePct });
      }
    } catch (err) {
      console.warn("[özet] portföy okunamadı", (err as Error).message);
    }
  }
  movers.sort((a, b) => Math.abs(b.dayChangePct) - Math.abs(a.dayChangePct));

  const signals = (
    await (await getDb()).all("SELECT instrument, label, checked_date FROM technical_signals WHERE user_id = ? ORDER BY checked_date DESC", [await getCurrentUserId()]) as { instrument: string; label: string; checked_date: string }[]
  )
    .filter((s) => held.has(s.instrument))
    .map((s) => ({ name: held.get(s.instrument)!.name, label: s.label, date: s.checked_date }));

  const since = now.getTime() - 24 * 3600_000;
  const kap = (
    await Promise.all(
      [...(await tickersOfInterest()).keys()].map(async (t) =>
        (await listKap({ ticker: t, sinceMs: since, limit: 3 })).map((d) => ({ ticker: t, subject: d.subject ?? d.summary ?? "", url: d.url })),
      ),
    )
  ).flat();

  const headlines = (
    await Promise.all(
      [...held.values()].map(async (h) => ({
        name: h.name,
        items: (await cachedHeadlines(h.type, h.symbol)).items.filter((x) => !x.publishedAt || x.publishedAt >= since).slice(0, 3),
      })),
    )
  ).filter((h) => h.items.length > 0);

  const alarms = (await alarmEventsSince(since)).map((e) => e.message);
  return { date, portfolios, movers: movers.slice(0, 5), signals: signals.slice(0, 8), kap: kap.slice(0, 8), headlines: headlines.slice(0, 6), alarms: alarms.slice(0, 8) };
}

/** Yapay zekasız (kurallı) özet: anahtar yokken ya da bütçe dolduğunda. */
export function deterministicSummary(d: SummaryData): string {
  const lines: string[] = [];
  if (d.portfolios.length === 0) lines.push("Portföyünüzde henüz pozisyon yok.");
  for (const p of d.portfolios) {
    const label = p.mode === "real" ? "Gerçek portföy" : "Sanal portföy";
    lines.push(
      `${label}: değer ${tlPlain(p.valueTry)}, bugün ${tl(p.dayChangeTry)} (${pct(p.dayChangePct)}), toplam K/Z ${tl(p.pnlTry)}.`,
    );
  }
  if (d.movers.length) lines.push(`Günün en çok hareket edenleri: ${d.movers.slice(0, 3).map((m) => `${m.name} ${pct(m.dayChangePct)}`).join(", ")}.`);
  if (d.alarms.length) lines.push(`Bugün ${d.alarms.length} alarm çaldı.`);
  if (d.kap.length) lines.push(`Son 24 saatte ${d.kap.length} KAP bildirimi: ${d.kap.slice(0, 2).map((k) => `${k.ticker} – ${k.subject}`).join("; ")}.`);
  if (d.signals.length) lines.push(`Kayıtlı teknik sinyaller: ${d.signals.slice(0, 4).map((s) => `${s.name} ${s.label}`).join(", ")}.`);
  if (d.headlines.length) lines.push(`Haber başlığı olan varlıklar: ${d.headlines.map((h) => h.name).join(", ")} (ayrıntı varlık sayfasında).`);
  lines.push("Bu özet yalnızca uygulamadaki verilerden otomatik oluşturuldu; yatırım tavsiyesi değildir.");
  return lines.join("\n");
}

function dataBlock(d: SummaryData): string {
  return JSON.stringify(
    {
      tarih: d.date,
      portfoyler: d.portfolios.map((p) => ({ portfoy: p.mode === "real" ? "gerçek" : "sanal", deger_tl: Math.round(p.valueTry), bugun_tl: p.dayChangeTry == null ? null : Math.round(p.dayChangeTry), bugun_yuzde: p.dayChangePct == null ? null : Number(p.dayChangePct.toFixed(2)), toplam_kz_tl: Math.round(p.pnlTry) })),
      en_cok_hareket: d.movers.map((m) => ({ varlik: m.name, bugun_yuzde: Number(m.dayChangePct.toFixed(2)) })),
      teknik_sinyaller: d.signals,
      kap: d.kap,
      basliklar: d.headlines.map((h) => ({ varlik: h.name, basliklar: h.items.map(headlineLine) })),
      alarmlar: d.alarms,
    },
    null,
    1,
  );
}

/** Etkin sağlayıcının ucuz modeliyle tek çağrı (araç ve web araması yok). */
async function askCheap(client: AiBackend | undefined, kind: "ozet" | "neden", system: string, user: string): Promise<{ text: string; costUsd: number; model: string }> {
  const provider = await getProvider(client);
  const r = await provider.complete({ kind, system, user, cheap: true });
  return { text: r.text, costUsd: r.usage.costUsd, model: r.model };
}

const SUMMARY_SYSTEM = [
  "Kişisel yatırım uygulamasının Türkçe günlük özet yazarısın. Kullanıcı yatırıma yeni başlıyor.",
  "Yalnızca verilen JSON verisini kullan. Verilmeyen hiçbir rakamı yazma; rakamları verideki gibi kullan. Web araması yok.",
  "4-7 kısa madde yaz: portföyün bugünkü durumu, en çok hareket edenler, varsa KAP / haber başlıkları (bağlantısıyla), çalan alarmlar, teknik sinyaller.",
  "Haber iddiası yalnızca verilen başlıklardan; başlığın bağlantısını parantez içinde ver. Al/sat tavsiyesi verme.",
  "Sonunda tek satır: \"Yatırım tavsiyesi değildir.\"",
].join("\n");

/** Özeti üretir ve kaydeder (aynı gün yeniden üretilirse üzerine yazar). Hata fırlatmaz. */
export async function generateDailySummary(opts: { now?: Date; client?: AiBackend; notify?: boolean } = {}): Promise<DailySummary> {
  const now = opts.now ?? new Date();
  const d = await collectSummaryData(now);
  let text = deterministicSummary(d);
  let ai = false;
  let model: string | null = null;
  let costUsd = 0;
  let unverified: string[] = [];
  // Zamanlanmış (bildirimli) özette sahibin anahtarını paylaşan kullanıcı için yapay zeka kullanılmaz: maliyet koruması.
  const canAi = !!opts.client || ((await isAiConfigured()) && !(opts.notify && (await usesSharedAi())));
  if (canAi && d.portfolios.length > 0 && !(await getBudgetStatus(now)).overBudget) {
    try {
      const user = `Bugünün verisi (${d.date}, kaynak: uygulamanın önbelleği):\n${dataBlock(d)}`;
      const r = await askCheap(opts.client, "ozet", SUMMARY_SYSTEM, user);
      text = r.text;
      ai = true;
      model = r.model;
      costUsd = r.costUsd;
      unverified = unverifiedNumbers(text, [user]);
    } catch (err) {
      console.warn("[özet] yapay zeka özeti alınamadı, kurallı özet kullanılıyor:", (err as Error).message);
    }
  }
  await (await getDb()).run(`INSERT INTO daily_summaries (user_id, date, text, ai, model, cost_usd, data, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(user_id, date) DO UPDATE SET text = excluded.text, ai = excluded.ai, model = excluded.model, cost_usd = excluded.cost_usd,
         data = excluded.data, created_at = excluded.created_at`, [await getCurrentUserId(), d.date, text, ai ? 1 : 0, model, costUsd, JSON.stringify({ unverified }), sqlNow()]);
  if (opts.notify) {
    const first = text.split("\n").find((l) => l.trim()) ?? text;
    const n = { kind: "daily_summary", title: "Günlük özet", body: first.replace(/^[-•*\s]+/, "").slice(0, 300) };
    await addNotification(n);
    background(() => sendPushToAll({ title: n.title, body: n.body, url: "/", tag: `ozet-${d.date}` }));
  }
  return (await getLatestSummary(d.date))!;
}

/** Son özet (date verilirse o günün özeti) */
export async function getLatestSummary(date?: string): Promise<DailySummary | null> {
  const r = (
    date
      ? await (await getDb()).get("SELECT * FROM daily_summaries WHERE user_id = ? AND date = ?", [await getCurrentUserId(), date])
      : await (await getDb()).get("SELECT * FROM daily_summaries WHERE user_id = ? ORDER BY date DESC LIMIT 1", [await getCurrentUserId()])
  ) as
    | { date: string; text: string; ai: number; model: string | null; cost_usd: number; data: string | null; created_at: string }
    | undefined;
  if (!r) return null;
  let unverified: string[] = [];
  try {
    unverified = (JSON.parse(r.data ?? "{}") as { unverified?: string[] }).unverified ?? [];
  } catch {}
  return { date: r.date, text: r.text, ai: r.ai === 1, model: r.model, costUsd: r.cost_usd, createdAt: r.created_at, unverified };
}

export type SummaryRunResult = { ran: true; ai: boolean } | { ran: false; reason: "hafta_sonu" | "zamani_degil" | "zaten_calisti" | "hata" };

/** Emir izleyici döngüsünden: hafta içi 18:45 sonrası günde bir kez (scheduled_runs ile korunur). */
export async function maybeRunDailySummary(now = new Date(), client?: AiBackend): Promise<SummaryRunResult> {
  const p = istanbulParts(now);
  if (p.weekday === "Sat" || p.weekday === "Sun") return { ran: false, reason: "hafta_sonu" };
  const [h, m] = SUMMARY_TIME.split(":").map(Number);
  if (p.minutes < h * 60 + m) return { ran: false, reason: "zamani_degil" };
  const claim = await (await getDb()).run("INSERT INTO scheduled_runs (slot, created_at) VALUES (?, ?) ON CONFLICT DO NOTHING", [`u${await getCurrentUserId()} ozet ${p.date}`, sqlNow()]);
  if (Number(claim.changes) !== 1) return { ran: false, reason: "zaten_calisti" };
  try {
    const s = await generateDailySummary({ now, client, notify: true });
    console.log(`[özet] ${p.date} günlük özet hazır (${s.ai ? "yapay zeka" : "kurallı"})`);
    return { ran: true, ai: s.ai };
  } catch (err) {
    console.error("[özet] hata", err);
    return { ran: false, reason: "hata" };
  }
}

// ---- Neden hareket ediyor? ---------------------------------------------------------------

export interface WhyMoving {
  instrument: string;
  changePct: number | null;
  text: string;
  ai: boolean;
  headlines: Headline[];
  kap: { subject: string; url: string; publishAt: number }[];
  createdAt: number;
  unverified: string[];
}

const WHY_TTL_MS = 30 * 60_000;

/**
 * Günlük hareketi %3 ve üstü olan varlık için kısa açıklama. Önce ücretsiz RSS + KAP;
 * yapay zeka yalnızca anahtar varsa ve bütçe uygunsa (web araması yok, ucuz model).
 */
export async function whyMoving(id: string, opts: { client?: AiBackend; force?: boolean } = {}): Promise<WhyMoving> {
  const ref = parseInstrumentId(id);
  if (!ref) throw new Error("Varlık geçersiz.");
  const instrument = instrumentId(ref.type, ref.symbol);
  const key = `why:${instrument}`;
  if (!opts.force) {
    const row = await (await getDb()).get("SELECT value, fetched_at FROM ext_cache WHERE key = ?", [key]) as { value: string; fetched_at: number } | undefined;
    if (row && Date.now() - row.fetched_at < WHY_TTL_MS) return JSON.parse(row.value) as WhyMoving;
  }
  const [q] = await getQuotes([ref]);
  const changePct = q.price != null && q.prevClose ? ((q.price - q.prevClose) / q.prevClose) * 100 : q.changePct;
  const name = displaySymbol(ref.type, ref.symbol);
  const hs = await getHeadlines(ref.type, ref.symbol, { limit: 8 });
  const kap = ref.type === "bist" ? (await listKap({ ticker: ref.symbol, sinceMs: Date.now() - 48 * 3600_000, limit: 5 })).map((d) => ({ subject: d.subject ?? d.summary ?? "", url: d.url, publishAt: d.publishAt })) : [];
  const priceTime = q.sourceTime ?? q.fetchedAt;
  const when = priceTime ? new Date(priceTime).toLocaleString("tr-TR", { timeZone: "Europe/Istanbul", dateStyle: "short", timeStyle: "short" }) : "?";

  let text: string;
  let ai = false;
  let unverified: string[] = [];
  const fallback = [
    `${name} bugün ${pct(changePct)} hareket etti (veri zamanı: ${when}).`,
    hs.items.length || kap.length
      ? "Hareketle ilgili olabilecek ücretsiz kaynaklar aşağıda. Başlıklar tek başına nedeni kesin açıklamaz; haberin tamamını okuyun."
      : "Son 1 günde bu varlıkla ilgili haber başlığı ya da KAP bildirimi bulunamadı. Hareket genel piyasa yönünden, büyük alım satımlardan ya da henüz yayımlanmamış bir gelişmeden kaynaklanabilir.",
  ].join(" ");
  text = fallback;
  if ((opts.client || (await isAiConfigured())) && !(await getBudgetStatus()).overBudget && (hs.items.length > 0 || kap.length > 0)) {
    const user = [
      `Varlık: ${name} (${instrument}). Bugünkü değişim: ${changePct == null ? "?" : changePct.toFixed(2)}%, veri zamanı ${when}.`,
      kap.length ? `KAP (son 48 saat): ${kap.map((k) => `${k.subject} (${k.url})`).join(" | ")}` : "KAP bildirimi yok.",
      hs.items.length ? `Haber başlıkları (RSS): ${hs.items.map(headlineLine).join(" | ")}` : "Haber başlığı yok.",
    ].join("\n");
    const system = [
      "Kişisel yatırım uygulamasında, yeni başlayan bir kullanıcıya bir varlığın bugün neden hareket etmiş OLABİLECEĞİNİ açıklıyorsun.",
      "Yalnızca verilen başlıkları ve KAP bildirimlerini kullan; web araması yok. Kaynakta olmayan rakam ya da olay yazma.",
      "3-5 cümle: olası neden(ler) ve dayandığın başlığın bağlantısı; sonra \"Olumlu senaryo:\" ve \"Olumsuz senaryo:\" birer cümle; sonra \"Güven: düşük/orta/yüksek\".",
      "Başlıklar nedeni açıklamıyorsa bunu açıkça söyle ve güveni düşük ver. Al/sat tavsiyesi verme.",
    ].join("\n");
    try {
      const r = await askCheap(opts.client, "neden", system, user);
      text = r.text;
      ai = true;
      unverified = unverifiedNumbers(text, [user]);
    } catch (err) {
      console.warn("[neden] yapay zeka yanıtı alınamadı:", (err as Error).message);
    }
  }
  const out: WhyMoving = { instrument, changePct, text, ai, headlines: hs.items, kap, createdAt: Date.now(), unverified };
  await (await getDb()).run(`INSERT INTO ext_cache (key, value, fetched_at) VALUES (?, ?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value, fetched_at = excluded.fetched_at`, [key, JSON.stringify(out), out.createdAt]);
  return out;
}
