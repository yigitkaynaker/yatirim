// Yerel model (Ollama) sağlayıcısının sahte HTTP (fetch) ile testi: mesaj/araç çevirisi, NDJSON
// akışı, araç çağırma turu, düşünme (think) geri dönüşü, yapılandırılmış çıktı, 0 $ maliyet kaydı,
// paylaşılan sınırın tüketilmemesi ve Türkçe hata mesajları. Gerçek Ollama'ya bağlanmaz.
// Geçici bir veri klasörü kullanır (iki modda da çalışır).
//   npm run test:ollama
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const DIR = fs.mkdtempSync(path.join(os.tmpdir(), "yatirim-ollama-"));
if (!process.env.YATIRIM_DATA_DIR) process.env.YATIRIM_DATA_DIR = DIR;
delete process.env.VERCEL;

const { resetDatabase } = await import("./test-db");
const { getDb, closeDb } = await import("../src/lib/db");
const { enterUserForScripts } = await import("../src/lib/userContext");
const aiClient = await import("../src/lib/aiClient");
const ol = await import("../src/lib/aiOllama");
const { getProvider, testConnection } = await import("../src/lib/aiProvider");
const { runChatTurn, getDisplayMessages } = await import("../src/lib/chat");
const settings = await import("../src/lib/settings");

await resetDatabase();
enterUserForScripts(1);

let passed = 0;
async function test(name: string, fn: () => void | Promise<void>) {
  await fn();
  passed++;
  console.log(`  ✓ ${name}`);
}

// ---- Sahte HTTP ----------------------------------------------------------------------------

type Reply = { stream: unknown[] } | { json: unknown } | { status: number; body: unknown } | { fail: true };
interface Req {
  url: string;
  method: string;
  body: Record<string, unknown> & { messages?: { role: string; content: string; tool_calls?: unknown[]; tool_name?: string }[] };
}
const reqs: Req[] = [];
let script: Reply[] = [];

/** NDJSON gövdesini bilerek satır ortasından bölerek gönderir (ayrıştırıcı testi). */
function ndjsonResponse(lines: unknown[]): Response {
  const enc = new TextEncoder().encode(lines.map((l) => JSON.stringify(l)).join("\n") + "\n");
  const cut = [0, Math.floor(enc.length / 3), Math.floor(enc.length / 2) + 1, enc.length];
  return new Response(
    new ReadableStream({
      start(c) {
        for (let i = 0; i < cut.length - 1; i++) c.enqueue(enc.slice(cut[i], cut[i + 1]));
        c.close();
      },
    }),
    { headers: { "Content-Type": "application/x-ndjson" } },
  );
}

const fakeFetch: typeof fetch = async (input, init) => {
  reqs.push({ url: String(input), method: init?.method ?? "GET", body: init?.body ? JSON.parse(String(init.body)) : {} });
  const next = script.shift();
  if (!next) throw new Error("Senaryoda yanıt kalmadı");
  if ("fail" in next) throw new TypeError("fetch failed");
  if ("stream" in next) return ndjsonResponse(next.stream);
  if ("json" in next) return Response.json(next.json);
  return Response.json(next.body, { status: next.status });
};
const MODEL = "qwen3:4b-instruct";
const client = { baseUrl: "http://localhost:11434", model: MODEL, fetch: fakeFetch };
const provider = ol.ollamaProvider(client);
const reset = (r: Reply[]) => {
  reqs.length = 0;
  script = r;
};
const done = (prompt: number, out: number, reason = "stop") => ({ message: { role: "assistant", content: "" }, done: true, done_reason: reason, prompt_eval_count: prompt, eval_count: out });
const tags = { json: { models: [{ name: MODEL, size: 2_497_293_803, details: { parameter_size: "4.0B" }, capabilities: ["completion", "tools"] }, { name: "gemma3:1b", size: 815_000_000, details: { parameter_size: "1B" }, capabilities: ["completion"] }] } };

console.log("Çeviri");

await test("geçmiş: metin, tool_use → assistant.tool_calls, tool_result → tool mesajı (tool_name ile)", () => {
  const out = ol.toOllamaMessages("SİSTEM", [
    { role: "user", content: "alarmlarım?" },
    { role: "assistant", content: [{ type: "text", text: "Bakıyorum." }, { type: "tool_use", id: "t1", name: "list_alarms", input: {} }] },
    { role: "user", content: [{ type: "tool_result", tool_use_id: "t1", content: "{\"alarmlar\":[]}" }] },
    { role: "user", content: [{ type: "tool_result", tool_use_id: "t9", content: "bozuk", is_error: true }, { type: "text", text: "peki" }] },
  ]);
  assert.deepEqual(out.map((m) => m.role), ["system", "user", "assistant", "tool", "tool", "user"]);
  assert.deepEqual(out[2].tool_calls, [{ id: "t1", function: { name: "list_alarms", arguments: {} } }]);
  assert.equal(out[3].tool_name, "list_alarms");
  assert.equal(out[3].tool_call_id, "t1");
  assert.match(out[4].content, /hata/);
  const tools = ol.toOllamaTools([{ name: "x", description: "d", input_schema: { type: "object", properties: {} } }]);
  assert.deepEqual(tools[0], { type: "function", function: { name: "x", description: "d", parameters: { type: "object", properties: {} } } });
});

console.log("Sohbet");

await test("sohbet turu: akış + araç çağırma (list_alarms) + son yanıt; num_ctx, think:false; maliyet 0 $", async () => {
  reset([
    { stream: [{ message: { role: "assistant", content: "", tool_calls: [{ id: "call_1", function: { name: "list_alarms", arguments: {} } }] }, done: false }, done(12000, 20)] },
    { stream: [{ message: { content: "Hiç " }, done: false }, { message: { content: "alarmınız yok." }, done: false }, done(12100, 8)] },
  ]);
  const events: { type: string; delta?: string; text?: string; message?: string; id?: number }[] = [];
  const r = await runChatTurn({ message: "Alarmlarımı listele", emit: (e) => events.push(e as (typeof events)[number]), client: provider });
  assert.ok(!events.some((e) => e.type === "error"), JSON.stringify(events));
  assert.equal(events.filter((e) => e.type === "text").map((e) => e.delta).join(""), "Hiç alarmınız yok.");
  assert.ok(events.some((e) => e.type === "status"));
  assert.equal(reqs.length, 2);
  assert.equal(reqs[0].url, "http://localhost:11434/api/chat");
  assert.equal(reqs[0].body.think, false);
  assert.equal(reqs[0].body.stream, true);
  assert.equal((reqs[0].body.options as { num_ctx: number }).num_ctx, ol.OLLAMA_NUM_CTX);
  assert.ok(Array.isArray(reqs[0].body.tools) && (reqs[0].body.tools as unknown[]).length > 5);
  assert.match(reqs[0].body.messages![0].content, /web_search aracı YOK/);
  const toolMsg = reqs[1].body.messages!.find((m) => m.role === "tool");
  assert.equal(toolMsg?.tool_name, "list_alarms");
  const shown = await getDisplayMessages(r.conversationId!);
  assert.ok(JSON.stringify(shown).includes("Hiç alarmınız yok."));
  const rows = await (await getDb()).all<{ provider: string; model: string; cost_usd: number; input_tokens: number }>("SELECT provider, model, cost_usd, input_tokens FROM ai_usage WHERE provider = 'ollama'");
  assert.equal(rows.length, 2);
  assert.ok(rows.every((x) => x.cost_usd === 0 && x.model === MODEL));
  assert.equal(rows[0].input_tokens, 12000);
});

await test("model düşünmeyi desteklemiyorsa think olmadan bir kez daha denenir; <think> metni kaydedilmez", async () => {
  reset([
    { status: 400, body: { error: `"${MODEL}" does not support thinking` } },
    { json: { message: { role: "assistant", content: "<think>iç ses</think>Tamam." }, done: true, prompt_eval_count: 5, eval_count: 2 } },
  ]);
  const r = await provider.complete({ kind: "ozet", system: "s", user: "u", cheap: true });
  assert.equal(r.text, "Tamam.");
  assert.equal(r.usage.costUsd, 0);
  assert.equal(reqs.length, 2);
  assert.equal(reqs[0].body.think, false);
  assert.ok(!("think" in reqs[1].body));
});

await test("haber analizi: web araması yok, şema format ile istenir, JSON ayrıştırılır (bozuksa yeniden denenir)", async () => {
  assert.equal(provider.webSearch, false);
  const schema = { type: "object", properties: { market_summary: { type: "string" } }, required: ["market_summary"] };
  reset([
    { json: { message: { content: "{bozuk" }, done: true } },
    { json: { message: { content: "{\"market_summary\":\"sakin\"}" }, done: true, prompt_eval_count: 100, eval_count: 10 } },
  ]);
  let calls = 0;
  const out = await provider.structured({ kind: "haber", system: "S", user: "U", tool: { name: "submit_news_report", description: "d", input_schema: schema as never }, maxSearches: 3, onUsage: () => calls++ });
  assert.deepEqual(out.input, { market_summary: "sakin" });
  assert.equal(out.sources.size, 0);
  assert.equal(calls, 2);
  assert.deepEqual(reqs[0].body.format, schema);
  assert.equal(reqs[0].body.stream, false);
  assert.ok(!("tools" in reqs[0].body));
});

console.log("Hatalar");

await test("araç desteklemeyen model, yüklü olmayan model, bağlam taşması, ulaşılamayan sunucu: Türkçe mesaj", async () => {
  const run = async (r: Reply) => {
    reset([r]);
    return provider.chatStep({ system: "s", tools: [], maxSearches: 0, messages: [{ role: "user", content: "x" }], onText: () => {}, onStatus: () => {} }).then(
      () => "",
      (e: unknown) => aiClient.aiErrorMessage(e),
    );
  };
  assert.match(await run({ status: 400, body: { error: "registry.ollama.ai/library/gemma3:1b does not support tools" } }), /araç çağırmayı \(tools\) desteklemiyor/);
  assert.match(await run({ status: 404, body: { error: `model "${MODEL}" not found, try pulling it first` } }), /yüklü değil.*ollama pull/);
  assert.match(await run({ status: 400, body: { error: "request (20000 tokens) exceeds the available context size (16384 tokens)" } }), /bağlam/);
  assert.match(await run({ fail: true }), /bağlanılamadı.*Ollama/);
  assert.match(await run({ stream: [{ error: "out of memory" }] }), /bellek yetmedi/);
});

console.log("Ayarlar ve bağlantı");

await test("model listesi (/api/tags) ve bağlantı testi; araç desteği olmayan modelde uyarı", async () => {
  reset([tags]);
  const list = await ol.listOllamaModels(client);
  assert.deepEqual(list[0], { name: MODEL, sizeGb: 2.5, parameterSize: "4.0B", tools: true });
  assert.equal(list[1].tools, false);
  reset([tags, { json: { message: { content: "tamam" }, done: true } }]);
  assert.match(await provider.ping(), /qwen3:4b-instruct \(bilgisayarınızda, ücretsiz\)$/);
  const weak = ol.ollamaProvider({ ...client, model: "gemma3:1b" });
  reset([tags, { json: { message: { content: "tamam" }, done: true } }]);
  assert.match(await weak.ping(), /araç çağırmayı desteklemiyor/);
  reset([tags]);
  await assert.rejects(() => ol.ollamaProvider({ ...client, model: "yok:1b" }).ping(), /yüklü değil/);
});

await test("Ayarlar'dan seçilen yerel model: adres ve model kullanılır, testConnection çalışır, paylaşılan sınır tüketilmez", async () => {
  await settings.updateAiSettings({ provider: "ollama", ollamaUrl: "http://127.0.0.1:11434", ollamaModel: MODEL });
  aiClient.setOllamaFetchOverride(fakeFetch);
  try {
    assert.equal(await aiClient.isAiConfigured(), true);
    const p = await getProvider();
    assert.equal(p.id, "ollama");
    reset([tags, { json: { message: { content: "tamam" }, done: true } }]);
    const t = await testConnection();
    assert.equal(t.ok, true, t.message);
    assert.match(t.message, /Yerel model \(Ollama\) bağlantısı başarılı/);
    assert.equal(reqs[0].url, "http://127.0.0.1:11434/api/tags");
    reset([{ fail: true }]);
    const bad = await testConnection();
    assert.equal(bad.ok, false);
    assert.match(bad.message, /127\.0\.0\.1:11434/);
  } finally {
    aiClient.setOllamaFetchOverride(null);
    await settings.updateAiSettings({ provider: "anthropic" });
  }
});

await closeDb();
fs.rmSync(DIR, { recursive: true, force: true });
console.log(`\n${passed} test geçti.`);
