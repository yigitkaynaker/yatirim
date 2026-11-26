import "server-only";
import { OllamaError, recordUsageTotals, type OllamaClient, type UsageKind, type UsageTotals } from "./aiClient";
import { ZERO_PRICE } from "./settings";
import type { AiProvider, CanonBlock, CanonMessage, ChatStepResult, ToolCall, ToolDef } from "./aiProvider";

// YEREL MODEL SAĞLAYICISI (Ollama, bilgisayardaki sunucu). Ollama'nın kendi REST API'si (/api/chat)
// kullanılır: OpenAI uyumlu uç nokta (/v1/chat/completions) bağlam uzunluğunu (num_ctx) ayarlatmıyor
// ve varsayılan 4096 token araç tanımlarına bile yetmiyor. Aynı araç tanımları (ToolDef) Ollama
// "function" araçlarına, Claude biçimindeki sohbet geçmişi Ollama mesajlarına çevrilir. Web araması
// yoktur; maliyet 0 kaydedilir; paylaşılan günlük sınırdan düşmez.

type Json = Record<string, unknown>;

/** Bağlam uzunluğu (token): sistem istemi + araç tanımları ~12 bin token tutar. */
export const OLLAMA_NUM_CTX = 16384;
/** Tek isteğin en uzun süresi (yerel model yavaş olabilir; ilk yükleme dahil) */
const TIMEOUT_MS = 10 * 60_000;

export interface OllamaMessage {
  role: "system" | "user" | "assistant" | "tool";
  content: string;
  tool_calls?: { id?: string; function: { name: string; arguments: Json } }[];
  tool_name?: string;
  tool_call_id?: string;
}

interface OllamaChunk {
  message?: { role?: string; content?: string; thinking?: string; tool_calls?: { id?: string; function?: { name?: string; arguments?: unknown } }[] };
  done?: boolean;
  done_reason?: string;
  prompt_eval_count?: number;
  eval_count?: number;
  error?: string;
}

// ---- Çeviri ------------------------------------------------------------------------------

export function toOllamaTools(tools: ToolDef[]): Json[] {
  return tools.map((t) => ({ type: "function", function: { name: t.name, description: t.description ?? "", parameters: t.input_schema } }));
}

/** Saklanan (Claude biçimi) sohbet geçmişi → Ollama mesajları. Sunucu aracı blokları atlanır. */
export function toOllamaMessages(system: string, messages: CanonMessage[]): OllamaMessage[] {
  const out: OllamaMessage[] = system ? [{ role: "system", content: system }] : [];
  const toolNames = new Map<string, string>();
  for (const m of messages) {
    if (typeof m.content === "string") {
      if (m.content.trim()) out.push({ role: m.role, content: m.content });
      continue;
    }
    let text = "";
    const calls: NonNullable<OllamaMessage["tool_calls"]> = [];
    const results: OllamaMessage[] = [];
    for (const b of m.content) {
      if (b.type === "text") text += b.text;
      else if (b.type === "tool_use") {
        toolNames.set(b.id, b.name);
        calls.push({ id: b.id, function: { name: b.name, arguments: (b.input ?? {}) as Json } });
      } else if (b.type === "tool_result") {
        const c = b.content;
        const output = typeof c === "string" ? c : Array.isArray(c) ? c.map((x) => (x.type === "text" ? x.text : "")).join("") : "";
        results.push({ role: "tool", content: b.is_error ? JSON.stringify({ hata: output }) : output, tool_name: toolNames.get(b.tool_use_id) ?? "", tool_call_id: b.tool_use_id });
      }
    }
    if (m.role === "assistant") {
      if (text.trim() || calls.length) out.push({ role: "assistant", content: text, ...(calls.length ? { tool_calls: calls } : {}) });
    } else {
      out.push(...results);
      if (text.trim()) out.push({ role: "user", content: text });
    }
  }
  return out;
}

/** Bazı modeller düşünce metnini <think>…</think> içinde yazar: kayda geçmesin. */
const stripThink = (s: string) => s.replace(/<think>[\s\S]*?<\/think>\s*/g, "");

function parseArgs(v: unknown): unknown {
  if (v && typeof v === "object") return v;
  if (typeof v === "string") {
    try {
      return JSON.parse(v || "{}");
    } catch {
      return {};
    }
  }
  return {};
}

// ---- HTTP --------------------------------------------------------------------------------

/** Ollama hata metni → Türkçe mesaj */
export function ollamaErrorMessage(status: number, msg: string, model: string): string {
  if (/does not support tools/i.test(msg)) {
    return `"${model}" modeli araç çağırmayı (tools) desteklemiyor; sohbetteki portföy işlemleri bu modelle yapılamaz. Ayarlar › Yerel model bölümünden araç destekli bir model seçin (ör. qwen3:4b-instruct).`;
  }
  if (status === 404 || /model .*not found|not found, try pulling/i.test(msg)) {
    return `"${model}" modeli Ollama'da yüklü değil. Komut isteminde "ollama pull ${model}" çalıştırın ya da Ayarlar'dan yüklü bir model seçin.`;
  }
  if (/exceeds the available context|context length|context size/i.test(msg)) {
    return "Sohbet yerel modelin bağlam (hafıza) sınırını aştı. Yeni bir sohbet başlatın.";
  }
  if (/out of memory|requires more system memory|cudaMalloc|unable to allocate/i.test(msg)) {
    return "Yerel model için bellek yetmedi. Daha küçük bir model seçin ya da açık programları kapatıp tekrar deneyin.";
  }
  return `Yerel model hatası (${status || "?"}): ${msg || "bilinmeyen hata"}`;
}

const unreachable = (baseUrl: string) =>
  new OllamaError(`Yerel modele (Ollama, ${baseUrl}) bağlanılamadı. Ollama uygulamasının açık olduğundan emin olun (Başlat menüsünden "Ollama"yı açın ya da komut isteminde "ollama serve" çalıştırın).`);

async function post(c: OllamaClient, path: string, body: Json, signal?: AbortSignal): Promise<Response> {
  const timeout = AbortSignal.timeout(TIMEOUT_MS);
  let res: Response;
  try {
    res = await c.fetch(`${c.baseUrl}${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: signal ? AbortSignal.any([signal, timeout]) : timeout,
    });
  } catch (err) {
    if (signal?.aborted) throw err;
    if (timeout.aborted) throw new OllamaError("Yerel model zaman aşımına uğradı (10 dakika). Daha kısa bir istek deneyin ya da daha küçük bir model seçin.");
    throw unreachable(c.baseUrl);
  }
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    let msg = text;
    try {
      msg = (JSON.parse(text) as { error?: string }).error ?? text;
    } catch {
      // düz metin
    }
    throw Object.assign(new OllamaError(ollamaErrorMessage(res.status, msg, String(body.model))), { raw: msg });
  }
  return res;
}

/**
 * /api/chat isteği. Düşünme (think) kapalı istenir; model bunu desteklemiyorsa ("does not support
 * thinking") düşünme alanı olmadan bir kez daha denenir.
 */
async function chat(c: OllamaClient, body: Json, signal?: AbortSignal): Promise<Response> {
  try {
    return await post(c, "/api/chat", { ...body, think: false }, signal);
  } catch (err) {
    if (err instanceof OllamaError && /think/i.test(String((err as { raw?: string }).raw ?? ""))) return post(c, "/api/chat", body, signal);
    throw err;
  }
}

/** NDJSON akışını satır satır okur. */
async function* ndjson(res: Response): AsyncGenerator<OllamaChunk> {
  if (!res.body) return;
  const reader = res.body.getReader();
  const dec = new TextDecoder();
  let buf = "";
  for (;;) {
    const { value, done } = await reader.read();
    if (value) buf += dec.decode(value, { stream: !done });
    let nl: number;
    while ((nl = buf.indexOf("\n")) >= 0) {
      const line = buf.slice(0, nl).trim();
      buf = buf.slice(nl + 1);
      if (line) yield JSON.parse(line) as OllamaChunk;
    }
    if (done) break;
  }
  if (buf.trim()) yield JSON.parse(buf) as OllamaChunk;
}

/** Yüklü modeller (GET /api/tags). Ulaşılamazsa OllamaError. */
export async function listOllamaModels(c: Pick<OllamaClient, "baseUrl" | "fetch">): Promise<{ name: string; sizeGb: number; parameterSize: string | null; tools: boolean | null }[]> {
  let res: Response;
  try {
    res = await c.fetch(`${c.baseUrl}/api/tags`, { signal: AbortSignal.timeout(5000) });
  } catch {
    throw unreachable(c.baseUrl);
  }
  if (!res.ok) throw new OllamaError(`Ollama model listesi alınamadı (${res.status}).`);
  const j = (await res.json().catch(() => ({}))) as { models?: { name?: string; size?: number; details?: { parameter_size?: string }; capabilities?: string[] }[] };
  return (j.models ?? [])
    .filter((m) => typeof m.name === "string")
    .map((m) => ({
      name: m.name!,
      sizeGb: Math.round(((m.size ?? 0) / 1e9) * 10) / 10,
      parameterSize: m.details?.parameter_size ?? null,
      tools: Array.isArray(m.capabilities) ? m.capabilities.includes("tools") : null,
    }));
}

// ---- Sağlayıcı -------------------------------------------------------------------------

export function ollamaProvider(client: OllamaClient): AiProvider {
  const model = client.model;
  const record = (kind: UsageKind, last: OllamaChunk | null): Promise<UsageTotals> =>
    recordUsageTotals(
      kind,
      "ollama",
      model,
      { inputTokens: last?.prompt_eval_count ?? 0, outputTokens: last?.eval_count ?? 0, cacheReadTokens: 0, cacheWriteTokens: 0, webSearches: 0 },
      ZERO_PRICE,
    );
  const options = (numPredict: number) => ({ num_ctx: OLLAMA_NUM_CTX, num_predict: numPredict });

  async function once(kind: UsageKind, system: string, user: string, numPredict: number, format?: Json) {
    const res = await chat(client, {
      model,
      messages: toOllamaMessages(system, [{ role: "user", content: user }]),
      stream: false,
      options: options(numPredict),
      ...(format ? { format } : {}),
    });
    const j = (await res.json()) as OllamaChunk;
    if (j.error) throw new OllamaError(ollamaErrorMessage(0, j.error, model));
    const usage = await record(kind, j);
    return { text: stripThink(j.message?.content ?? "").trim(), usage, last: j };
  }

  return {
    id: "ollama",
    label: "Yerel model (Ollama)",
    webSearch: false,
    model: async () => model,

    async chatStep(p): Promise<ChatStepResult> {
      const res = await chat(
        client,
        {
          model,
          messages: toOllamaMessages(p.system, p.messages),
          ...(p.tools.length ? { tools: toOllamaTools(p.tools) } : {}),
          stream: true,
          options: options(4000),
        },
        p.signal,
      );
      let text = "";
      let last: OllamaChunk | null = null;
      const toolCalls: ToolCall[] = [];
      for await (const ch of ndjson(res)) {
        if (ch.error) throw new OllamaError(ollamaErrorMessage(0, ch.error, model));
        const delta = ch.message?.content ?? "";
        if (delta) {
          text += delta;
          p.onText(delta);
        }
        for (const tc of ch.message?.tool_calls ?? []) {
          const name = tc.function?.name ?? "";
          if (!name) continue;
          const id = tc.id || `ollama_${Date.now().toString(36)}_${toolCalls.length}`;
          toolCalls.push({ id, name, input: parseArgs(tc.function?.arguments) });
          p.onStatus(name);
        }
        if (ch.done) last = ch;
      }
      const usage = await record("sohbet", last);
      const clean = stripThink(text);
      const content: CanonBlock[] = [];
      if (clean.trim()) content.push({ type: "text", text: clean, citations: null } as unknown as CanonBlock);
      for (const t of toolCalls) content.push({ type: "tool_use", id: t.id, name: t.name, input: t.input } as unknown as CanonBlock);
      const stop: ChatStepResult["stop"] = last?.done_reason === "length" && toolCalls.length === 0 ? "max_tokens" : toolCalls.length ? "tool_use" : "end";
      return { content, toolCalls, stop, usage };
    },

    async structured(p) {
      // Web araması yok: yalnızca istemdeki ücretsiz başlıklar ve KAP bildirimleri kullanılır.
      const system = `${p.system}\n\nNot: Bu ortamda ${p.tool.name} bir araç değildir ve web araması yoktur. Sonucu doğrudan istenen JSON şemasına uyan tek bir JSON nesnesi olarak yaz.`;
      for (let attempt = 0; attempt < 2; attempt++) {
        const r = await once(p.kind, system, p.user, 8000, p.tool.input_schema as unknown as Json);
        p.onUsage(r.usage);
        try {
          return { input: JSON.parse(r.text), sources: new Map() };
        } catch {
          // Geçersiz / yarım JSON: bir kez daha dene.
        }
      }
      return { input: null, sources: new Map() };
    },

    async complete(p) {
      const r = await once(p.kind, p.system, p.user, 2000);
      if (!r.text) throw new Error("Boş yanıt");
      return { text: r.text, usage: r.usage, model };
    },

    async ping() {
      const info = (await listOllamaModels(client)).find((m) => m.name === model || m.name === `${model}:latest`);
      if (!info) throw new OllamaError(ollamaErrorMessage(404, "", model));
      await once("test", "", "Sadece \"tamam\" yaz.", 16);
      const warn = info.tools === false ? " — uyarı: bu model araç çağırmayı desteklemiyor, sohbette portföy işlemleri yapılamaz" : "";
      return `${model} (bilgisayarınızda, ücretsiz)${warn}`;
    },
  };
}
