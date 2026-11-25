import "server-only";
import type {
  Response as OaResponse,
  ResponseCreateParamsNonStreaming,
  ResponseCreateParamsStreaming,
  ResponseInputItem,
  ResponseStreamEvent,
  Tool as OaTool,
} from "openai/resources/responses/responses";
import { recordUsageTotals, type OpenAiClient, type UsageKind, type UsageTotals } from "./aiClient";
import { getAiSettings, knownPrice, OPENAI_CHEAP_MODEL, OPENAI_MODELS, type ModelPrice } from "./settings";
import type { AiProvider, CanonBlock, CanonMessage, ChatStepResult, ToolCall, ToolDef } from "./aiProvider";

// OPENAI SAĞLAYICISI (Responses API). Aynı araç tanımları (ToolDef) düz "function" araçlarına,
// Claude biçimindeki sohbet geçmişi Responses girdi öğelerine çevrilir. Web araması yerleşik
// "web_search" aracıyla yapılır ve max_tool_calls ile sınırlanır; haber raporu yapılandırılmış
// çıktıyla (text.format json_schema, strict) alınır. İstekler saklanmaz (store: false).

type Json = Record<string, unknown>;

// ---- Şema ve araç çevirisi ------------------------------------------------------------

/**
 * JSON şemasını strict moda çevirir: her nesnede additionalProperties: false ve tüm alanlar
 * required; isteğe bağlı alanlar null alabilir (tip + enum'a null eklenir). Sınır anahtar
 * kelimeleri (minimum/maximum) atılır; doğrulama uygulama tarafında yapılır.
 */
export function strictSchema(schema: unknown): Json {
  const conv = (s: Json, optional: boolean): Json => {
    const out: Json = { ...s };
    delete out.minimum;
    delete out.maximum;
    if (out.type === "object") {
      const props = (out.properties ?? {}) as Record<string, Json>;
      const req = new Set((out.required as string[] | undefined) ?? []);
      out.properties = Object.fromEntries(Object.entries(props).map(([k, v]) => [k, conv(v, !req.has(k))]));
      out.required = Object.keys(props);
      out.additionalProperties = false;
    } else if (out.type === "array" && out.items && typeof out.items === "object") {
      out.items = conv(out.items as Json, false);
    }
    if (optional && out.type) {
      out.type = Array.isArray(out.type) ? [...new Set([...out.type, "null"])] : [out.type, "null"];
      if (Array.isArray(out.enum)) out.enum = [...out.enum, null];
    }
    return out;
  };
  return conv(schema as Json, false);
}

/** Strict modda isteğe bağlı alanlar null gelir: araçlara "verilmedi" olarak geçsin. */
export function dropNulls(v: unknown): unknown {
  if (Array.isArray(v)) return v.map(dropNulls);
  if (v && typeof v === "object") {
    return Object.fromEntries(
      Object.entries(v as Json)
        .filter(([, x]) => x !== null)
        .map(([k, x]) => [k, dropNulls(x)]),
    );
  }
  return v;
}

export function toOpenAiTools(tools: ToolDef[]): OaTool[] {
  return tools.map((t) => ({
    type: "function" as const,
    name: t.name,
    description: t.description ?? null,
    parameters: strictSchema(t.input_schema),
    strict: true,
  }));
}

/** Saklanan (Claude biçimi) sohbet geçmişi → Responses girdi öğeleri. Sunucu aracı blokları atlanır. */
export function toOpenAiInput(messages: CanonMessage[]): ResponseInputItem[] {
  const out: ResponseInputItem[] = [];
  for (const m of messages) {
    if (typeof m.content === "string") {
      if (m.content.trim()) out.push({ role: m.role, content: m.content });
      continue;
    }
    let text = "";
    const flush = () => {
      if (text.trim()) out.push({ role: m.role, content: text });
      text = "";
    };
    for (const b of m.content) {
      if (b.type === "text") text += b.text;
      else if (b.type === "tool_use") {
        flush();
        out.push({ type: "function_call", call_id: b.id, name: b.name, arguments: JSON.stringify(b.input ?? {}) });
      } else if (b.type === "tool_result") {
        flush();
        const c = b.content;
        const output = typeof c === "string" ? c : Array.isArray(c) ? c.map((x) => (x.type === "text" ? x.text : "")).join("") : "";
        out.push({ type: "function_call_output", call_id: b.tool_use_id, output: b.is_error ? JSON.stringify({ hata: output }) : output });
      }
    }
    flush();
  }
  return out;
}

// ---- Yanıt çözümleme ---------------------------------------------------------------------

interface Parsed {
  content: CanonBlock[];
  toolCalls: ToolCall[];
  text: string;
  refusal: boolean;
  searches: number;
  sources: Map<string, string>;
}

export function parseOutput(res: OaResponse): Parsed {
  const content: CanonBlock[] = [];
  const toolCalls: ToolCall[] = [];
  const sources = new Map<string, string>();
  let text = "";
  let refusal = false;
  let searches = 0;
  for (const item of res.output ?? []) {
    if (item.type === "message") {
      for (const part of item.content) {
        if (part.type === "output_text") {
          const cits = (part.annotations ?? [])
            .filter((a) => a.type === "url_citation")
            .map((a) => ({ type: "url_citation", url: a.url, title: a.title || a.url }));
          for (const c of cits) if (!sources.has(c.url)) sources.set(c.url, c.title);
          content.push({ type: "text", text: part.text, citations: cits.length ? cits : null } as unknown as CanonBlock);
          text += part.text;
        } else if (part.type === "refusal") {
          refusal = true;
          content.push({ type: "text", text: part.refusal, citations: null } as unknown as CanonBlock);
          text += part.refusal;
        }
      }
    } else if (item.type === "function_call") {
      let input: unknown = {};
      try {
        input = dropNulls(JSON.parse(item.arguments || "{}"));
      } catch {
        input = {};
      }
      content.push({ type: "tool_use", id: item.call_id, name: item.name, input } as unknown as CanonBlock);
      toolCalls.push({ id: item.call_id, name: item.name, input });
    } else if (item.type === "web_search_call") {
      const action = item.action as { type?: string; sources?: { url: string }[]; url?: string | null } | undefined;
      if (!action || action.type === "search") searches++;
      for (const s of action?.sources ?? []) if (s.url && !sources.has(s.url)) sources.set(s.url, s.url);
    }
  }
  return { content, toolCalls, text, refusal, searches, sources };
}

const supportsReasoning = (model: string) => /^(gpt-5|gpt-6|o\d)/i.test(model);

function usageOf(res: OaResponse, searches: number): Omit<UsageTotals, "costUsd"> {
  const u = res.usage;
  const cached = u?.input_tokens_details?.cached_tokens ?? 0;
  return {
    inputTokens: Math.max(0, (u?.input_tokens ?? 0) - cached),
    outputTokens: u?.output_tokens ?? 0,
    cacheReadTokens: cached,
    cacheWriteTokens: 0,
    webSearches: searches,
  };
}

// ---- Sağlayıcı -------------------------------------------------------------------------

export function openAiProvider(client: OpenAiClient): AiProvider {
  /** Seçili model ve (listede yoksa) elle girilen fiyatı */
  async function selected(): Promise<{ model: string; price: ModelPrice | null }> {
    const s = await getAiSettings();
    return { model: s.openaiModel, price: knownPrice(s.openaiModel) ? null : s.openaiPrice };
  }
  const record = (kind: UsageKind, model: string, res: OaResponse, searches: number, price: ModelPrice | null) =>
    recordUsageTotals(kind, "openai", model, usageOf(res, searches), price);
  const webTools = (maxSearches: number): Partial<ResponseCreateParamsNonStreaming> =>
    maxSearches > 0 ? { max_tool_calls: maxSearches, include: ["web_search_call.action.sources"] } : {};

  return {
    id: "openai",
    label: "OpenAI",
    model: async () => (await selected()).model,

    async chatStep(p): Promise<ChatStepResult> {
      const { model, price } = await selected();
      const params: ResponseCreateParamsStreaming = {
        model,
        instructions: p.system,
        input: toOpenAiInput(p.messages),
        tools: [...toOpenAiTools(p.tools), ...(p.maxSearches > 0 ? [{ type: "web_search" as const }] : [])],
        ...webTools(p.maxSearches),
        max_output_tokens: 8000,
        store: false,
        ...(supportsReasoning(model) ? { reasoning: { effort: "low" as const } } : {}),
        stream: true,
      };
      const stream = (await client.responses.create(params, { signal: p.signal })) as AsyncIterable<ResponseStreamEvent>;
      let final: OaResponse | null = null;
      for await (const ev of stream) {
        if (ev.type === "response.output_text.delta") p.onText(ev.delta);
        else if (ev.type === "response.output_item.added") {
          if (ev.item.type === "function_call") p.onStatus(ev.item.name);
          else if (ev.item.type === "web_search_call") p.onStatus("web_search");
        } else if (ev.type === "response.completed" || ev.type === "response.incomplete") final = ev.response;
        else if (ev.type === "response.failed") throw new Error(ev.response.error?.message ?? "OpenAI yanıtı başarısız oldu.");
        else if (ev.type === "error") throw new Error(ev.message ?? "OpenAI akış hatası.");
      }
      if (!final) throw new Error("OpenAI yanıtı tamamlanmadı.");
      const out = parseOutput(final);
      const usage = await record("sohbet", model, final, out.searches, price);
      const reason = final.incomplete_details?.reason;
      const stop: ChatStepResult["stop"] =
        out.refusal || reason === "content_filter"
          ? "refusal"
          : final.status === "incomplete" && reason === "max_output_tokens"
            ? "max_tokens"
            : out.toolCalls.length
              ? "tool_use"
              : "end";
      return { content: out.content, toolCalls: out.toolCalls, stop, usage };
    },

    async structured(p) {
      const { model, price } = await selected();
      const sources = new Map<string, string>();
      const system = `${p.system}\n\nNot: Bu ortamda ${p.tool.name} bir araç değildir. Sonucu doğrudan istenen JSON şemasına uyan tek bir JSON nesnesi olarak yaz.`;
      let searchesLeft = p.maxSearches;
      for (let attempt = 0; attempt < 2; attempt++) {
        const res = await client.responses.create({
          model,
          instructions: system,
          input: [{ role: "user", content: p.user }],
          ...(searchesLeft > 0 ? { tools: [{ type: "web_search" as const }], ...webTools(searchesLeft) } : {}),
          text: { format: { type: "json_schema", name: p.tool.name, description: p.tool.description, schema: strictSchema(p.tool.input_schema), strict: true } },
          max_output_tokens: 16000,
          store: false,
          ...(supportsReasoning(model) ? { reasoning: { effort: "medium" as const } } : {}),
        });
        const out = parseOutput(res);
        p.onUsage(await record(p.kind, model, res, out.searches, price));
        searchesLeft = Math.max(0, searchesLeft - out.searches);
        for (const [u, t] of out.sources) if (!sources.has(u)) sources.set(u, t);
        if (out.refusal) throw new Error("Model bu isteği yanıtlamayı reddetti.");
        if (res.status === "incomplete" && res.incomplete_details?.reason !== "max_output_tokens") break;
        try {
          return { input: dropNulls(JSON.parse(out.text)), sources };
        } catch {
          // Geçersiz / yarım JSON: bir kez daha dene.
        }
      }
      return { input: null, sources };
    },

    async complete(p) {
      const sel = await selected();
      const model = p.cheap ? OPENAI_CHEAP_MODEL : sel.model;
      const price = p.cheap ? null : sel.price;
      const res = await client.responses.create({
        model,
        instructions: p.system,
        input: [{ role: "user", content: p.user }],
        max_output_tokens: 4000,
        store: false,
        ...(supportsReasoning(model) ? { reasoning: { effort: "low" as const } } : {}),
      });
      const out = parseOutput(res);
      const usage = await record(p.kind, model, res, 0, price);
      const text = out.text.trim();
      if (!text) throw new Error("Boş yanıt");
      return { text, usage, model };
    },

    async ping() {
      const { model, price } = await selected();
      const res = await client.responses.create({
        model,
        input: [{ role: "user", content: "Sadece \"tamam\" yaz." }],
        max_output_tokens: 256,
        store: false,
        ...(supportsReasoning(model) ? { reasoning: { effort: "low" as const } } : {}),
      });
      await record("test", model, res, 0, price);
      return OPENAI_MODELS.find((m) => m.id === model)?.label ?? model;
    },
  };
}
