import "server-only";
import { background } from "./background";
import type Anthropic from "@anthropic-ai/sdk";
import { getDb, isCloud, sqlNow } from "./db";
import { ASSET_TYPES, displaySymbol, instrumentId, isAssetType, normalizeSymbol, parseInstrumentId, type AssetType } from "./assets";
import * as actions from "./actions";
import { addUsage, aiErrorMessage, emptyUsage, getBudgetStatus, isAiConfigured, monthRangeUtc, NoApiKeyError } from "./aiClient";
import { getProvider, type AiBackend, type AiProvider } from "./aiProvider";
import { getAiSettings, usesSharedAi, WEB_SEARCH_USD } from "./settings";
import { addNotification } from "./orders";
import { sendPushToAll } from "./push";
import { formatNumber } from "./format";
import { technicalContext } from "./technical";
import { kapContext } from "./kap";
import { headlineLine, headlinesFor, type Headline } from "./freeNews";
import { unverifiedNumbers } from "./numberCheck";
import { getCurrentUserId } from "./userContext";

// HABER ANALİZİ
// Gerçek + sanal pozisyonlar, izleme listesi ve bekleyen emirlerdeki varlıklar
// için yapay zeka (Claude ya da OpenAI) web aramasıyla güncel haberleri arar ve varlık başına yapılandırılmış
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
  /** Olası olumlu / olumsuz senaryo (kısa) ve modelin güven düzeyi */
  scenarioPositive?: string;
  scenarioNegative?: string;
  confidence?: Confidence;
  /** Metinde geçen ama verilen bağlamda bulunmayan rakamlar (uyarı) */
  unverified?: string[];
}

export type Confidence = "düşük" | "orta" | "yüksek";

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
  /** İsteme eklenen ücretsiz başlık (RSS) sayısı ve bu sayede yapılmayan tahmini ücretli arama */
  freeHeadlines: number;
  searchesSaved: number;
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
  free_headlines: number;
  searches_saved: number;
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
    freeHeadlines: r.free_headlines ?? 0,
    searchesSaved: r.searches_saved ?? 0,
    createdAt: r.created_at,
    finishedAt: r.finished_at,
  };
}

export async function listReports(limit = 30): Promise<NewsReport[]> {
  const rows = await (await getDb()).all("SELECT * FROM news_reports WHERE user_id = ? ORDER BY id DESC LIMIT ?", [await getCurrentUserId(), limit]) as unknown as ReportRow[];
  return rows.map(fromRow);
}

export async function getReport(id: number): Promise<NewsReport | null> {
  const row = await (await getDb()).get("SELECT * FROM news_reports WHERE id = ? AND user_id = ?", [id, await getCurrentUserId()]) as unknown as ReportRow | undefined;
  return row ? fromRow(row) : null;
}

/** En son başarılı rapor; instrument verilirse o varlığı içeren en son rapor. */
export async function getLatestReport(instrument?: string): Promise<NewsReport | null> {
  const rows = await (await getDb()).all("SELECT * FROM news_reports WHERE user_id = ? AND status = 'ok' ORDER BY id DESC LIMIT 50", [await getCurrentUserId()]) as unknown as ReportRow[];
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
  for (const o of (await actions.listOrders("pending"))) {
    add(
      o.assetType,
      o.symbol,
      `bekleyen ${o.side === "buy" ? "alış" : "satış"} emri: fiyat ${o.condition === "lte" ? "≤" : "≥"} ${formatNumber(o.triggerPrice, 4)} ${o.triggerCurrency}`,
    );
  }
  for (const w of (await actions.listWatchlist())) add(w.assetType, w.symbol, "izleme listesinde");
  if (only && map.size === 0) map.set(instrumentId(only.type, only.symbol), { assetType: only.type, symbol: only.symbol, instrument: instrumentId(only.type, only.symbol), notes: ["kullanıcı bu varlığı inceliyor (pozisyon yok)"] });
  return [...map.values()].slice(0, MAX_ASSETS);
}

// ---- Yapay zeka çağrısı -----------------------------------------------------------

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
            position_impact: { type: "string", description: "Kullanıcının pozisyonuna / emrine olası etkisi, 1-2 cümle. Al/sat tavsiyesi verme." },
            scenario_positive: { type: "string", description: "Olumlu senaryo: işler iyi giderse ne olabilir (1 cümle)." },
            scenario_negative: { type: "string", description: "Olumsuz senaryo: işler kötü giderse ne olabilir (1 cümle)." },
            confidence: { type: "string", enum: ["düşük", "orta", "yüksek"], description: "Bu değerlendirmeye güven düzeyin. Kaynak az ya da çelişkiliyse düşük." },
            sources: { type: "array", items: { type: "string" }, description: "Bu maddeyi destekleyen haber URL'leri: verilen ücretsiz başlıklardan, KAP bağlantılarından ya da arama sonuçlarından. Haber iddiası varsa en az bir bağlantı ZORUNLU." },
          },
          required: ["asset_type", "symbol", "sentiment", "importance", "summary", "position_impact", "scenario_positive", "scenario_negative", "confidence", "sources"],
        },
      },
    },
    required: ["market_summary", "items"],
  },
};

function istanbulNow(): string {
  return new Date().toLocaleString("tr-TR", { timeZone: "Europe/Istanbul", dateStyle: "full", timeStyle: "short" });
}

function buildPrompt(
  assets: ScanAsset[],
  maxSearches: number,
  technical: Map<string, string> = new Map(),
  kap: Map<string, string[]> = new Map(),
  headlines: Map<string, Headline[]> = new Map(),
): { system: string; user: string } {
  const system = [
    "Sen kişisel bir yatırım uygulamasında çalışan haber analisti yardımcısısın. Kullanıcı yatırıma yeni başlayan biri.",
    "Görevin: verilen varlıklarla ilgili son 1-2 günün önemli haberlerini değerlendirmek. ÖNCE istemde verilen ÜCRETSİZ kaynakları kullan: Google Haberler / Yahoo Finance başlıkları (RSS) ve KAP bildirimleri.",
    maxSearches > 0
      ? `web_search ücretlidir (arama başına ~0,01 $). Yalnızca ücretsiz başlıklar bir varlık için yetersizse (başlık yok, belirsiz ya da önemli görünen bir gelişmenin ayrıntısı gerekiyor) kullan. En fazla ${maxSearches} arama yapabilirsin; aramaları birleştir. Ücretsiz başlıklar yeterliyse HİÇ arama yapma.`
      : "Bu taramada web araması kapalı. Yalnızca verilen başlıklara ve KAP bildirimlerine dayan; başlığı olmayan varlık için güncel haber iddiasında bulunma.",
    "Sonucu MUTLAKA submit_news_report aracını bir kez çağırarak gönder. Ayrıca uzun metin yazma.",
    "Kurallar:",
    "- Her varlık için bir madde ekle; asset_type ve symbol listede yazdığı gibi olsun.",
    "- Kayda değer haber bulamadığın varlık için: sentiment \"nötr\", importance 1, summary \"Kayda değer yeni haber bulunamadı.\" yaz.",
    "- Asla haber uydurma. Her haber iddiası için sources alanına gerçekten gördüğün bağlantıları koy (başlık satırlarının sonundaki bağlantı, KAP bağlantısı ya da arama sonucu). Kaynağı olmayan iddia yazma.",
    "- Rakamlar: istemde ya da arama sonuçlarında geçmeyen hiçbir fiyat, yüzde veya tutar yazma; tahmin rakamı uydurma.",
    "- Her madde için kısa bir olumlu senaryo ve olumsuz senaryo yaz, güven düzeyini (düşük/orta/yüksek) belirt. Doğrudan \"al\" ya da \"sat\" deme.",
    "- importance 4 ve 5 yalnızca kullanıcının pozisyonunu ya da emrini doğrudan etkileyebilecek ciddi gelişmeler için (bilanço sürprizi, büyük düzenleme, sert fiyat hareketi, iflas/birleşme vb.).",
    "- Dil sade Türkçe olsun; teknik terim kullanırsan kısaca açıkla.",
    "- Kesin al/sat tavsiyesi verme; olası etkileri \"olabilir\" diliyle anlat.",
    "- Bazı BIST hisseleri için son 48 saatin KAP bildirimleri (şirketin resmi açıklamaları, ücretsiz) verildi. Bunları birincil kaynak say: bu hisseler için ayrıca web araması yapma (gerekmedikçe), KAP bağlantısını sources alanına ekle.",
    "- Bazı varlıklar için günlük fiyatlardan hesaplanan teknik sinyal özeti (RSI, MACD, hareketli ortalamalar) verildi. Uygunsa position_impact içinde haberi bu teknik görünümle birleştir (örn. \"olumsuz haber, teknik sinyal de Sat yönünde\" ya da \"haber olumlu ama RSI aşırı alım bölgesinde\"). Teknik sinyallerin geçmiş fiyatlara dayandığını, geleceği garanti etmediğini unutma.",
  ].join("\n");

  const lines = assets.map(
    (a) =>
      `- asset_type=${a.assetType} symbol=${a.symbol} (${displaySymbol(a.assetType, a.symbol)}) — ${a.notes.join("; ")}` +
      (technical.has(a.instrument) ? ` — ${technical.get(a.instrument)}` : "") +
      (a.assetType === "bist" && kap.has(a.symbol) ? `
    KAP (son 48 saat): ${kap.get(a.symbol)!.join(" | ")}` : "") +
      (headlines.has(a.instrument)
        ? `
    Ücretsiz başlıklar (RSS): ${headlines.get(a.instrument)!.map(headlineLine).join(" | ")}`
        : `
    Ücretsiz başlık bulunamadı.`),
  );
  const user = [
    `Şu an (İstanbul): ${istanbulNow()}`,
    "",
    "Analiz edilecek varlıklar:",
    ...lines,
    "",
    "BIST hisseleri Borsa İstanbul'dadır; fx = döviz/TRY, gold = altın (GRAM gram altın, CEYREK/YARIM/TAM/CUMHURIYET/ATA sikke, TL), fund = TEFAS yatırım fonu (TL), crypto = kripto para (USD).",
  ].join("\n");
  return { system, user };
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
      scenarioPositive: String(it.scenario_positive ?? "").trim().slice(0, 400) || undefined,
      scenarioNegative: String(it.scenario_negative ?? "").trim().slice(0, 400) || undefined,
      confidence: (["düşük", "orta", "yüksek"] as const).find((c) => c === it.confidence) ?? (sources.length === 0 ? "düşük" : "orta"),
      sources,
    });
  }
  items.sort((a, b) => b.importance - a.importance);
  return { marketSummary, items };
}

// ---- Tarama çalıştırma ----------------------------------------------------------

/** Taraması süren kullanıcılar (bellek; kullanıcı başına tek tarama) */
const g = globalThis as unknown as { __yatirimNewsRunning?: Set<number> };
const runningUsers = () => (g.__yatirimNewsRunning ??= new Set());

export async function isScanRunning(): Promise<boolean> {
  return runningUsers().has(await getCurrentUserId());
}

export class ScanBusyError extends Error {
  constructor() {
    super("Zaten bir haber analizi sürüyor. Bitmesini bekleyin.");
  }
}

/** Bulut modunda bir taramanın en uzun süresi (işlev süre sınırı 300 sn) */
const CLOUD_SCAN_MAX_MS = 6 * 60_000;

/**
 * Sunucu yeniden başlatıldığında yarım kalmış "running" raporları kapatır. Bulut modunda
 * başka bir örnekte süren tarama olabileceği için yalnızca süre sınırını aşmış olanlar.
 */
async function closeStaleRuns() {
  const db = await getDb();
  const uid = await getCurrentUserId();
  const msg = "Analiz yarıda kesildi (sunucu yeniden başlatıldı).";
  if (isCloud()) {
    await db.run("UPDATE news_reports SET status = 'error', error = ?, finished_at = ? WHERE user_id = ? AND status = 'running' AND created_at < ?", [
      msg,
      sqlNow(),
      uid,
      sqlNow(Date.now() - CLOUD_SCAN_MAX_MS),
    ]);
  } else {
    await db.run("UPDATE news_reports SET status = 'error', error = ?, finished_at = ? WHERE user_id = ? AND status = 'running'", [msg, sqlNow(), uid]);
  }
}

/** Bulut modunda başka bir örnekte süren tarama var mı (bellek bayrağı örnek başınadır) */
async function runningElsewhere(): Promise<boolean> {
  if (!isCloud()) return false;
  const r = await (await getDb()).get("SELECT 1 AS x FROM news_reports WHERE user_id = ? AND status = 'running' AND created_at >= ? LIMIT 1", [
    await getCurrentUserId(),
    sqlNow(Date.now() - CLOUD_SCAN_MAX_MS),
  ]);
  return !!r;
}

/**
 * Taramayı başlatır ve rapor kaydını döndürür. Asıl iş arka planda sürer
 * (wait: true ile bitmesi beklenir — testler ve zamanlayıcı için).
 */
export async function startNewsScan(opts: {
  trigger: NewsTrigger;
  instrument?: string | null;
  wait?: boolean;
  /** Claude istemcisi ya da sağlayıcı (testler); verilmezse Ayarlar'daki etkin sağlayıcı */
  client?: AiBackend;
}): Promise<NewsReport> {
  const uid = await getCurrentUserId();
  if (runningUsers().has(uid)) throw new ScanBusyError();
  const provider = await getProvider(opts.client); // anahtar yoksa NoApiKeyError
  const only = opts.instrument ? parseInstrumentId(opts.instrument) : null;
  if (opts.instrument && !only) throw new actions.ValidationError("Varlık geçersiz.");

  if (await runningElsewhere()) throw new ScanBusyError();
  runningUsers().add(uid);
  let reportId: number;
  try {
    await closeStaleRuns();
    const model = await provider.model();
    const res = await (await getDb()).run("INSERT INTO news_reports (user_id, trigger, scope, model, created_at) VALUES (?, ?, ?, ?, ?) RETURNING id", [uid, opts.trigger, only ? instrumentId(only.type, only.symbol) : null, model, sqlNow()]);
    reportId = res.lastId!;
  } catch (err) {
    runningUsers().delete(uid);
    throw err;
  }

  const job = runScan(reportId, provider, only ?? undefined).finally(() => {
    runningUsers().delete(uid);
  });
  if (opts.wait) await job;
  else background(job);
  return (await getReport(reportId))!;
}

async function runScan(reportId: number, provider: AiProvider, only?: { type: AssetType; symbol: string }) {
  const db = await getDb();
  const { maxSearches } = await getAiSettings();
  let usage = emptyUsage();
  const sources = new Map<string, string>();
  try {
    const assets = await collectScanAssets(only);
    if (assets.length === 0) {
      throw new actions.ValidationError("Analiz edilecek varlık yok. Portföyünüze, izleme listesine ya da emirlere varlık ekleyin.");
    }
    const technical = await technicalContext(assets);
    const kap = await kapContext(assets.filter((a) => a.assetType === "bist").map((a) => a.symbol));
    const headlines = await headlinesFor(assets);
    const freeCount = [...headlines.values()].reduce((n, l) => n + l.length, 0);
    const headlineByUrl = new Map<string, string>();
    for (const l of headlines.values()) for (const h of l) headlineByUrl.set(h.url, `${h.title}${h.publisher ? ` — ${h.publisher}` : ""}`);
    const { system, user } = buildPrompt(assets, maxSearches, technical, kap, headlines);
    const out = await provider.structured({
      kind: "haber",
      system,
      user,
      tool: SUBMIT_TOOL,
      maxSearches,
      onUsage: (u) => {
        usage = addUsage(usage, u);
      },
    });
    for (const [u, t] of out.sources) if (!sources.has(u)) sources.set(u, t);
    const report = out.input != null ? parseReportInput(out.input, assets) : null;
    if (!report) throw new Error("Yapay zeka yapılandırılmış rapor döndürmedi.");
    // Ücretsiz başlıklardan alıntılanan bağlantıları da kaynak listesine ekle.
    for (const it of report.items) for (const u of it.sources) if (!sources.has(u) && headlineByUrl.has(u)) sources.set(u, headlineByUrl.get(u)!);
    // Rakam kontrolü: yalnızca web araması yapılmadıysa (arama içeriği bize şifreli gelir).
    if (usage.webSearches === 0) {
      const ctx = [system, user];
      for (const it of report.items) {
        const bad = unverifiedNumbers([it.summary, it.positionImpact, it.scenarioPositive ?? "", it.scenarioNegative ?? ""].join(" "), ctx);
        if (bad.length) it.unverified = bad;
      }
    }
    // Ücretsiz bağlam varken kullanılmayan arama hakkı = tahmini tasarruf
    const saved = freeCount > 0 ? Math.max(0, maxSearches - usage.webSearches) : 0;
    await db.run("UPDATE news_reports SET free_headlines = ?, searches_saved = ? WHERE id = ? AND user_id = ?", [freeCount, saved, reportId, await getCurrentUserId()]);
    await saveReport(reportId, report, [...sources].map(([url, title]) => ({ url, title })), usage);
  } catch (err) {
    const message = err instanceof actions.ValidationError ? err.message : aiErrorMessage(err);
    if (!(err instanceof actions.ValidationError) && !(err instanceof NoApiKeyError)) console.error("[haber] analiz hatası", err);
    await db.run("UPDATE news_reports SET status = 'error', error = ?, web_searches = ?, cost_usd = ?, finished_at = ? WHERE id = ? AND user_id = ?", [message === "Beklenmeyen bir hata oluştu." && err instanceof Error ? err.message : message, usage.webSearches, usage.costUsd, sqlNow(), reportId, await getCurrentUserId()]);
  }
}

/** Raporu kaydeder ve önemli (4+) maddeler için bildirim + push üretir. */
export async function saveReport(
  reportId: number,
  report: { marketSummary: string; items: NewsItem[] },
  sources: NewsSource[],
  usage: { webSearches: number; costUsd: number },
) {
  await (await getDb()).run(`UPDATE news_reports SET status = 'ok', market_summary = ?, items = ?, sources = ?, web_searches = ?, cost_usd = ?,
         finished_at = ? WHERE id = ? AND user_id = ?`, [report.marketSummary, JSON.stringify(report.items), JSON.stringify(sources.slice(0, 40)), usage.webSearches, usage.costUsd, sqlNow(), reportId, await getCurrentUserId()]);

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
    await addNotification(n);
    background(() => sendPushToAll({ title: n.title, body: n.body, url: "/analizler", tag: `haber-${reportId}-${it.instrument}` }));
  }
}

// ---- Zamanlanmış tarama ---------------------------------------------------------

/** Kaç dakika gecikmeyle hâlâ çalıştırılsın (sunucu o saatte kapalıydıysa) */
const SLOT_GRACE_MIN = 60;
/** Hata veren taramanın aynı dilim içinde yeniden denenmesinden önce beklenecek süre */
const RETRY_DELAY_MIN = 10;


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
  | { ran: false; reason: "kapali" | "anahtar_yok" | "hafta_sonu" | "zamani_degil" | "zaten_calisti" | "butce" | "mesgul" | "hata"; reportId?: number };

/**
 * Emir izleyici döngüsünden (~30 sn) çağrılır. Hafta içi, ayarlanan saatlerde
 * (İstanbul) taramayı bir kez çalıştırır. Aynı zaman dilimi scheduled_runs
 * tablosundaki birincil anahtar sayesinde iki kez çalışamaz; tarama hata verirse
 * aynı dilim penceresinde 10 dk sonra yalnızca bir kez yeniden denenir. Aylık
 * bütçe dolduysa ya da anahtar yoksa otomatik tarama yapılmaz (yeniden denenmez).
 */
export async function maybeRunScheduledScan(now = new Date(), client?: AiBackend): Promise<ScheduleResult> {
  const s = await getAiSettings();
  if (!s.scheduleEnabled || s.scheduleTimes.length === 0) return { ran: false, reason: "kapali" };
  if (!client && !(await isAiConfigured())) return { ran: false, reason: "anahtar_yok" };
  // Sahibin anahtarını paylaşan kullanıcılar için otomatik (arka plan) tarama yapılmaz: maliyet koruması.
  if (!client && (await usesSharedAi())) return { ran: false, reason: "anahtar_yok" };
  const p = istanbulParts(now);
  if (p.weekday === "Sat" || p.weekday === "Sun") return { ran: false, reason: "hafta_sonu" };

  const due = s.scheduleTimes.find((t) => {
    const [h, m] = t.split(":").map(Number);
    const slot = h * 60 + m;
    return p.minutes >= slot && p.minutes < slot + SLOT_GRACE_MIN;
  });
  if (!due) return { ran: false, reason: "zamani_degil" };
  const uid = await getCurrentUserId();
  if (runningUsers().has(uid)) return { ran: false, reason: "mesgul" };

  // Dilim anahtarı kullanıcı başınadır
  const slot = `u${uid} ${p.date} ${due}`;
  const db = await getDb();
  const claim = async (key: string) =>
    Number((await db.run("INSERT INTO scheduled_runs (slot, created_at) VALUES (?, ?) ON CONFLICT DO NOTHING", [key, sqlNow(now.getTime())])).changes) === 1;
  // Dilim zaten alındıysa: yalnızca önceki deneme hata verdiyse ve üzerinden
  // RETRY_DELAY_MIN geçtiyse, aynı dilim penceresinde BİR kez daha denenir
  // ("<dilim> tekrar" kaydı da birincil anahtarla korunur; çift çalışma olmaz).
  let isRetry = false;
  if (!(await claim(slot))) {
    const failed = await db.get("SELECT created_at FROM scheduled_runs WHERE slot = ?", [`${slot} hata`]) as { created_at: string } | undefined;
    if (!failed) return { ran: false, reason: "zaten_calisti" };
    if (now.getTime() - Date.parse(`${failed.created_at.replace(" ", "T")}Z`) < RETRY_DELAY_MIN * 60_000) return { ran: false, reason: "zaten_calisti" };
    if (!(await claim(`${slot} tekrar`))) return { ran: false, reason: "zaten_calisti" };
    isRetry = true;
  }
  const markFailed = async () => {
    if (!isRetry) await claim(`${slot} hata`);
  };

  // Bütçe doluysa dilim atlanır (yeniden denenmez).
  const budget = await getBudgetStatus(now);
  if (budget.overBudget) {
    console.log(`[haber] ${slot} otomatik tarama atlandı: aylık bütçe doldu ($${budget.spentUsd.toFixed(2)} / $${budget.budgetUsd})`);
    return { ran: false, reason: "butce" };
  }
  try {
    console.log(`[haber] ${slot} otomatik tarama ${isRetry ? "yeniden deneniyor" : "başlıyor"}`);
    const rep = await startNewsScan({ trigger: "otomatik", wait: true, client });
    if ((await getReport(rep.id))?.status === "error") {
      await markFailed();
      console.warn(`[haber] ${slot} otomatik tarama hata verdi${isRetry ? "" : `; ${RETRY_DELAY_MIN} dk sonra bir kez daha denenecek`}`);
      return { ran: false, reason: "hata", reportId: rep.id };
    }
    return { ran: true, reportId: rep.id };
  } catch (err) {
    // Anahtar yoksa yalnızca atla; diğer başlatma hataları yeniden denenebilir.
    if (err instanceof NoApiKeyError) return { ran: false, reason: "anahtar_yok" };
    await markFailed();
    console.error("[haber] otomatik tarama başlatılamadı", err);
    return { ran: false, reason: "hata" };
  }
}

/** Bu ay ücretsiz kaynaklar sayesinde yapılmayan tahmini ücretli arama ve tutarı */
export async function monthlySavings(now = new Date()): Promise<{ searches: number; usd: number }> {
  const { start, end } = monthRangeUtc(now);
  const row = await (await getDb()).get("SELECT COALESCE(SUM(searches_saved),0) AS n FROM news_reports WHERE user_id = ? AND created_at >= ? AND created_at < ? AND status = 'ok'", [await getCurrentUserId(), start, end]) as { n: number };
  return { searches: row.n, usd: row.n * WEB_SEARCH_USD };
}
