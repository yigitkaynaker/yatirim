import "server-only";
import type Anthropic from "@anthropic-ai/sdk";
import { getDb } from "./db";
import { ASSET_TYPES, displaySymbol, instrumentId, isAssetType, normalizeSymbol, parseInstrumentId, type AssetType } from "./assets";
import * as actions from "./actions";
import {
  addUsage,
  aiErrorMessage,
  currentModel,
  emptyUsage,
  getAiClient,
  getBudgetStatus,
  isAiConfigured,
  NoApiKeyError,
  recordUsage,
  type AiClient,
} from "./aiClient";
import { getAiSettings } from "./settings";
import { addNotification } from "./orders";
import { sendPushToAll } from "./push";
import { formatNumber } from "./format";
import { technicalContext } from "./technical";

// HABER ANALİZİ
// Gerçek + sanal pozisyonlar, izleme listesi ve bekleyen emirlerdeki varlıklar
// için Claude web_search ile güncel haberleri arar ve varlık başına yapılandırılmış
// bir değerlendirme döndürür (submit_news_report aracı). Raporlar news_reports
// tablosunda saklanır; önem derecesi 4+ olan maddeler bildirim + push üretir.

export type Sentiment = "olumlu" | "olumsuz" | "nötr";
export type NewsTrigger = "otomatik" | "manuel" | "varlik";

export interface NewsItem {
  assetType: AssetType;
  symbol: string;
  /** Enstrüman kimliği, örn. "bist:THYAO" */
  instrument: string;
  sentiment: Sentiment;
  /** 1 (önemsiz) – 5 (çok önemli) */
  importance: number;
  summary: string;
  positionImpact: string;
  sources: string[];
}

export interface NewsSource {
  url: string;
  title: string;
}

export interface NewsReport {
  id: number;
  trigger: NewsTrigger;
  scope: string | null;
  status: "running" | "ok" | "error";
  model: string | null;
  marketSummary: string | null;
  items: NewsItem[];
  sources: NewsSource[];
  error: string | null;
  webSearches: number;
  costUsd: number;
  createdAt: string;
  finishedAt: string | null;
}

interface ReportRow {
  id: number;
  trigger: NewsTrigger;
  scope: string | null;
  status: NewsReport["status"];
  model: string | null;
  market_summary: string | null;
  items: string | null;
  sources: string | null;
  error: string | null;
  web_searches: number;
  cost_usd: number;
  created_at: string;
  finished_at: string | null;
}

function parseJson<T>(s: string | null, fallback: T): T {
  if (!s) return fallback;
  try {
    return JSON.parse(s) as T;
  } catch {
    return fallback;
  }
}

function fromRow(r: ReportRow): NewsReport {
  return {
    id: r.id,
    trigger: r.trigger,
    scope: r.scope,
    status: r.status,
    model: r.model,
    marketSummary: r.market_summary,
    items: parseJson<NewsItem[]>(r.items, []),
    sources: parseJson<NewsSource[]>(r.sources, []),
    error: r.error,
    webSearches: r.web_searches,
    costUsd: r.cost_usd,
    createdAt: r.created_at,
    finishedAt: r.finished_at,
  };
}

export function listReports(limit = 30): NewsReport[] {
  const rows = getDb().prepare("SELECT * FROM news_reports ORDER BY id DESC LIMIT ?").all(limit) as unknown as ReportRow[];
  return rows.map(fromRow);
}

export function getReport(id: number): NewsReport | null {
  const row = getDb().prepare("SELECT * FROM news_reports WHERE id = ?").get(id) as unknown as ReportRow | undefined;
  return row ? fromRow(row) : null;
}

/** En son başarılı rapor; instrument verilirse o varlığı içeren en son rapor. */
export function getLatestReport(instrument?: string): NewsReport | null {
  const rows = getDb().prepare("SELECT * FROM news_reports WHERE status = 'ok' ORDER BY id DESC LIMIT 50").all() as unknown as ReportRow[];
  for (const r of rows) {
    const rep = fromRow(r);
    if (!instrument || rep.items.some((i) => i.instrument === instrument)) return rep;
  }
  return null;
}

// ---- Girdi: kullanıcının varlıkları -----------------------------------------

export interface ScanAsset {
  assetType: AssetType;
  symbol: string;
  instrument: string;
  notes: string[];
}

const MAX_ASSETS = 20;

/** Taranacak varlıklar ve her biri için kullanıcıya özel bağlam (pozisyon, emir, izleme). */
export async function collectScanAssets(only?: { type: AssetType; symbol: string }): Promise<ScanAsset[]> {
  const map = new Map<string, ScanAsset>();
  const add = (assetType: AssetType, symbol: string, note: string) => {
    const id = instrumentId(assetType, symbol);
    if (only && id !== instrumentId(only.type, only.symbol)) return;
    let a = map.get(id);
    if (!a) {
      a = { assetType, symbol, instrument: id, notes: [] };
      map.set(id, a);
    }
    a.notes.push(note);
  };

  for (const mode of ["real", "virtual"] as const) {
    try {
      const p = await actions.getPortfolioSummary(mode);
      for (const h of p.holdings) {
        add(
          h.assetType,
          h.symbol,
          `${mode === "real" ? "gerçek" : "sanal"} pozisyon: ${formatNumber(h.quantity, 6)} adet, ort. maliyet ${formatNumber(h.avgCost, 4)} ${h.currency}` +
            (h.pnlPct != null ? `, K/Z %${formatNumber(h.pnlPct, 1)}` : ""),
        );
      }
    } catch (err) {
      console.error("[haber] portföy okunamadı", err);
    }
  }
  for (const o of actions.listOrders("pending")) {
    add(
      o.assetType,
      o.symbol,
      `bekleyen ${o.side === "buy" ? "alış" : "satış"} emri: fiyat ${o.condition === "lte" ? "≤" : "≥"} ${formatNumber(o.triggerPrice, 4)} ${o.triggerCurrency}`,
    );
  }
  for (const w of actions.listWatchlist()) add(w.assetType, w.symbol, "izleme listesinde");
  if (only && map.size === 0) map.set(instrumentId(only.type, only.symbol), { assetType: only.type, symbol: only.symbol, instrument: instrumentId(only.type, only.symbol), notes: ["kullanıcı bu varlığı inceliyor (pozisyon yok)"] });
  return [...map.values()].slice(0, MAX_ASSETS);
}

// ---- Claude çağrısı -----------------------------------------------------------

export const SUBMIT_TOOL: Anthropic.Tool = {
  name: "submit_news_report",
  description:
    "Haber analizinin sonucunu gönderir. Analiz bitince bu aracı TAM OLARAK BİR KEZ çağır. Listedeki her varlık için bir madde ekle.",
  input_schema: {
    type: "object",
    properties: {
      market_summary: { type: "string", description: "Genel piyasa durumunun 2-4 cümlelik Türkçe özeti." },
      items: {
        type: "array",
        items: {
          type: "object",
          properties: {
            asset_type: { type: "string", enum: [...ASSET_TYPES] },
            symbol: { type: "string", description: "Listede verilen sembol, aynen." },
            sentiment: { type: "string", enum: ["olumlu", "olumsuz", "nötr"] },
            importance: { type: "integer", minimum: 1, maximum: 5, description: "1: önemsiz, 3: dikkate değer, 5: pozisyonu doğrudan etkileyebilecek çok önemli gelişme" },
            summary: { type: "string", description: "2-3 cümlelik sade Türkçe özet." },
            position_impact: { type: "string", description: "Kullanıcının pozisyonuna / emrine olası etkisi, 1-2 cümle." },
            sources: { type: "array", items: { type: "string" }, description: "Bu maddeyi destekleyen haber URL'leri (yalnızca arama sonuçlarından)." },
          },
          required: ["asset_type", "symbol", "sentiment", "importance", "summary", "position_impact", "sources"],
        },
      },
    },
    required: ["market_summary", "items"],
  },
};

function istanbulNow(): string {
  return new Date().toLocaleString("tr-TR", { timeZone: "Europe/Istanbul", dateStyle: "full", timeStyle: "short" });
}

function buildPrompt(assets: ScanAsset[], maxSearches: number, technical: Map<string, string> = new Map()): { system: string; user: string } {
  const system = [
    "Sen kişisel bir yatırım uygulamasında çalışan haber analisti yardımcısısın. Kullanıcı yatırıma yeni başlayan biri.",
    maxSearches > 0
      ? `Görevin: verilen varlıklarla ilgili son 1-2 günün önemli haberlerini web_search aracıyla bulmak. En fazla ${maxSearches} arama yapabilirsin; bu yüzden aramaları birleştir (örn. birkaç BIST hissesini ya da genel piyasayı tek aramada sor) ve en önemli varlıklara öncelik ver.`
      : "Bu taramada web araması kapalı. Yalnızca genel bilgine dayan, güncel haber iddiasında bulunma ve sources alanlarını boş bırak.",
    "Sonucu MUTLAKA submit_news_report aracını bir kez çağırarak gönder. Ayrıca uzun metin yazma.",
    "Kurallar:",
    "- Her varlık için bir madde ekle; asset_type ve symbol listede yazdığı gibi olsun.",
    "- Kayda değer haber bulamadığın varlık için: sentiment \"nötr\", importance 1, summary \"Kayda değer yeni haber bulunamadı.\" yaz.",
    "- Asla haber uydurma. Her haber iddiası için sources alanına gerçekten arama sonuçlarında gördüğün URL'leri koy.",
    "- importance 4 ve 5 yalnızca kullanıcının pozisyonunu ya da emrini doğrudan etkileyebilecek ciddi gelişmeler için (bilanço sürprizi, büyük düzenleme, sert fiyat hareketi, iflas/birleşme vb.).",
    "- Dil sade Türkçe olsun; teknik terim kullanırsan kısaca açıkla.",
    "- Kesin al/sat tavsiyesi verme; olası etkileri \"olabilir\" diliyle anlat.",
    "- Bazı varlıklar için günlük fiyatlardan hesaplanan teknik sinyal özeti (RSI, MACD, hareketli ortalamalar) verildi. Uygunsa position_impact içinde haberi bu teknik görünümle birleştir (örn. \"olumsuz haber, teknik sinyal de Sat yönünde\" ya da \"haber olumlu ama RSI aşırı alım bölgesinde\"). Teknik sinyallerin geçmiş fiyatlara dayandığını, geleceği garanti etmediğini unutma.",
  ].join("\n");

  const lines = assets.map(
    (a) =>
      `- asset_type=${a.assetType} symbol=${a.symbol} (${displaySymbol(a.assetType, a.symbol)}) — ${a.notes.join("; ")}` +
      (technical.has(a.instrument) ? ` — ${technical.get(a.instrument)}` : ""),
  );
  const user = [
    `Şu an (İstanbul): ${istanbulNow()}`,
    "",
    "Analiz edilecek varlıklar:",
    ...lines,
    "",
    "BIST hisseleri Borsa İstanbul'dadır; fx = döviz/TRY, gold GRAM = gram altın (TL), crypto = kripto para (USD).",
  ].join("\n");
  return { system, user };
}

function webSearchTool(maxUses: number): Anthropic.WebSearchTool20250305 {
  return { type: "web_search_20250305", name: "web_search", max_uses: maxUses };
}

/** Arama sonuçlarından ve alıntılardan kaynak listesi (url + başlık). */
function collectSources(content: Anthropic.ContentBlock[], into: Map<string, string>) {
  for (const b of content) {
    if (b.type === "web_search_tool_result" && Array.isArray(b.content)) {
      for (const r of b.content) if (r.type === "web_search_result" && !into.has(r.url)) into.set(r.url, r.title);
    }
    if (b.type === "text" && b.citations) {
      for (const c of b.citations) {
        if (c.type === "web_search_result_location" && !into.has(c.url)) into.set(c.url, c.title ?? c.url);
      }
    }
  }
}

const SENTIMENTS: Sentiment[] = ["olumlu", "olumsuz", "nötr"];

/** submit_news_report girdisini doğrular ve normalize eder. Geçersiz maddeler atlanır. */
export function parseReportInput(input: unknown, assets: ScanAsset[]): { marketSummary: string; items: NewsItem[] } {
  const b = (input ?? {}) as { market_summary?: unknown; items?: unknown };
  const marketSummary = typeof b.market_summary === "string" ? b.market_summary.trim().slice(0, 2000) : "";
  const known = new Set(assets.map((a) => a.instrument));
  const items: NewsItem[] = [];
  const seen = new Set<string>();
  for (const raw of Array.isArray(b.items) ? b.items : []) {
    const it = (raw ?? {}) as Record<string, unknown>;
    if (!isAssetType(it.asset_type)) continue;
    const symbol = normalizeSymbol(it.asset_type, String(it.symbol ?? ""));
    const instrument = instrumentId(it.asset_type, symbol);
    if (known.size > 0 && !known.has(instrument)) continue;
    if (seen.has(instrument)) continue;
    seen.add(instrument);
    const sentiment = SENTIMENTS.includes(it.sentiment as Sentiment) ? (it.sentiment as Sentiment) : "nötr";
    const importance = Math.min(5, Math.max(1, Math.round(Number(it.importance) || 1)));
    const sources = (Array.isArray(it.sources) ? it.sources : [])
      .filter((u): u is string => typeof u === "string" && /^https?:\/\//.test(u))
      .slice(0, 6);
    items.push({
      assetType: it.asset_type,
      symbol,
      instrument,
      sentiment,
      importance,
      summary: String(it.summary ?? "").trim().slice(0, 1200),
      positionImpact: String(it.position_impact ?? "").trim().slice(0, 800),
      sources,
    });
  }
  items.sort((a, b) => b.importance - a.importance);
  return { marketSummary, items };
}

// ---- Tarama çalıştırma ----------------------------------------------------------

const g = globalThis as unknown as { __yatirimNewsRunning?: boolean };

export function isScanRunning() {
  return !!g.__yatirimNewsRunning;
}

export class ScanBusyError extends Error {
  constructor() {
    super("Zaten bir haber analizi sürüyor. Bitmesini bekleyin.");
  }
}

/** Sunucu yeniden başlatıldığında yarım kalmış "running" raporları kapatır. */
function closeStaleRuns() {
  getDb()
    .prepare(
      "UPDATE news_reports SET status = 'error', error = 'Analiz yarıda kesildi (sunucu yeniden başlatıldı).', finished_at = datetime('now') WHERE status = 'running'",
    )
    .run();
}

/**
 * Taramayı başlatır ve rapor kaydını döndürür. Asıl iş arka planda sürer
 * (wait: true ile bitmesi beklenir — testler ve zamanlayıcı için).
 */
export async function startNewsScan(opts: {
  trigger: NewsTrigger;
  instrument?: string | null;
  wait?: boolean;
  client?: AiClient;
}): Promise<NewsReport> {
  if (g.__yatirimNewsRunning) throw new ScanBusyError();
  const client = opts.client ?? getAiClient(); // anahtar yoksa NoApiKeyError
  const only = opts.instrument ? parseInstrumentId(opts.instrument) : null;
  if (opts.instrument && !only) throw new actions.ValidationError("Varlık geçersiz.");

  g.__yatirimNewsRunning = true;
  let reportId: number;
  try {
    closeStaleRuns();
    const model = currentModel();
    const res = getDb()
      .prepare("INSERT INTO news_reports (trigger, scope, model) VALUES (?, ?, ?)")
      .run(opts.trigger, only ? instrumentId(only.type, only.symbol) : null, model.id);
    reportId = Number(res.lastInsertRowid);
  } catch (err) {
    g.__yatirimNewsRunning = false;
    throw err;
  }

  const job = runScan(reportId, client, only ?? undefined).finally(() => {
    g.__yatirimNewsRunning = false;
  });
  if (opts.wait) await job;
  else void job;
  return getReport(reportId)!;
}

async function runScan(reportId: number, client: AiClient, only?: { type: AssetType; symbol: string }) {
  const db = getDb();
  const model = currentModel();
  const { maxSearches } = getAiSettings();
  let usage = emptyUsage();
  const sources = new Map<string, string>();
  try {
    const assets = await collectScanAssets(only);
    if (assets.length === 0) {
      throw new actions.ValidationError("Analiz edilecek varlık yok. Portföyünüze, izleme listesine ya da emirlere varlık ekleyin.");
    }
    const technical = await technicalContext(assets);
    const { system, user } = buildPrompt(assets, maxSearches, technical);
    const tools: Anthropic.ToolUnion[] = maxSearches > 0 ? [webSearchTool(maxSearches), SUBMIT_TOOL] : [SUBMIT_TOOL];
    const messages: Anthropic.MessageParam[] = [{ role: "user", content: user }];

    let report: { marketSummary: string; items: NewsItem[] } | null = null;
    let nudged = false;
    for (let step = 0; step < 6 && !report; step++) {
      const msg = await client.messages
        .stream({
          model: model.id,
          max_tokens: 16000,
          system,
          tools,
          messages,
          output_config: { effort: "medium" },
        })
        .finalMessage();
      usage = addUsage(usage, recordUsage("haber", model.id, msg.usage));
      collectSources(msg.content, sources);

      const submit = msg.content.find((b): b is Anthropic.ToolUseBlock => b.type === "tool_use" && b.name === SUBMIT_TOOL.name);
      if (submit && msg.stop_reason !== "max_tokens") {
        report = parseReportInput(submit.input, assets);
        break;
      }
      if (msg.stop_reason === "refusal") throw new Error("Model bu isteği yanıtlamayı reddetti.");
      if (msg.stop_reason === "pause_turn") {
        messages.push({ role: "assistant", content: msg.content });
        continue;
      }
      if (nudged) break;
      // Rapor aracı çağrılmadı: bir kez hatırlat.
      nudged = true;
      const pending = msg.content.filter((b): b is Anthropic.ToolUseBlock => b.type === "tool_use");
      messages.push({ role: "assistant", content: msg.content });
      messages.push({
        role: "user",
        content: [
          ...pending.map((t) => ({ type: "tool_result" as const, tool_use_id: t.id, content: "Bu araç burada kullanılamaz.", is_error: true })),
          { type: "text" as const, text: "Lütfen şimdi sonucu submit_news_report aracıyla gönder." },
        ],
      });
    }
    if (!report) throw new Error("Yapay zeka yapılandırılmış rapor döndürmedi.");
    saveReport(reportId, report, [...sources].map(([url, title]) => ({ url, title })), usage);
  } catch (err) {
    const message = err instanceof actions.ValidationError ? err.message : aiErrorMessage(err);
    if (!(err instanceof actions.ValidationError) && !(err instanceof NoApiKeyError)) console.error("[haber] analiz hatası", err);
    db.prepare(
      "UPDATE news_reports SET status = 'error', error = ?, web_searches = ?, cost_usd = ?, finished_at = datetime('now') WHERE id = ?",
    ).run(message === "Beklenmeyen bir hata oluştu." && err instanceof Error ? err.message : message, usage.webSearches, usage.costUsd, reportId);
  }
}

/** Raporu kaydeder ve önemli (4+) maddeler için bildirim + push üretir. */
export function saveReport(
  reportId: number,
  report: { marketSummary: string; items: NewsItem[] },
  sources: NewsSource[],
  usage: { webSearches: number; costUsd: number },
) {
  getDb()
    .prepare(
      `UPDATE news_reports SET status = 'ok', market_summary = ?, items = ?, sources = ?, web_searches = ?, cost_usd = ?,
         finished_at = datetime('now') WHERE id = ?`,
    )
    .run(report.marketSummary, JSON.stringify(report.items), JSON.stringify(sources.slice(0, 40)), usage.webSearches, usage.costUsd, reportId);

  for (const it of report.items) {
    if (it.importance < 4) continue;
    const name = displaySymbol(it.assetType, it.symbol);
    const tone = it.sentiment === "olumlu" ? "olumlu" : it.sentiment === "olumsuz" ? "olumsuz" : "önemli";
    const n = {
      kind: "news_alert",
      title: `Önemli haber (${tone}): ${name}`,
      body: it.summary,
      data: { reportId, instrument: it.instrument, importance: it.importance },
    };
    addNotification(n);
    void sendPushToAll({ title: n.title, body: n.body, url: "/analizler", tag: `haber-${reportId}-${it.instrument}` });
  }
}

// ---- Zamanlanmış tarama ---------------------------------------------------------

/** Kaç dakika gecikmeyle hâlâ çalıştırılsın (sunucu o saatte kapalıydıysa) */
const SLOT_GRACE_MIN = 60;

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
  return {
    date: `${get("year")}-${get("month")}-${get("day")}`,
    minutes: Number(get("hour")) * 60 + Number(get("minute")),
    weekday: get("weekday"),
  };
}

export type ScheduleResult =
  | { ran: true; reportId: number }
  | { ran: false; reason: "kapali" | "anahtar_yok" | "hafta_sonu" | "zamani_degil" | "zaten_calisti" | "butce" | "mesgul" | "hata" };

/**
 * Emir izleyici döngüsünden (~30 sn) çağrılır. Hafta içi, ayarlanan saatlerde
 * (İstanbul) taramayı bir kez çalıştırır. Aynı zaman dilimi scheduled_runs
 * tablosundaki birincil anahtar sayesinde iki kez çalışamaz. Aylık bütçe
 * dolduysa otomatik tarama yapılmaz.
 */
export async function maybeRunScheduledScan(now = new Date(), client?: AiClient): Promise<ScheduleResult> {
  const s = getAiSettings();
  if (!s.scheduleEnabled || s.scheduleTimes.length === 0) return { ran: false, reason: "kapali" };
  if (!client && !isAiConfigured()) return { ran: false, reason: "anahtar_yok" };
  const p = istanbulParts(now);
  if (p.weekday === "Sat" || p.weekday === "Sun") return { ran: false, reason: "hafta_sonu" };

  const due = s.scheduleTimes.find((t) => {
    const [h, m] = t.split(":").map(Number);
    const slot = h * 60 + m;
    return p.minutes >= slot && p.minutes < slot + SLOT_GRACE_MIN;
  });
  if (!due) return { ran: false, reason: "zamani_degil" };
  if (g.__yatirimNewsRunning) return { ran: false, reason: "mesgul" };

  const slot = `${p.date} ${due}`;
  const claim = getDb().prepare("INSERT OR IGNORE INTO scheduled_runs (slot) VALUES (?)").run(slot);
  if (Number(claim.changes) !== 1) return { ran: false, reason: "zaten_calisti" };

  const budget = getBudgetStatus(now);
  if (budget.overBudget) {
    console.log(`[haber] ${slot} otomatik tarama atlandı: aylık bütçe doldu ($${budget.spentUsd.toFixed(2)} / $${budget.budgetUsd})`);
    return { ran: false, reason: "butce" };
  }
  try {
    console.log(`[haber] ${slot} otomatik tarama başlıyor`);
    const rep = await startNewsScan({ trigger: "otomatik", wait: true, client });
    return { ran: true, reportId: rep.id };
  } catch (err) {
    console.error("[haber] otomatik tarama başlatılamadı", err);
    return { ran: false, reason: "hata" };
  }
}
