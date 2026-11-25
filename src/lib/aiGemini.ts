import "server-only";
import { GeminiApiError, GeminiConnectionError, recordUsageTotals, type GeminiClient, type UsageKind, type UsageTotals } from "./aiClient";
import { GEMINI_CHEAP_MODEL, GEMINI_MODELS, getAiSettings, knownPrice, type ModelPrice } from "./settings";
import type { AiProvider, CanonBlock, CanonMessage, ChatStepResult, ToolCall, ToolDef } from "./aiProvider";

// GOOGLE GEMINI SAĞLAYICISI (REST generateContent / streamGenerateContent, SDK'sız).
// Aynı araç tanımları (ToolDef) functionDeclarations'a (parametersJsonSchema), Claude biçimindeki
// sohbet geçmişi Gemini "contents" dizisine çevrilir. Web araması Google Search grounding ile
// yapılır; Gemini 3+ modellerinde araç çağırma ile aynı istekte kullanılabilir
// (toolConfig.includeServerSideToolInvocations + VALIDATED kipi).
//
// Düşünce imzaları (thoughtSignature): Gemini 3+ araç çağrılı yanıtlarda imzanın bir sonraki
// istekte aynen geri gönderilmesini ister (yoksa 400). Bu yüzden modelin ham parçaları asistan
// mesajının ilk bloğunda "gemini_parts", her araç çağrısının imzası da tool_use bloğunda
// "gemini_signature" olarak saklanır. Geçmiş başka bir sağlayıcıdan geldiyse belgelerdeki
// doğrulama atlama imzası kullanılır. Claude'a gönderilirken bu alanlar atılır (aiAnthropic.ts).

type Json = Record<string, unknown>;

export interface GeminiPart {
  text?: string;
  thought?: boolean;
  thoughtSignature?: string;
  functionCall?: { id?: string; name: string; args?: Json };
  functionResponse?: { id?: string; name: string; response: Json };
  /** Sunucu tarafı yerleşik araç çağrısı (Google Search) */
  toolCall?: { id?: string; toolType?: string; args?: Json };
  toolResponse?: { id?: string; toolType?: string; response?: Json };
  [k: string]: unknown;
}

export interface GeminiContent {
  role: "user" | "model";
  parts: GeminiPart[];
}

interface GroundingMetadata {
  webSearchQueries?: string[];
  groundingChunks?: { web?: { uri?: string; title?: string } }[];
}

export interface GeminiResponse {
  candidates?: { content?: { role?: string; parts?: GeminiPart[] }; finishReason?: string; groundingMetadata?: GroundingMetadata }[];
  promptFeedback?: { blockReason?: string };
  usageMetadata?: {
    promptTokenCount?: number;
    candidatesTokenCount?: number;
    thoughtsTokenCount?: number;
    cachedContentTokenCount?: number;
    toolUsePromptTokenCount?: number;
    totalTokenCount?: number;
  };
}

/** Belgelerdeki doğrulama atlama imzası: geçmişteki araç çağrısı bu API'den gelmediyse */
export const SKIP_SIGNATURE = "skip_thought_signature_validator";
const DEFAULT_BASE = "https://generativelanguage.googleapis.com/v1beta";
const TIMEOUT_MS = 5 * 60_000;

// ---- REST ----------------------------------------------------------------------------------

async function errorFrom(res: Response): Promise<GeminiApiError> {
  let status = "";
  let message = res.statusText || "Bilinmeyen hata";
  let reason: string | null = null;
  try {
    const body = (await res.json()) as { error?: { status?: string; message?: string; details?: { reason?: string }[] } };
    status = body.error?.status ?? "";
    message = body.error?.message ?? message;
    reason = body.error?.details?.find((d) => d.reason)?.reason ?? null;
  } catch {
    // Gövde JSON değil
  }
  return new GeminiApiError(res.status, status, message, reason);
}

/** İstek gönderir; ağ hatası ve geçici 5xx'te iki kez yeniden dener. */
async function post(client: GeminiClient, model: string, method: "generateContent" | "streamGenerateContent", body: unknown, signal?: AbortSignal): Promise<Response> {
  const url = `${client.baseUrl ?? DEFAULT_BASE}/models/${encodeURIComponent(model)}:${method}${method === "streamGenerateContent" ? "?alt=sse" : ""}`;
  for (let attempt = 0; ; attempt++) {
    const timeout = AbortSignal.timeout(TIMEOUT_MS);
    let res: Response;
    try {
      res = await client.fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-goog-api-key": client.apiKey },
        body: JSON.stringify(body),
        signal: signal ? AbortSignal.any([signal, timeout]) : timeout,
      });
    } catch (err) {
      if (signal?.aborted) throw err;
      if (attempt < 2 && !timeout.aborted) {
        await new Promise((r) => setTimeout(r, 1000 * (attempt + 1)));
        continue;
      }
      throw new GeminiConnectionError(timeout.aborted);
    }
    if (res.ok) return res;
    if (attempt < 2 && [500, 502, 503, 504].includes(res.status)) {
      await res.body?.cancel().catch(() => {});
      await new Promise((r) => setTimeout(r, 1000 * (attempt + 1)));
      continue;
    }
    throw await errorFrom(res);
  }
}

export async function geminiGenerate(client: GeminiClient, model: string, body: Json, signal?: AbortSignal): Promise<GeminiResponse> {
  return (await (await post(client, model, "generateContent", body, signal)).json()) as GeminiResponse;
}

/** Sunucu olayları (SSE, alt=sse): her "data:" satırı bir GenerateContentResponse parçasıdır. */
export async function* geminiStream(client: GeminiClient, model: string, body: Json, signal?: AbortSignal): AsyncGenerator<GeminiResponse> {
  const res = await post(client, model, "streamGenerateContent", body, signal);
  if (!res.body) return;
  const reader = res.body.getReader();
  const dec = new TextDecoder();
  let buf = "";
  const parse = function* (chunk: string) {
    const data = chunk
      .split(/\r?\n/)
      .filter((l) => l.startsWith("data:"))
      .map((l) => l.slice(5).trimStart())
      .join("\n");
    if (!data || data === "[DONE]") return;
    const obj = JSON.parse(data) as GeminiResponse & { error?: { message?: string; status?: string; code?: number } };
    if (obj.error) throw new GeminiApiError(obj.error.code ?? 500, obj.error.status ?? "", obj.error.message ?? "Gemini akış hatası");
    yield obj;
  };
  for (;;) {
    const { done, value } = await reader.read();
    if (value) buf += dec.decode(value, { stream: true });
    let i: number;
    while ((i = buf.search(/\r?\n\r?\n/)) >= 0) {
      const chunk = buf.slice(0, i);
      buf = buf.slice(i).replace(/^\r?\n\r?\n/, "");
      yield* parse(chunk);
    }
    if (done) break;
  }
  if (buf.trim()) yield* parse(buf);
}

// ---- Araç ve geçmiş çevirisi --------------------------------------------------------------

export function toGeminiTools(tools: ToolDef[]): Json[] {
  if (!tools.length) return [];
  return [{ functionDeclarations: tools.map((t) => ({ name: t.name, description: t.description ?? "", parametersJsonSchema: t.input_schema })) }];
}

const isServerToolPart = (p: GeminiPart) => !!(p.toolCall || p.toolResponse);

/** Araç sonucu metni → functionResponse.response (nesne olmalı) */
function responseObject(output: string, isError: boolean): Json {
  if (isError) return { hata: output };
  try {
    const v = JSON.parse(output) as unknown;
    return v && typeof v === "object" && !Array.isArray(v) ? (v as Json) : { sonuc: v };
  } catch {
    return { sonuc: output };
  }
}

type Stored = CanonBlock & { gemini_parts?: GeminiPart[]; gemini_signature?: string };

/**
 * Saklanan (Claude biçimi) geçmiş → Gemini contents. Gemini'nin kendi ürettiği asistan mesajında
 * ham parçalar (imzalarıyla) aynen kullanılır; araç çağrıları saklanan bloklarla eşleşmiyorsa
 * (ör. son mesajdan tool_use atıldıysa) bloklardan yeniden kurulur. keepServerTools false ise
 * Google Search parçaları (toolCall / toolResponse) atılır (bu istekte arama kapalı).
 */
export function toGeminiContents(messages: CanonMessage[], keepServerTools = true): GeminiContent[] {
  const names = new Map<string, string>();
  for (const m of messages) {
    if (typeof m.content === "string") continue;
    for (const b of m.content) if (b.type === "tool_use") names.set(b.id, b.name);
  }
  const out: GeminiContent[] = [];
  const push = (role: GeminiContent["role"], parts: GeminiPart[]) => {
    if (!parts.length) return;
    const last = out[out.length - 1];
    if (last && last.role === role) last.parts.push(...parts);
    else out.push({ role, parts });
  };
  for (const m of messages) {
    const role = m.role === "assistant" ? "model" : "user";
    if (typeof m.content === "string") {
      if (m.content.trim()) push(role, [{ text: m.content }]);
      continue;
    }
    const blocks = m.content as Stored[];
    const raw = role === "model" ? blocks.find((b) => Array.isArray(b.gemini_parts))?.gemini_parts : undefined;
    if (raw) {
      const rawIds = raw.filter((p) => p.functionCall).map((p) => p.functionCall?.id ?? "");
      const ids = blocks.filter((b) => b.type === "tool_use").map((b) => (b as { id: string }).id);
      if (rawIds.length === ids.length && rawIds.every((id) => ids.includes(id))) {
        push(role, structuredClone(raw).filter((p) => keepServerTools || !isServerToolPart(p)));
        continue;
      }
    }
    const parts: GeminiPart[] = [];
    for (const b of blocks) {
      if (b.type === "text") {
        if (b.text) parts.push({ text: b.text });
      } else if (b.type === "tool_use") {
        const part: GeminiPart = { functionCall: { ...(b.id.startsWith("gemini_call_") ? {} : { id: b.id }), name: b.name, args: (b.input ?? {}) as Json } };
        if (b.gemini_signature) part.thoughtSignature = b.gemini_signature;
        parts.push(part);
      } else if (b.type === "tool_result") {
        const c = b.content;
        const output = typeof c === "string" ? c : Array.isArray(c) ? c.map((x) => (x.type === "text" ? x.text : "")).join("") : "";
        const id = b.tool_use_id;
        parts.push({
          functionResponse: { ...(id.startsWith("gemini_call_") ? {} : { id }), name: names.get(id) ?? "arac", response: responseObject(output, !!b.is_error) },
        });
      }
      // Sunucu aracı blokları (Claude web_search vb.) Gemini'ye gönderilmez.
    }
    // Gemini 3+: araç çağrılı model içeriğinde ilk functionCall imzası zorunlu
    const firstCall = parts.find((p) => p.functionCall);
    if (role === "model" && firstCall && !firstCall.thoughtSignature) firstCall.thoughtSignature = SKIP_SIGNATURE;
    push(role, parts);
  }
  return out;
}

// ---- Yanıt çözümleme -------------------------------------------------------------------------

/** Akış parçalarını birleştirir: ardışık düz metin parçaları tek parçada toplanır (imza korunur). */
export function mergeParts(into: GeminiPart[], incoming: GeminiPart[]) {
  for (const p of incoming) {
    const last = into[into.length - 1];
    const plain = (x: GeminiPart) => typeof x.text === "string" && !x.thought && !x.functionCall && !x.toolCall && !x.toolResponse;
    if (last && plain(last) && plain(p) && !last.thoughtSignature) {
      last.text = (last.text ?? "") + (p.text ?? "");
      if (p.thoughtSignature) last.thoughtSignature = p.thoughtSignature;
    } else {
      into.push({ ...p });
    }
  }
}

interface Parsed {
  content: CanonBlock[];
  toolCalls: ToolCall[];
  text: string;
  searches: number;
  sources: Map<string, string>;
}

export function parseParts(parts: GeminiPart[], grounding: GroundingMetadata | undefined): Parsed {
  const content: CanonBlock[] = [];
  const toolCalls: ToolCall[] = [];
  const sources = new Map<string, string>();
  let text = "";
  let pendingText = "";
  let serverCalls = 0;
  const flush = () => {
    if (pendingText) content.push({ type: "text", text: pendingText, citations: null } as unknown as CanonBlock);
    pendingText = "";
  };
  parts.forEach((p, i) => {
    if (p.functionCall) {
      flush();
      const id = p.functionCall.id || `gemini_call_${i}`;
      const input = p.functionCall.args ?? {};
      content.push({ type: "tool_use", id, name: p.functionCall.name, input, ...(p.thoughtSignature ? { gemini_signature: p.thoughtSignature } : {}) } as unknown as CanonBlock);
      toolCalls.push({ id, name: p.functionCall.name, input });
    } else if (p.toolCall) {
      serverCalls++;
    } else if (typeof p.text === "string" && !p.thought) {
      pendingText += p.text;
      text += p.text;
    }
  });
  flush();
  for (const c of grounding?.groundingChunks ?? []) {
    const uri = c.web?.uri;
    if (uri && !sources.has(uri)) sources.set(uri, c.web?.title || uri);
  }
  // Kaynaklar son metin bloğuna url_citation olarak eklenir (sohbet ekranı kaynak listesini buradan toplar)
  const lastText = [...content].reverse().find((b) => b.type === "text") as { citations?: unknown } | undefined;
  if (lastText && sources.size) lastText.citations = [...sources].map(([url, title]) => ({ type: "url_citation", url, title }));
  // Ham parçalar (imzalarıyla) ilk blokta saklanır: sonraki istekte aynen geri gönderilir
  if (content.length && parts.length) (content[0] as Stored).gemini_parts = parts;
  const searches = Math.max(new Set(grounding?.webSearchQueries ?? []).size, serverCalls);
  return { content, toolCalls, text, searches, sources };
}

function usageOf(u: GeminiResponse["usageMetadata"], searches: number): Omit<UsageTotals, "costUsd"> {
  const cached = u?.cachedContentTokenCount ?? 0;
  return {
    inputTokens: Math.max(0, (u?.promptTokenCount ?? 0) + (u?.toolUsePromptTokenCount ?? 0) - cached),
    // Düşünme token'ları çıktı fiyatıyla faturalanır
    outputTokens: (u?.candidatesTokenCount ?? 0) + (u?.thoughtsTokenCount ?? 0),
    cacheReadTokens: cached,
    cacheWriteTokens: 0,
    webSearches: searches,
  };
}

const REFUSAL_REASONS = new Set(["SAFETY", "PROHIBITED_CONTENT", "BLOCKLIST", "SPII", "RECITATION", "IMAGE_SAFETY"]);

function stopOf(finish: string | undefined, blocked: boolean, toolCalls: number): ChatStepResult["stop"] {
  if (blocked || (finish && REFUSAL_REASONS.has(finish))) return "refusal";
  if (finish === "MAX_TOKENS") return "max_tokens";
  return toolCalls ? "tool_use" : "end";
}

/** Arama açıkken: yerleşik araç + işlev çağırma birlikte (AUTO bu kipte desteklenmez) */
function toolConfig(search: boolean): Json | undefined {
  return search ? { includeServerSideToolInvocations: true, functionCallingConfig: { mode: "VALIDATED" } } : undefined;
}

// ---- Sağlayıcı ---------------------------------------------------------------------------

export function geminiProvider(client: GeminiClient): AiProvider {
  async function selected(): Promise<{ model: string; price: ModelPrice | null }> {
    const s = await getAiSettings();
    return { model: s.geminiModel, price: knownPrice(s.geminiModel) ? null : s.geminiPrice };
  }
  const record = (kind: UsageKind, model: string, u: GeminiResponse["usageMetadata"], searches: number, price: ModelPrice | null) =>
    recordUsageTotals(kind, "gemini", model, usageOf(u, searches), price);

  return {
    id: "gemini",
    label: "Gemini",
    model: async () => (await selected()).model,

    async chatStep(p): Promise<ChatStepResult> {
      const { model, price } = await selected();
      const search = p.maxSearches > 0;
      const tc = toolConfig(search && p.tools.length > 0);
      const body: Json = {
        systemInstruction: { parts: [{ text: p.system }] },
        contents: toGeminiContents(p.messages, search),
        tools: [...toGeminiTools(p.tools), ...(search ? [{ googleSearch: {} }] : [])],
        ...(tc ? { toolConfig: tc } : {}),
        generationConfig: { maxOutputTokens: 8000, thinkingConfig: { thinkingLevel: "LOW" } },
      };
      const parts: GeminiPart[] = [];
      let finish: string | undefined;
      let grounding: GroundingMetadata | undefined;
      let usage: GeminiResponse["usageMetadata"];
      let blocked = false;
      for await (const chunk of geminiStream(client, model, body, p.signal)) {
        const cand = chunk.candidates?.[0];
        const incoming = cand?.content?.parts ?? [];
        for (const part of incoming) {
          if (part.functionCall) p.onStatus(part.functionCall.name);
          else if (part.toolCall) p.onStatus("web_search");
          else if (typeof part.text === "string" && part.text && !part.thought) p.onText(part.text);
        }
        mergeParts(parts, incoming);
        if (cand?.finishReason) finish = cand.finishReason;
        if (cand?.groundingMetadata) grounding = cand.groundingMetadata;
        if (chunk.usageMetadata) usage = chunk.usageMetadata;
        if (chunk.promptFeedback?.blockReason) blocked = true;
      }
      const out = parseParts(parts, grounding);
      const totals = await record("sohbet", model, usage, out.searches, price);
      if (finish === "MALFORMED_FUNCTION_CALL" && !out.toolCalls.length && !out.text) {
        throw new Error("Gemini geçersiz bir araç çağrısı üretti. Lütfen isteği yeniden deneyin.");
      }
      return { content: out.content, toolCalls: out.toolCalls, stop: stopOf(finish, blocked, out.toolCalls.length), usage: totals };
    },

    async structured(p) {
      const { model, price } = await selected();
      const sources = new Map<string, string>();
      const contents: GeminiContent[] = [{ role: "user", parts: [{ text: p.user }] }];
      let search = p.maxSearches > 0;
      let nudged = false;
      for (let step = 0; step < 3; step++) {
        const body: Json = {
          systemInstruction: { parts: [{ text: p.system }] },
          contents: search ? contents : contents.map((c) => ({ ...c, parts: c.parts.filter((x) => !isServerToolPart(x)) })),
          tools: [...toGeminiTools([p.tool]), ...(search ? [{ googleSearch: {} }] : [])],
          toolConfig: search ? toolConfig(true) : { functionCallingConfig: { mode: "ANY", allowedFunctionNames: [p.tool.name] } },
          generationConfig: { maxOutputTokens: 16000, thinkingConfig: { thinkingLevel: "MEDIUM" } },
        };
        const res = await geminiGenerate(client, model, body);
        const cand = res.candidates?.[0];
        const parts = cand?.content?.parts ?? [];
        const out = parseParts(parts, cand?.groundingMetadata);
        p.onUsage(await record(p.kind, model, res.usageMetadata, out.searches, price));
        for (const [u, t] of out.sources) if (!sources.has(u)) sources.set(u, t);

        const stop = stopOf(cand?.finishReason, !!res.promptFeedback?.blockReason, out.toolCalls.length);
        const submit = out.toolCalls.find((t) => t.name === p.tool.name);
        if (submit && stop !== "max_tokens") return { input: submit.input, sources };
        if (stop === "refusal") throw new Error("Model bu isteği yanıtlamayı reddetti.");
        // Model sonucu araç yerine düz JSON metni olarak yazdıysa onu kullan
        const json = /\{[\s\S]*\}/.exec(out.text)?.[0];
        if (json && stop !== "max_tokens") {
          try {
            return { input: JSON.parse(json) as unknown, sources };
          } catch {
            // geçersiz JSON: hatırlatmaya geç
          }
        }
        if (nudged) break;
        // Rapor aracı çağrılmadı: bir kez hatırlat (bu kez aramasız ve aracı zorunlu kılarak).
        nudged = true;
        search = false;
        if (parts.length) contents.push({ role: "model", parts });
        contents.push({
          role: "user",
          parts: [
            ...out.toolCalls.map((t) => ({ functionResponse: { id: t.id, name: t.name, response: { hata: "Bu araç burada kullanılamaz." } } })),
            { text: `Lütfen şimdi sonucu ${p.tool.name} aracıyla gönder.` },
          ],
        });
      }
      return { input: null, sources };
    },

    async complete(p) {
      const sel = await selected();
      const model = p.cheap ? GEMINI_CHEAP_MODEL : sel.model;
      const price = p.cheap ? null : sel.price;
      const res = await geminiGenerate(client, model, {
        systemInstruction: { parts: [{ text: p.system }] },
        contents: [{ role: "user", parts: [{ text: p.user }] }],
        generationConfig: { maxOutputTokens: 4000, thinkingConfig: { thinkingLevel: "LOW" } },
      });
      const out = parseParts(res.candidates?.[0]?.content?.parts ?? [], undefined);
      const usage = await record(p.kind, model, res.usageMetadata, 0, price);
      const text = out.text.trim();
      if (!text) throw new Error("Boş yanıt");
      return { text, usage, model };
    },

    async ping() {
      const { model, price } = await selected();
      const res = await geminiGenerate(client, model, {
        contents: [{ role: "user", parts: [{ text: "Sadece \"tamam\" yaz." }] }],
        generationConfig: { maxOutputTokens: 256, thinkingConfig: { thinkingLevel: "LOW" } },
      });
      await record("test", model, res.usageMetadata, 0, price);
      return GEMINI_MODELS.find((m) => m.id === model)?.label ?? model;
    },
  };
}
