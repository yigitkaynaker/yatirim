import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { getDb } from "./db";
import { AI_MODELS, getAiSettings, getApiKey, WEB_SEARCH_USD, type AiModelKey } from "./settings";

// Claude API istemcisi, kullanım/maliyet kaydı, aylık bütçe ve Türkçe hata mesajları.

/** Testlerde sahte istemci vermek için. Yalnızca messages.stream / messages.create kullanılır. */
export type AiClient = Pick<Anthropic, "messages">;

const g = globalThis as unknown as { __yatirimAiClientOverride?: AiClient | null };

/** Testler için: sahte istemci ayarla (null: gerçek istemciye dön). */
export function setAiClientOverride(client: AiClient | null) {
  g.__yatirimAiClientOverride = client;
}

export class NoApiKeyError extends Error {
  constructor() {
    super("Yapay zeka anahtarı eklenmedi — Ayarlar'dan ekleyin.");
  }
}

/** Anahtar yoksa NoApiKeyError. */
export async function getAiClient(): Promise<AiClient> {
  if (g.__yatirimAiClientOverride) return g.__yatirimAiClientOverride;
  const { key } = await getApiKey();
  if (!key) throw new NoApiKeyError();
  return new Anthropic({ apiKey: key, maxRetries: 2, timeout: 5 * 60_000 });
}

export async function isAiConfigured(): Promise<boolean> {
  return !!g.__yatirimAiClientOverride || (await getApiKey()).key != null;
}

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

function priceFor(modelId: string) {
  return Object.values(AI_MODELS).find((m) => m.id === modelId) ?? AI_MODELS.gelismis;
}

/** Tahmini maliyet: girdi, çıktı, önbellek yazma (1,25×), önbellek okuma (0,1×), web araması. */
export function estimateCost(modelId: string, u: Omit<UsageTotals, "costUsd">): number {
  const p = priceFor(modelId);
  return (
    (u.inputTokens * p.inputPerMTok +
      u.cacheWriteTokens * p.inputPerMTok * 1.25 +
      u.cacheReadTokens * p.inputPerMTok * 0.1 +
      u.outputTokens * p.outputPerMTok) /
      1_000_000 +
    u.webSearches * WEB_SEARCH_USD
  );
}

/** API yanıtındaki usage alanını kaydeder; tahmini maliyeti döndürür. */
export async function recordUsage(kind: UsageKind, modelId: string, usage: Anthropic.Usage | null | undefined): Promise<UsageTotals> {
  const u = {
    inputTokens: usage?.input_tokens ?? 0,
    outputTokens: usage?.output_tokens ?? 0,
    cacheReadTokens: usage?.cache_read_input_tokens ?? 0,
    cacheWriteTokens: usage?.cache_creation_input_tokens ?? 0,
    webSearches: usage?.server_tool_use?.web_search_requests ?? 0,
  };
  const costUsd = estimateCost(modelId, u);
  await (await getDb()).run(`INSERT INTO ai_usage (kind, model, input_tokens, output_tokens, cache_read_tokens, cache_write_tokens, web_searches, cost_usd)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`, [kind, modelId, u.inputTokens, u.outputTokens, u.cacheReadTokens, u.cacheWriteTokens, u.webSearches, costUsd]);
  return { ...u, costUsd };
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
}

export async function getBudgetStatus(now = new Date()): Promise<BudgetStatus> {
  const { start, end } = monthRangeUtc(now);
  const row = await (await getDb()).get("SELECT COALESCE(SUM(cost_usd),0) AS c, COALESCE(SUM(web_searches),0) AS s, COUNT(*) AS n FROM ai_usage WHERE created_at >= ? AND created_at < ?", [start, end]) as { c: number; s: number; n: number };
  const budgetUsd = (await getAiSettings()).budgetUsd;
  return { spentUsd: row.c, budgetUsd, overBudget: row.c >= budgetUsd, searches: row.s, calls: row.n };
}

// ---- Hata mesajları ---------------------------------------------------------

/** SDK hatasını kullanıcıya gösterilecek Türkçe mesaja çevirir. */
export function aiErrorMessage(err: unknown): string {
  if (err instanceof NoApiKeyError) return err.message;
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

/** "Bağlantıyı test et": çok küçük bir istek gönderir. */
export async function testConnection(): Promise<{ ok: boolean; message: string }> {
  let client: AiClient;
  try {
    client = await getAiClient();
  } catch (err) {
    return { ok: false, message: aiErrorMessage(err) };
  }
  const model = await currentModel();
  try {
    const res = await client.messages.create({
      model: model.id,
      max_tokens: 64,
      output_config: { effort: "low" },
      messages: [{ role: "user", content: "Sadece \"tamam\" yaz." }],
    });
    await recordUsage("test", model.id, res.usage);
    return { ok: true, message: `Bağlantı başarılı. Model: ${AI_MODELS[model.key].label}.` };
  } catch (err) {
    return { ok: false, message: aiErrorMessage(err) };
  }
}
