import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import OpenAI from "openai";
import { getDb } from "./db";
import { getCurrentUserId } from "./userContext";
import {
  AI_MODELS,
  AiDailyLimitError,
  AiGlobalLimitError,
  consumeSharedAiQuota,
  getAiSettings,
  GEMINI_MODELS,
  GEMINI_SEARCH_USD,
  getApiKey,
  knownPrice,
  OPENAI_MODELS,
  WEB_SEARCH_USD,
  type AiModelKey,
  type AiProviderId,
  type ModelPrice,
} from "./settings";

// Yapay zeka istemcileri (Claude, OpenAI ve Gemini), kullanım/maliyet kaydı, aylık bütçe ve Türkçe
// hata mesajları. Sağlayıcıdan bağımsız arayüz: aiProvider.ts.

/** Testlerde sahte istemci vermek için. Yalnızca messages.stream / messages.create kullanılır. */
export type AiClient = Pick<Anthropic, "messages">;
/** OpenAI istemcisi: yalnızca responses.create kullanılır (Responses API). */
export type OpenAiClient = Pick<OpenAI, "responses">;
/**
 * Gemini istemcisi: SDK yok, doğrudan REST (generateContent / streamGenerateContent). Testlerde
 * sahte fetch verilir; gerçek istemcide global fetch kullanılır.
 */
export interface GeminiClient {
  apiKey: string;
  fetch: typeof fetch;
  /** Varsayılan: https://generativelanguage.googleapis.com/v1beta */
  baseUrl?: string;
}

/** Gemini REST hatası (gövdedeki error.status / details[].reason ile) */
export class GeminiApiError extends Error {
  readonly httpStatus: number;
  /** ör. INVALID_ARGUMENT, PERMISSION_DENIED, RESOURCE_EXHAUSTED */
  readonly status: string;
  /** ör. API_KEY_INVALID */
  readonly reason: string | null;
  constructor(httpStatus: number, status: string, message: string, reason: string | null = null) {
    super(message);
    this.name = "GeminiApiError";
    this.httpStatus = httpStatus;
    this.status = status;
    this.reason = reason;
  }
}

/** Gemini'ye ulaşılamadı (ağ hatası ya da zaman aşımı) */
export class GeminiConnectionError extends Error {
  readonly timeout: boolean;
  constructor(timeout: boolean) {
    super(timeout ? "Gemini API zaman aşımı" : "Gemini API bağlantı hatası");
    this.name = "GeminiConnectionError";
    this.timeout = timeout;
  }
}

const g = globalThis as unknown as {
  __yatirimAiClientOverride?: AiClient | null;
  __yatirimOpenAiClientOverride?: OpenAiClient | null;
  __yatirimGeminiClientOverride?: GeminiClient | null;
};

/** Testler için: sahte Claude istemcisi ayarla (null: gerçek istemciye dön). */
export function setAiClientOverride(client: AiClient | null) {
  g.__yatirimAiClientOverride = client;
}

/** Testler için: sahte OpenAI istemcisi ayarla (null: gerçek istemciye dön). */
export function setOpenAiClientOverride(client: OpenAiClient | null) {
  g.__yatirimOpenAiClientOverride = client;
}

/** Testler için: sahte Gemini istemcisi (sahte fetch) ayarla (null: gerçek istemciye dön). */
export function setGeminiClientOverride(client: GeminiClient | null) {
  g.__yatirimGeminiClientOverride = client;
}

export class NoApiKeyError extends Error {
  constructor(provider: AiProviderId = "anthropic") {
    super(
      provider === "openai"
        ? "OpenAI anahtarı eklenmedi — Ayarlar'dan ekleyin."
        : provider === "gemini"
          ? "Gemini anahtarı eklenmedi — Ayarlar'dan ekleyin."
          : "Yapay zeka anahtarı eklenmedi — Ayarlar'dan ekleyin.",
    );
  }
}

/** Claude istemcisi. Anahtar yoksa NoApiKeyError. */
export async function getAiClient(): Promise<AiClient> {
  const { key, source } = await getApiKey("anthropic");
  // Sahibin anahtarını paylaşan kullanıcı: her işlem günlük sınırdan düşer
  if (source === "owner") await consumeSharedAiQuota();
  if (g.__yatirimAiClientOverride) return g.__yatirimAiClientOverride;
  if (!key) throw new NoApiKeyError("anthropic");
  return new Anthropic({ apiKey: key, maxRetries: 2, timeout: 5 * 60_000 });
}

/** OpenAI istemcisi. Anahtar yoksa NoApiKeyError. */
export async function getOpenAiClient(): Promise<OpenAiClient> {
  const { key, source } = await getApiKey("openai");
  if (source === "owner") await consumeSharedAiQuota();
  if (g.__yatirimOpenAiClientOverride) return g.__yatirimOpenAiClientOverride;
  if (!key) throw new NoApiKeyError("openai");
  return new OpenAI({ apiKey: key, maxRetries: 2, timeout: 5 * 60_000 });
}

/** Gemini istemcisi. Anahtar yoksa NoApiKeyError. */
export async function getGeminiClient(): Promise<GeminiClient> {
  const { key, source } = await getApiKey("gemini");
  if (source === "owner") await consumeSharedAiQuota();
  if (g.__yatirimGeminiClientOverride) return g.__yatirimGeminiClientOverride;
  if (!key) throw new NoApiKeyError("gemini");
  return { apiKey: key, fetch: (input, init) => fetch(input, init) };
}

/** Etkin sağlayıcının (ya da verilen sağlayıcının) anahtarı / sahte istemcisi var mı */
export async function isAiConfigured(provider?: AiProviderId): Promise<boolean> {
  const p = provider ?? (await getAiSettings()).provider;
  if (p === "openai") return !!g.__yatirimOpenAiClientOverride || (await getApiKey("openai")).key != null;
  if (p === "gemini") return !!g.__yatirimGeminiClientOverride || (await getApiKey("gemini")).key != null;
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

/** Fiyatı bilinmeyen model: Claude için Gelişmiş, OpenAI / Gemini için listedeki en pahalı model (temkinli tahmin). */
function priceFor(modelId: string, override?: ModelPrice | null): ModelPrice {
  if (override) return override;
  const known = knownPrice(modelId);
  if (known) return known;
  if (modelId.startsWith("claude")) return AI_MODELS.gelismis;
  if (modelId.startsWith("gemini")) return priciest(GEMINI_MODELS);
  return priciest(OPENAI_MODELS);
}

/**
 * Tahmini maliyet: girdi, çıktı, önbellek yazma (1,25×), önbellek okuma (0,1×), web araması.
 * OpenAI'de önbellekten okunan girdi de yaklaşık 0,1× fiyatlıdır; yazma ücretsizdir (0 gelir).
 * Gemini'de örtük önbellek okuması da ~0,1×; Google Search sorgusu $14 / 1000.
 */
export function estimateCost(modelId: string, u: Omit<UsageTotals, "costUsd">, price?: ModelPrice | null): number {
  const p = priceFor(modelId, price);
  const searchUsd = modelId.startsWith("gemini") ? GEMINI_SEARCH_USD : WEB_SEARCH_USD;
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

/** Gemini REST hatası → Türkçe mesaj (Gemini hatası değilse null) */
function geminiErrorMessage(err: unknown): string | null {
  if (err instanceof GeminiConnectionError) {
    return err.timeout ? "Gemini API zaman aşımına uğradı. Biraz sonra tekrar deneyin." : "Gemini API'ye bağlanılamadı. İnternet bağlantınızı kontrol edin.";
  }
  if (!(err instanceof GeminiApiError)) return null;
  const msg = err.message;
  if (err.reason === "API_KEY_INVALID" || /api key not valid|api_key_invalid/i.test(msg) || err.httpStatus === 401) {
    return "Gemini API anahtarı geçersiz. Anahtarı aistudio.google.com/apikey adresinden kopyalayıp yeniden yapıştırın.";
  }
  if (err.httpStatus === 429 || err.status === "RESOURCE_EXHAUSTED") {
    return /quota/i.test(msg)
      ? "Gemini kotası doldu (ücretsiz katman sınırı ya da harcama limiti). AI Studio'da faturalandırmayı açın ya da biraz sonra tekrar deneyin."
      : "Gemini'ye çok fazla istek gönderildi (hız sınırı). Bir dakika sonra tekrar deneyin.";
  }
  if (err.status === "FAILED_PRECONDITION" || /billing/i.test(msg)) {
    return "Gemini bu istek için faturalandırma istiyor (ücretsiz katman bu bölgede ya da bu modelde kullanılamıyor). AI Studio › Billing bölümünden faturalandırmayı açın.";
  }
  if (err.httpStatus === 403 || err.status === "PERMISSION_DENIED") return "Bu Gemini anahtarının bu işleme ya da modele erişim izni yok (Generative Language API kapalı olabilir).";
  if (err.httpStatus === 404 || err.status === "NOT_FOUND") return "Seçilen Gemini modeli bulunamadı. Ayarlar'dan başka bir model seçin.";
  if (err.httpStatus === 400) return `Gemini isteği reddetti: ${msg}`;
  if (err.httpStatus >= 500) return "Gemini API'de geçici bir sorun var. Biraz sonra tekrar deneyin.";
  return `Gemini API hatası (${err.httpStatus || "?"}): ${msg}`;
}

/** SDK hatasını kullanıcıya gösterilecek Türkçe mesaja çevirir. */
export function aiErrorMessage(err: unknown): string {
  if (err instanceof NoApiKeyError || err instanceof AiDailyLimitError || err instanceof AiGlobalLimitError) return err.message;
  const oa = openAiErrorMessage(err);
  if (oa) return oa;
  const gm = geminiErrorMessage(err);
  if (gm) return gm;
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
