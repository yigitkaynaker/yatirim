import "server-only";
import type Anthropic from "@anthropic-ai/sdk";
import { addUsage, currentModel, emptyUsage, recordUsage, type AiClient } from "./aiClient";
import { AI_MODELS } from "./settings";
import type { AiProvider, CanonMessage, ChatStepResult } from "./aiProvider";

// CLAUDE SAĞLAYICISI (Anthropic Messages API). Davranış, sağlayıcı arayüzünden önceki
// sohbet / haber / özet koduyla aynıdır.

const CHEAP_MODEL = AI_MODELS.ekonomik.id;

/**
 * OpenAI / Gemini'den gelen (url_citation) alıntılar Claude'a geri gönderilemez: metin bloğu
 * sadeleştirilir. Gemini'nin ek alanları (gemini_parts, gemini_signature) atılır.
 */
function sanitize(messages: CanonMessage[]): Anthropic.MessageParam[] {
  return messages.map((m) => {
    if (typeof m.content === "string") return m;
    return {
      ...m,
      content: m.content.map((b) => {
        const cits = (b as { citations?: { type: string }[] | null }).citations;
        if (b.type === "text" && Array.isArray(cits) && cits.some((c) => c.type === "url_citation")) return { type: "text" as const, text: b.text };
        if ("gemini_parts" in b || "gemini_signature" in b) {
          const rest: Record<string, unknown> = { ...b };
          delete rest.gemini_parts;
          delete rest.gemini_signature;
          return rest;
        }
        return b;
      }),
    } as Anthropic.MessageParam;
  });
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

export function anthropicProvider(client: AiClient): AiProvider {
  return {
    id: "anthropic",
    label: "Claude",
    model: async () => (await currentModel()).id,

    async chatStep(p): Promise<ChatStepResult> {
      const model = (await currentModel()).id;
      const tools: Anthropic.ToolUnion[] = [
        ...p.tools,
        ...(p.maxSearches > 0 ? [{ type: "web_search_20250305" as const, name: "web_search" as const, max_uses: p.maxSearches }] : []),
      ];
      const stream = client.messages.stream(
        {
          model,
          max_tokens: 8000,
          system: p.system,
          tools,
          messages: sanitize(p.messages),
          output_config: { effort: "medium" },
          cache_control: { type: "ephemeral" },
        },
        { signal: p.signal },
      );
      for await (const event of stream) {
        if (event.type === "content_block_delta" && event.delta.type === "text_delta") p.onText(event.delta.text);
        else if (event.type === "content_block_start") {
          const b = event.content_block;
          if (b.type === "server_tool_use" || b.type === "tool_use") p.onStatus(b.name);
        }
      }
      const msg = await stream.finalMessage();
      const usage = await recordUsage("sohbet", model, msg.usage);
      const toolCalls = msg.content
        .filter((b): b is Anthropic.ToolUseBlock => b.type === "tool_use")
        .map((t) => ({ id: t.id, name: t.name, input: t.input }));
      const stop: ChatStepResult["stop"] =
        msg.stop_reason === "pause_turn"
          ? "pause"
          : msg.stop_reason === "refusal"
            ? "refusal"
            : msg.stop_reason === "max_tokens"
              ? "max_tokens"
              : toolCalls.length
                ? "tool_use"
                : "end";
      return { content: msg.content, toolCalls, stop, usage };
    },

    async structured(p) {
      const model = (await currentModel()).id;
      const sources = new Map<string, string>();
      const tools: Anthropic.ToolUnion[] =
        p.maxSearches > 0 ? [{ type: "web_search_20250305", name: "web_search", max_uses: p.maxSearches }, p.tool] : [p.tool];
      const messages: Anthropic.MessageParam[] = [{ role: "user", content: p.user }];
      let nudged = false;
      for (let step = 0; step < 6; step++) {
        const msg = await client.messages
          .stream({ model, max_tokens: 16000, system: p.system, tools, messages, output_config: { effort: "medium" } })
          .finalMessage();
        p.onUsage(await recordUsage(p.kind, model, msg.usage));
        collectSources(msg.content, sources);

        const submit = msg.content.find((b): b is Anthropic.ToolUseBlock => b.type === "tool_use" && b.name === p.tool.name);
        if (submit && msg.stop_reason !== "max_tokens") return { input: submit.input, sources };
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
            { type: "text" as const, text: `Lütfen şimdi sonucu ${p.tool.name} aracıyla gönder.` },
          ],
        });
      }
      return { input: null, sources };
    },

    async complete(p) {
      const model = p.cheap ? CHEAP_MODEL : (await currentModel()).id;
      const msg = await client.messages
        .stream({ model, max_tokens: 900, system: p.system, messages: [{ role: "user", content: p.user }], output_config: { effort: "low" } })
        .finalMessage();
      const usage = await recordUsage(p.kind, model, msg.usage);
      const text = msg.content
        .filter((b): b is Anthropic.TextBlock => b.type === "text")
        .map((b) => b.text)
        .join("")
        .trim();
      if (!text) throw new Error("Boş yanıt");
      return { text, usage: addUsage(emptyUsage(), usage), model };
    },

    async ping() {
      const model = await currentModel();
      const res = await client.messages.create({
        model: model.id,
        max_tokens: 64,
        output_config: { effort: "low" },
        messages: [{ role: "user", content: "Sadece \"tamam\" yaz." }],
      });
      await recordUsage("test", model.id, res.usage);
      return AI_MODELS[model.key].label;
    },
  };
}
