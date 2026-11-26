import "server-only";
import type Anthropic from "@anthropic-ai/sdk";
import { aiErrorMessage, getAiClient, getOllamaClient, getOpenAiClient, type AiClient, type UsageKind, type UsageTotals } from "./aiClient";
import { getAiSettings, PROVIDER_LABELS, type AiProviderId } from "./settings";
import { anthropicProvider } from "./aiAnthropic";
import { openAiProvider } from "./aiOpenAi";
import { ollamaProvider } from "./aiOllama";

// YAPAY ZEKA SAĞLAYICI ARAYÜZÜ
// Sohbet, haber analizi, günlük özet ve "neden hareket ediyor" bu arayüzü kullanır; Claude
// (aiAnthropic.ts), OpenAI (aiOpenAi.ts, Responses API) ve yerel model (aiOllama.ts, Ollama
// /api/chat) aynı araç tanımlarıyla çalışır. Sohbet geçmişi veritabanında Claude içerik blokları
// biçiminde saklanır (text, tool_use, tool_result); diğer sağlayıcılar bunları her çağrıda kendi
// biçimine çevirir. (Kaldırılan Gemini sağlayıcısının eski sohbetlerdeki ek alanları yok sayılır.)

/** Saklanan sohbet mesajı (Claude biçimi; sağlayıcıdan bağımsız ortak biçim olarak kullanılır) */
export type CanonMessage = Anthropic.MessageParam;
/** Saklanan içerik bloğu */
export type CanonBlock = Anthropic.ContentBlockParam | Anthropic.ContentBlock;
/** Araç tanımı (Claude biçimi: name, description, input_schema); OpenAI'ye çevrilir */
export type ToolDef = Anthropic.Tool;

export interface ToolCall {
  id: string;
  name: string;
  input: unknown;
}

export interface ChatStepParams {
  system: string;
  tools: ToolDef[];
  /** Bu adımda yapılabilecek en fazla web araması (0: web araması kapalı) */
  maxSearches: number;
  messages: CanonMessage[];
  signal?: AbortSignal;
  onText: (delta: string) => void;
  /** Bir araç çağrısı başladı (araç adı; web araması için "web_search") */
  onStatus: (toolName: string) => void;
}

export interface ChatStepResult {
  /** Saklanacak asistan mesajı içeriği (tool_use blokları dahil) */
  content: CanonBlock[];
  toolCalls: ToolCall[];
  /** end: bitti, tool_use: araç çağrısı, max_tokens: uzunluk sınırı, refusal: ret, pause: sunucu aracı yarıda (devam) */
  stop: "end" | "tool_use" | "max_tokens" | "refusal" | "pause";
  usage: UsageTotals;
}

export interface StructuredParams {
  kind: UsageKind;
  system: string;
  user: string;
  /** Sonucun şeması (Claude'da çağrılacak araç, OpenAI'de yapılandırılmış çıktı) */
  tool: ToolDef;
  maxSearches: number;
  /** Her API çağrısından sonra (hata olsa da harcama kaydı tutulsun diye) */
  onUsage: (u: UsageTotals) => void;
}

export interface StructuredResult {
  /** Şemaya uyan sonuç (alınamadıysa null) */
  input: unknown | null;
  /** Web araması sonuçları ve alıntılar: url → başlık */
  sources: Map<string, string>;
}

export interface CompleteParams {
  kind: UsageKind;
  system: string;
  user: string;
  /** Ucuz modeli kullan (günlük özet, neden hareket ediyor) */
  cheap?: boolean;
}

export interface AiProvider {
  readonly id: AiProviderId;
  readonly label: string;
  /** Web araması yapabilir mi (yerel model: hayır; haber analizi aramasız, ücretsiz başlıklarla yapılır) */
  readonly webSearch: boolean;
  /** Seçili ana model kimliği */
  model(): Promise<string>;
  /** Sohbet: tek model çağrısı (akış hâlinde), araç çağrılarını döndürür */
  chatStep(p: ChatStepParams): Promise<ChatStepResult>;
  /** Web aramalı (isteğe bağlı) yapılandırılmış sonuç */
  structured(p: StructuredParams): Promise<StructuredResult>;
  /** Araçsız, web aramasız kısa metin */
  complete(p: CompleteParams): Promise<{ text: string; usage: UsageTotals; model: string }>;
  /** "Bağlantıyı test et": çok küçük istek; başarılıysa model etiketi döner, hata fırlatır */
  ping(): Promise<string>;
}

/** Testler ve eski çağrılar: Claude istemcisi ya da hazır sağlayıcı */
export type AiBackend = AiClient | AiProvider;

export function isProvider(x: unknown): x is AiProvider {
  return !!x && typeof (x as AiProvider).chatStep === "function";
}

/**
 * Sağlayıcı: backend verilirse o (Claude istemcisi sarmalanır), yoksa Ayarlar'daki etkin
 * sağlayıcı (ya da which). Anahtar yoksa NoApiKeyError.
 */
export async function getProvider(backend?: AiBackend | null, which?: AiProviderId): Promise<AiProvider> {
  if (backend) return isProvider(backend) ? backend : anthropicProvider(backend);
  const id = which ?? (await getAiSettings()).provider;
  if (id === "openai") return openAiProvider(await getOpenAiClient());
  if (id === "ollama") return ollamaProvider(await getOllamaClient());
  return anthropicProvider(await getAiClient());
}

/** "Bağlantıyı test et": çok küçük bir istek gönderir. which verilmezse etkin sağlayıcı. */
export async function testConnection(which?: AiProviderId, backend?: AiBackend): Promise<{ ok: boolean; message: string }> {
  let provider: AiProvider;
  try {
    provider = await getProvider(backend, which);
  } catch (err) {
    return { ok: false, message: aiErrorMessage(err) };
  }
  try {
    const label = await provider.ping();
    return { ok: true, message: `${PROVIDER_LABELS[provider.id]} bağlantısı başarılı. Model: ${label}.` };
  } catch (err) {
    return { ok: false, message: aiErrorMessage(err) };
  }
}
