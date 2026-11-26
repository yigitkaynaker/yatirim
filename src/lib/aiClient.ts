import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import OpenAI from "openai";
import { getDb } from "./db";
import { getCurrentUserId, OWNER_USER_ID } from "./userContext";
import {
  AI_MODELS,
  AiDailyLimitError,
  AiGlobalLimitError,
  consumeSharedAiQuota,
  getAiSettings,
  getApiKey,
  knownPrice,
  localModelUnavailable,
  OPENAI_MODELS,
  usesSharedAi,
  WEB_SEARCH_USD,
  type AiModelKey,
  type AiProviderId,
  type KeyProviderId,
  type ModelPrice,
} from "./settings";
import { ValidationError } from "./portfolio";

// Yapay zeka istemcileri (Claude, OpenAI ve yerel model / Ollama), kullanım/maliyet kaydı, aylık
// bütçe ve Türkçe hata mesajları. Sağlayıcıdan bağımsız arayüz: aiProvider.ts.

/** Testlerde sahte istemci vermek için. Yalnızca messages.stream / messages.create kullanılır. */
export type AiClient = Pick<Anthropic, "messages">;
/** OpenAI istemcisi: yalnızca responses.create kullanılır (Responses API). */
export type OpenAiClient = Pick<OpenAI, "responses">;
/**
 * Yerel model istemcisi: Ollama sunucusu (yerel REST API, /api/chat). Testlerde sahte fetch
 * verilir; gerçek istemcide global fetch kullanılır. Adres ve model sahibin ayarlarındandır.
 */
export interface OllamaClient {
  /** ör. http://localhost:11434 */
  baseUrl: string;
  model: string;
  fetch: typeof fetch;
}

/** Ollama hatası; mesaj kullanıcıya gösterilecek Türkçe metindir. */
export class OllamaError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "OllamaError";
  }
}

/** Bulutta (Vercel) yerel model seçili (ValidationError: API'de 400 + Türkçe mesaj) */
export class LocalModelUnavailableError extends ValidationError {
  constructor() {
    super(
      "Yerel model (Ollama) yalnızca uygulama bilgisayarınızda çalışırken kullanılabilir; buluttaki sürüm bilgisayarınızdaki modele ulaşamaz. " +
        "Uygulamayı bilgisayarınızda açın ya da Ayarlar'dan Claude veya OpenAI'yi seçin.",
    );
    this.name = "LocalModelUnavailableError";
  }
}

const g = globalThis as unknown as {
  __yatirimAiClientOverride?: AiClient | null;
  __yatirimOpenAiClientOverride?: OpenAiClient | null;
  __yatirimOllamaFetchOverride?: typeof fetch | null;
};

/** Testler için: sahte Claude istemcisi ayarla (null: gerçek istemciye dön). */
export function setAiClientOverride(client: AiClient | null) {
  g.__yatirimAiClientOverride = client;
}

/** Testler için: sahte OpenAI istemcisi ayarla (null: gerçek istemciye dön). */
export function setOpenAiClientOverride(client: OpenAiClient | null) {
  g.__yatirimOpenAiClientOverride = client;
}

/** Testler için: yerel model (Ollama) isteklerinde sahte fetch kullan (null: gerçek fetch). */
export function setOllamaFetchOverride(f: typeof fetch | null) {
  g.__yatirimOllamaFetchOverride = f;
}

/** Sahip-dışı kullanıcı: ne kendi anahtarı ne de sahibin paylaşılabilir (Claude / OpenAI) anahtarı var */
export const NO_SHARED_KEY_MESSAGE =
  "Uygulama sahibinin paylaşılan bir yapay zeka anahtarı yok. Ayarlar'dan kendi Claude ya da OpenAI API anahtarınızı ekleyerek kullanabilirsiniz.";

export class NoApiKeyError extends Error {
  constructor(provider: KeyProviderId = "anthropic", shared = false) {
    super(
      shared
        ? NO_SHARED_KEY_MESSAGE
        : provider === "openai"
          ? "OpenAI anahtarı eklenmedi — Ayarlar'dan ekleyin."
          : "Yapay zeka anahtarı eklenmedi — Ayarlar'dan ekleyin.",
    );
  }
}

/** Anahtar yok hatası; sahip-dışı kullanıcıda "sahibin paylaşılan anahtarı yok" mesajıyla */
async function noKey(provider: KeyProviderId): Promise<NoApiKeyError> {
  return new NoApiKeyError(provider, (await getCurrentUserId()) !== OWNER_USER_ID);
}

/** Claude istemcisi. Anahtar yoksa NoApiKeyError. */
export async function getAiClient(): Promise<AiClient> {
  const { key, source } = await getApiKey("anthropic");
  // Sahibin anahtarını paylaşan kullanıcı: her işlem günlük sınırdan düşer
  if (source === "owner") await consumeSharedAiQuota();
  if (g.__yatirimAiClientOverride) return g.__yatirimAiClientOverride;
  if (!key) throw await noKey("anthropic");
  return new Anthropic({ apiKey: key, maxRetries: 2, timeout: 5 * 60_000 });
}

/** OpenAI istemcisi. Anahtar yoksa NoApiKeyError. */
export async function getOpenAiClient(): Promise<OpenAiClient> {
  const { key, source } = await getApiKey("openai");
  if (source === "owner") await consumeSharedAiQuota();
  if (g.__yatirimOpenAiClientOverride) return g.__yatirimOpenAiClientOverride;
  if (!key) throw await noKey("openai");
  return new OpenAI({ apiKey: key, maxRetries: 2, timeout: 5 * 60_000 });
}

/**
 * Yerel model istemcisi (Ollama). Ücretsizdir: paylaşılan günlük sınırdan düşmez. Bulutta
 * (Vercel) LocalModelUnavailableError.
 */
export async function getOllamaClient(): Promise<OllamaClient> {
  if (localModelUnavailable()) throw new LocalModelUnavailableError();
  const s = await getAiSettings();
  const f = g.__yatirimOllamaFetchOverride;
  return { baseUrl: s.ollamaUrl, model: s.ollamaModel, fetch: f ?? ((input, init) => fetch(input, init)) };
}

/**
 * Arayüz için yapay zeka durumu: configured ve (kullanılamıyorsa) sharedMissing — sahip-dışı, kendi
 * anahtarı olmayan kullanıcıda sahibin paylaşılabilir anahtarı da yok ("Ayarlar'dan ekleyin" yerine
 * "sahibin paylaşılan anahtarı yok" denir).
 */
export async function aiStatus(): Promise<{ configured: boolean; sharedMissing: boolean }> {
  const configured = await isAiConfigured();
  return { configured, sharedMissing: !configured && (await usesSharedAi()) };
}

/** Etkin sağlayıcının (ya da verilen sağlayıcının) anahtarı / sahte istemcisi var mı (yerel model: bulutta değilse) */
export async function isAiConfigured(provider?: AiProviderId): Promise<boolean> {
  const p = provider ?? (await getAiSettings()).provider;
  if (p === "openai") return !!g.__yatirimOpenAiClientOverride || (await getApiKey("openai")).key != null;
  if (p === "ollama") return !localModelUnavailable();
  return !!g.__yatirimAiClientOverride || (await getApiKey("anthropic")).key != null;
}

/** Seçili Claude modeli */
export async function currentModel(): Promise<{ key: AiModelKey; id: string }> {
  const key = (await getAiSettings()).model;
  return { key, id: AI_MODELS[key].id };
}

// ---- Kullanım ve maliyet ----------------------------------------------------

export type UsageKind = "sohbet" | "haber" | "test" | "ozet" | "neden";

export interface UsageTotals {
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
  webSearches: number;
  costUsd: number;
}

export const emptyUsage = (): UsageTotals => ({
  inputTokens: 0,
  outputTokens: 0,
  cacheReadTokens: 0,
  cacheWriteTokens: 0,
  webSearches: 0,
  costUsd: 0,
});

const priciest = (list: readonly ModelPrice[]) => list.reduce((a, b) => (b.outputPerMTok > a.outputPerMTok ? b : a));

/** Fiyatı bilinmeyen model: Claude için Gelişmiş, OpenAI için listedeki en pahalı model (temkinli tahmin). */
function priceFor(modelId: string, override?: ModelPrice | null): ModelPrice {
  if (override) return override;
  const known = knownPrice(modelId);
  if (known) return known;
  if (modelId.startsWith("claude")) return AI_MODELS.gelismis;
  return priciest(OPENAI_MODELS);
}

/**
 * Tahmini maliyet: girdi, çıktı, önbellek yazma (1,25×), önbellek okuma (0,1×), web araması.
 * OpenAI'de önbellekten okunan girdi de yaklaşık 0,1× fiyatlıdır; yazma ücretsizdir (0 gelir).
 * Yerel model sıfır fiyatla kaydedilir (ZERO_PRICE).
 */
export function estimateCost(modelId: string, u: Omit<UsageTotals, "costUsd">, price?: ModelPrice | null): number {
  const p = priceFor(modelId, price);
  const searchUsd = WEB_SEARCH_USD;
  return (
    (u.inputTokens * p.inputPerMTok +
      u.cacheWriteTokens * p.inputPerMTok * 1.25 +
      u.cacheReadTokens * p.inputPerMTok * 0.1 +
      u.outputTokens * p.outputPerMTok) /
      1_000_000 +
    u.webSearches * searchUsd
  );
}

/** Sağlayıcıdan bağımsız kullanım kaydı; tahmini maliyeti döndürür. */
export async function recordUsageTotals(
  kind: UsageKind,
  provider: AiProviderId,
  modelId: string,
  u: Omit<UsageTotals, "costUsd">,
  price?: ModelPrice | null,
): Promise<UsageTotals> {
  const costUsd = estimateCost(modelId, u, price);
  await (await getDb()).run(`INSERT INTO ai_usage (user_id, kind, model, input_tokens, output_tokens, cache_read_tokens, cache_write_tokens, web_searches, cost_usd, provider)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, [await getCurrentUserId(), kind, modelId, u.inputTokens, u.outputTokens, u.cacheReadTokens, u.cacheWriteTokens, u.webSearches, costUsd, provider]);
  return { ...u, costUsd };
}

/** Claude API yanıtındaki usage alanını kaydeder; tahmini maliyeti döndürür. */
export async function recordUsage(kind: UsageKind, modelId: string, usage: Anthropic.Usage | null | undefined): Promise<UsageTotals> {
  return recordUsageTotals(kind, "anthropic", modelId, {
    inputTokens: usage?.input_tokens ?? 0,
    outputTokens: usage?.output_tokens ?? 0,
    cacheReadTokens: usage?.cache_read_input_tokens ?? 0,
    cacheWriteTokens: usage?.cache_creation_input_tokens ?? 0,
    webSearches: usage?.server_tool_use?.web_search_requests ?? 0,
  });
}

export function addUsage(a: UsageTotals, b: UsageTotals): UsageTotals {
  return {
    inputTokens: a.inputTokens + b.inputTokens,
    outputTokens: a.outputTokens + b.outputTokens,
    cacheReadTokens: a.cacheReadTokens + b.cacheReadTokens,
    cacheWriteTokens: a.cacheWriteTokens + b.cacheWriteTokens,
    webSearches: a.webSearches + b.webSearches,
    costUsd: a.costUsd + b.costUsd,
  };
}

/**
 * İstanbul saatine göre "now"un ayı: [ay başı, sonraki ay başı) aralığı, UTC
 * "YYYY-MM-DD HH:MM:SS" (created_at ile karşılaştırma için). Üst sınır önemli:
 * geçmiş bir tarihle sorulduğunda (testler, gecikmeli zamanlayıcı) sonraki ayların
 * harcaması o aya sayılmasın.
 */
export function monthRangeUtc(now = new Date()): { start: string; end: string } {
  const ym = now.toLocaleDateString("en-CA", { timeZone: "Europe/Istanbul" }).slice(0, 7);
  const [y, m] = ym.split("-").map(Number);
  const next = m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, "0")}`;
  // İstanbul UTC+3 (yaz saati yok)
  const iso = (s: string) => new Date(`${s}-01T00:00:00+03:00`).toISOString().slice(0, 19).replace("T", " ");
  return { start: iso(ym), end: iso(next) };
}

export interface BudgetStatus {
  spentUsd: number;
  budgetUsd: number;
  overBudget: boolean;
  searches: number;
  calls: number;
  /** Bu ayın sağlayıcı ve model başına harcaması */
  byModel: { provider: AiProviderId; model: string; costUsd: number; calls: number }[];
}

export async function getBudgetStatus(now = new Date()): Promise<BudgetStatus> {
  const { start, end } = monthRangeUtc(now);
  const db = await getDb();
  const uid = await getCurrentUserId();
  const row = await db.get("SELECT COALESCE(SUM(cost_usd),0) AS c, COALESCE(SUM(web_searches),0) AS s, COUNT(*) AS n FROM ai_usage WHERE user_id = ? AND created_at >= ? AND created_at < ?", [uid, start, end]) as { c: number; s: number; n: number };
  const models = await db.all<{ provider: AiProviderId; model: string; c: number; n: number }>(
    "SELECT provider, model, COALESCE(SUM(cost_usd),0) AS c, COUNT(*) AS n FROM ai_usage WHERE user_id = ? AND created_at >= ? AND created_at < ? GROUP BY provider, model ORDER BY c DESC",
    [uid, start, end],
  );
  const budgetUsd = (await getAiSettings()).budgetUsd;
  return {
    spentUsd: row.c,
    budgetUsd,
    overBudget: row.c >= budgetUsd,
    searches: row.s,
    calls: row.n,
    byModel: models.map((m) => ({ provider: m.provider, model: m.model, costUsd: m.c, calls: m.n })),
  };
}

// ---- Hata mesajları ---------------------------------------------------------

/** OpenAI SDK hatası → Türkçe mesaj (OpenAI hatası değilse null) */
function openAiErrorMessage(err: unknown): string | null {
  if (err instanceof OpenAI.APIConnectionTimeoutError) return "OpenAI API zaman aşımına uğradı. Biraz sonra tekrar deneyin.";
  if (err instanceof OpenAI.APIConnectionError) return "OpenAI API'ye bağlanılamadı. İnternet bağlantınızı kontrol edin.";
  if (!(err instanceof OpenAI.APIError)) return null;
  const code = err.code ?? "";
  const type = err.type ?? "";
  const msg = (err.error as { message?: string } | undefined)?.message ?? err.message;
  if (code === "insufficient_quota" || type === "insufficient_quota" || /quota|billing/i.test(msg)) {
    return "OpenAI hesabınızda kredi yok ya da kota doldu. platform.openai.com › Billing bölümünden ön ödemeli kredi yükleyin.";
  }
  if (err instanceof OpenAI.AuthenticationError || code === "invalid_api_key" || err.status === 401) {
    return "OpenAI API anahtarı geçersiz. Anahtarı platform.openai.com › API keys bölümünden kopyalayıp yeniden yapıştırın.";
  }
  if (err instanceof OpenAI.RateLimitError || err.status === 429) return "OpenAI'ye çok fazla istek gönderildi (hız sınırı). Bir dakika sonra tekrar deneyin.";
  if (err instanceof OpenAI.PermissionDeniedError || err.status === 403) return "Bu OpenAI anahtarının bu işleme ya da modele erişim izni yok (kuruluş doğrulaması gerekebilir).";
  if (err instanceof OpenAI.NotFoundError || code === "model_not_found") return "Seçilen OpenAI modeli bu hesapta bulunamadı. Ayarlar'dan başka bir model seçin.";
  if (err instanceof OpenAI.BadRequestError) return `OpenAI isteği reddetti: ${msg}`;
  if (err.status && err.status >= 500) return "OpenAI API'de geçici bir sorun var. Biraz sonra tekrar deneyin.";
  return `OpenAI API hatası (${err.status ?? "?"}): ${msg}`;
}

/** SDK hatasını kullanıcıya gösterilecek Türkçe mesaja çevirir. */
export function aiErrorMessage(err: unknown): string {
  if (err instanceof NoApiKeyError || err instanceof AiDailyLimitError || err instanceof AiGlobalLimitError) return err.message;
  if (err instanceof OllamaError || err instanceof LocalModelUnavailableError) return err.message;
  const oa = openAiErrorMessage(err);
  if (oa) return oa;
  if (err instanceof Anthropic.APIConnectionTimeoutError) return "Claude API zaman aşımına uğradı. Biraz sonra tekrar deneyin.";
  if (err instanceof Anthropic.APIConnectionError) return "Claude API'ye bağlanılamadı. İnternet bağlantınızı kontrol edin.";
  if (err instanceof Anthropic.APIError) {
    const body = err.error as { error?: { type?: string; message?: string } } | undefined;
    const type = body?.error?.type;
    const msg = body?.error?.message ?? "";
    if (err instanceof Anthropic.AuthenticationError || type === "authentication_error") {
      return "API anahtarı geçersiz. Anahtarı Claude Console'dan kopyalayıp yeniden yapıştırın.";
    }
    if (err instanceof Anthropic.PaymentRequiredError || type === "billing_error" || /credit balance/i.test(msg)) {
      return "Hesabınızda kredi yok. Claude Console › Billing bölümünden kredi yükleyin.";
    }
    if (err instanceof Anthropic.PermissionDeniedError || type === "permission_error") {
      return "Bu anahtarın bu işleme ya da modele erişim izni yok.";
    }
    if (err instanceof Anthropic.NotFoundError || type === "not_found_error") {
      return "Seçilen model bu hesapta bulunamadı. Ayarlar'dan diğer modeli deneyin.";
    }
    if (err instanceof Anthropic.RateLimitError || type === "rate_limit_error") {
      return "Çok fazla istek gönderildi (hız sınırı). Bir dakika sonra tekrar deneyin.";
    }
    if (type === "overloaded_error" || err.status === 529) return "Claude şu an yoğun. Biraz sonra tekrar deneyin.";
    if (err instanceof Anthropic.BadRequestError) return `İstek reddedildi: ${msg || err.message}`;
    if (err.status && err.status >= 500) return "Claude API'de geçici bir sorun var. Biraz sonra tekrar deneyin.";
    return `Claude API hatası (${err.status ?? "?"}): ${msg || err.message}`;
  }
  return "Beklenmeyen bir hata oluştu.";
}
