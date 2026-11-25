// Gemini sağlayıcısının sahte HTTP (fetch) ile testi: istek/yanıt dönüştürme (araç çağırma, düşünce
// imzaları, Google Search grounding), SSE akışı, maliyet kaydı, hata mesajları ve anahtar biçimi.
// Gerçek API çağrısı YAPMAZ; ağ kullanmaz. Geçici bir veri klasörü kullanır (iki modda da çalışır).
//   npm run test:gemini
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { AiClient, UsageTotals } from "../src/lib/aiClient";
import type { GeminiPart } from "../src/lib/aiGemini";

const DIR = fs.mkdtempSync(path.join(os.tmpdir(), "yatirim-gemini-"));
if (!process.env.YATIRIM_DATA_DIR) process.env.YATIRIM_DATA_DIR = DIR;
delete process.env.GEMINI_API_KEY;

const { resetDatabase } = await import("./test-db");
const { getDb, closeDb } = await import("../src/lib/db");
const { enterUserForScripts } = await import("../src/lib/userContext");
const aiClient = await import("../src/lib/aiClient");
const gem = await import("../src/lib/aiGemini");
const { getProvider, testConnection } = await import("../src/lib/aiProvider");
const { anthropicProvider } = await import("../src/lib/aiAnthropic");
const { runChatTurn, getDisplayMessages } = await import("../src/lib/chat");
const { CHAT_TOOLS } = await import("../src/lib/chatTools");
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

type Reply = { sse: unknown[] } | { json: unknown } | { status: number; body: unknown };
interface Req {
  url: string;
  headers: Record<string, string>;
  body: Record<string, unknown> & { contents: { role: string; parts: Record<string, unknown>[] }[] };
}
const reqs: Req[] = [];
let script: Reply[] = [];

/** SSE gövdesini bilerek parça sınırlarının ortasından bölerek gönderir (ayrıştırıcı testi). */
function sseResponse(events: unknown[]): Response {
  const text = events.map((e) => `data: ${JSON.stringify(e)}\r\n\r\n`).join("");
  const enc = new TextEncoder().encode(text);
  const cut = [0, Math.floor(enc.length / 3), Math.floor(enc.length / 2) + 1, enc.length];
  return new Response(
    new ReadableStream({
      start(c) {
        for (let i = 0; i < cut.length - 1; i++) c.enqueue(enc.slice(cut[i], cut[i + 1]));
        c.close();
      },
    }),
    { headers: { "Content-Type": "text/event-stream" } },
  );
}

const fakeFetch: typeof fetch = async (input, init) => {
  const headers = Object.fromEntries(Object.entries((init?.headers ?? {}) as Record<string, string>).map(([k, v]) => [k.toLowerCase(), v]));
  reqs.push({ url: String(input), headers, body: JSON.parse(String(init?.body)) });
  const next = script.shift();
  if (!next) throw new Error("Senaryoda yanıt kalmadı");
  if ("sse" in next) return sseResponse(next.sse);
  if ("json" in next) return Response.json(next.json);
  return Response.json(next.body, { status: next.status });
};
const client = { apiKey: "AIzaSySahteAnahtarTestIcin0123456789abc", fetch: fakeFetch };
const provider = gem.geminiProvider(client);

const usage = (prompt: number, out: number, thoughts = 0, cached = 0) => ({
  promptTokenCount: prompt,
  candidatesTokenCount: out,
  thoughtsTokenCount: thoughts,
  cachedContentTokenCount: cached,
  totalTokenCount: prompt + out + thoughts,
});
const db = await getDb();
const lastUsage = async () =>
  (await db.get("SELECT * FROM ai_usage ORDER BY id DESC LIMIT 1")) as {
    provider: string;
    model: string;
    kind: string;
    input_tokens: number;
    output_tokens: number;
    cache_read_tokens: number;
    web_searches: number;
    cost_usd: number;
  };
const close = (a: number, b: number) => assert.ok(Math.abs(a - b) < 1e-9, `${a} ≈ ${b}`);

// ---- 1) Ayarlar ve anahtar biçimi ----------------------------------------------------------

console.log("Gemini ayarları ve anahtar");

await test("anahtar biçimi: AIza… ve AQ.… kabul, sk-… ve bozuk anahtar ret", async () => {
  assert.equal(settings.isGeminiKey("AIzaSyD-abcdefghijklmnopqrstuvwxyz01234"), true);
  assert.equal(settings.isGeminiKey("AQ.Ab8RN6Ka1b2c3d4e5f6g7h8i9j0-_k.lmn"), true);
  assert.equal(settings.isGeminiKey("AIza-kisa"), false);
  assert.equal(settings.isGeminiKey("AQ.kisa"), false);
  assert.equal(settings.isGeminiKey("sk-proj-0123456789abcdefghij"), false);
  await assert.rejects(() => settings.saveApiKey("sk-ant-api03-0123456789abcdef", "gemini"), /Claude ya da OpenAI anahtarı/);
  await assert.rejects(() => settings.saveApiKey("merhaba-dunya-0123456789", "gemini"), /"AIza" ya da "AQ\."/);
  // Gemini anahtarı OpenAI / Claude alanına girilemez
  await assert.rejects(() => settings.saveApiKey("AIzaSyD-abcdefghijklmnopqrstuvwxyz01234", "openai"), /OpenAI API anahtarına benzemiyor/);
  await settings.saveApiKey("  AQ.Ab8RN6Ka1b2c3d4e5f6g7h8i9j0-_k.lmn  ", "gemini");
  assert.deepEqual(await settings.getApiKey("gemini"), { key: "AQ.Ab8RN6Ka1b2c3d4e5f6g7h8i9j0-_k.lmn", source: "db" });
  // Seçili sağlayıcının (Claude) anahtarı yoktu → yeni anahtarın sağlayıcısına geçildi
  assert.equal((await settings.getAiSettings()).provider, "gemini");
  await settings.deleteApiKey("gemini");
});

await test("varsayılan model ucuz Flash-Lite; model ve fiyat ayarı doğrulanır", async () => {
  const s = await settings.getAiSettings();
  assert.equal(s.geminiModel, "gemini-3.5-flash-lite");
  assert.equal(settings.GEMINI_CHEAP_MODEL, "gemini-3.1-flash-lite");
  assert.ok(settings.GEMINI_MODELS.every((m) => !m.id.startsWith("gemini-2")), "2.5 modelleri listede olmamalı");
  await assert.rejects(() => settings.updateAiSettings({ geminiModel: "gpt-5-mini" }), /Gemini model adı geçersiz/);
  await assert.rejects(() => settings.updateAiSettings({ provider: "bard" }), /sağlayıcısı geçersiz/);
  const u = await settings.updateAiSettings({ provider: "gemini", geminiModel: "gemini-3.5-flash-lite", maxSearches: 2 });
  assert.equal(u.provider, "gemini");
  assert.deepEqual(settings.knownPrice("gemini-3.5-flash-lite"), settings.GEMINI_MODELS[1]);
});

// ---- 2) Dönüştürme ----------------------------------------------------------------------------

console.log("İstek / yanıt dönüştürme");

await test("araç tanımları functionDeclarations'a (parametersJsonSchema) çevrilir", () => {
  const [t] = gem.toGeminiTools(CHAT_TOOLS) as { functionDeclarations: { name: string; parametersJsonSchema: unknown }[] }[];
  assert.equal(t.functionDeclarations.length, CHAT_TOOLS.length);
  const po = t.functionDeclarations.find((f) => f.name === "place_order")!;
  assert.deepEqual(po.parametersJsonSchema, CHAT_TOOLS.find((c) => c.name === "place_order")!.input_schema);
  assert.deepEqual(gem.toGeminiTools([]), []);
});

await test("başka sağlayıcıdan gelen geçmiş: imza atlama değeri, araç adı eşlemesi, sunucu blokları atlanır", () => {
  const contents = gem.toGeminiContents([
    { role: "user", content: "BTC ne durumda?" },
    {
      role: "assistant",
      content: [
        { type: "text", text: "Bakıyorum." },
        { type: "server_tool_use", id: "srvtoolu_1", name: "web_search", input: { query: "btc" } },
        { type: "tool_use", id: "toolu_1", name: "get_quote", input: { asset_type: "crypto", symbol: "BTC" } },
        { type: "tool_use", id: "toolu_2", name: "list_orders", input: {} },
      ],
    } as never,
    {
      role: "user",
      content: [
        { type: "tool_result", tool_use_id: "toolu_1", content: '{"fiyat":100}' },
        { type: "tool_result", tool_use_id: "toolu_2", content: "bulunamadı", is_error: true },
      ],
    },
    { role: "user", content: [{ type: "text", text: "ek soru" }] },
  ]);
  assert.deepEqual(contents.map((c) => c.role), ["user", "model", "user"], "ardışık kullanıcı mesajları birleşir");
  const model = contents[1].parts;
  assert.equal(model.length, 3, "server_tool_use atlanır");
  assert.equal(model[1].functionCall?.id, "toolu_1");
  assert.equal(model[1].thoughtSignature, gem.SKIP_SIGNATURE, "ilk functionCall imzasız olamaz");
  assert.equal(model[2].thoughtSignature, undefined);
  const user = contents[2].parts;
  assert.deepEqual(user[0].functionResponse, { id: "toolu_1", name: "get_quote", response: { fiyat: 100 } });
  assert.deepEqual(user[1].functionResponse, { id: "toolu_2", name: "list_orders", response: { hata: "bulunamadı" } });
  assert.deepEqual(user[2], { text: "ek soru" });
});

await test("akış parçaları birleşir; imzalı ham parçalar ve kaynaklar saklanır", () => {
  const parts: GeminiPart[] = [];
  gem.mergeParts(parts, [{ text: "Mer" }]);
  gem.mergeParts(parts, [{ text: "haba" }, { functionCall: { id: "c1", name: "list_alarms", args: {} }, thoughtSignature: "imza-1" }]);
  gem.mergeParts(parts, [{ toolCall: { id: "s1", toolType: "GOOGLE_SEARCH_WEB", args: { queries: ["thyao"] } } }]);
  assert.equal(parts.length, 3);
  assert.equal(parts[0].text, "Merhaba");
  const out = gem.parseParts(parts, {
    webSearchQueries: ["thyao haber", "thyao haber"],
    groundingChunks: [{ web: { uri: "https://ornek.com/a", title: "ornek.com" } }],
  });
  assert.equal(out.text, "Merhaba");
  assert.equal(out.searches, 1);
  assert.deepEqual(out.toolCalls, [{ id: "c1", name: "list_alarms", input: {} }]);
  const [textBlock, toolBlock] = out.content as unknown as Record<string, unknown>[];
  assert.deepEqual(textBlock.gemini_parts, parts);
  assert.deepEqual(textBlock.citations, [{ type: "url_citation", url: "https://ornek.com/a", title: "ornek.com" }]);
  assert.equal(toolBlock.gemini_signature, "imza-1");
  // Geri çeviride ham parçalar (toolCall dahil) aynen kullanılır; arama kapalıysa toolCall atılır
  const back = gem.toGeminiContents([{ role: "assistant", content: out.content as never }]);
  assert.deepEqual(back[0].parts, parts);
  assert.equal(gem.toGeminiContents([{ role: "assistant", content: out.content as never }], false)[0].parts.length, 2);
  // tool_use atılmış (son mesaj) → ham parçalar kullanılmaz, metinden yeniden kurulur
  const textOnly = gem.toGeminiContents([{ role: "assistant", content: out.content.filter((b) => b.type !== "tool_use") as never }]);
  assert.deepEqual(textOnly[0].parts, [{ text: "Merhaba" }]);
});

await test("Claude'a gönderilirken Gemini ek alanları atılır", async () => {
  let sent: { messages: { content: unknown }[] } | null = null;
  const fake = {
    messages: {
      stream(params: never) {
        sent = structuredClone(params);
        const msg = { content: [{ type: "text", text: "tamam", citations: null }], stop_reason: "end_turn", usage: { input_tokens: 1, output_tokens: 1 } };
        return { async *[Symbol.asyncIterator]() {}, finalMessage: async () => msg };
      },
    },
  } as unknown as AiClient;
  await anthropicProvider(fake).chatStep({
    system: "s",
    tools: [],
    maxSearches: 0,
    messages: [
      { role: "user", content: "x" },
      { role: "assistant", content: [{ type: "tool_use", id: "c1", name: "list_alarms", input: {}, gemini_signature: "i", gemini_parts: [] }] } as never,
      { role: "user", content: [{ type: "tool_result", tool_use_id: "c1", content: "{}" }] },
    ],
    onText: () => {},
    onStatus: () => {},
  });
  const json = JSON.stringify(sent!.messages);
  assert.ok(!json.includes("gemini_"), json);
});

// ---- 3) Sohbet (akış + araç çağırma) -----------------------------------------------------------

console.log("Sohbet");

await test("sohbet: araç çağrısı çalıştırılır, imza ve arama parçaları geri gönderilir, maliyet kaydedilir", async () => {
  reqs.length = 0;
  script = [
    {
      sse: [
        { candidates: [{ content: { role: "model", parts: [{ text: "Alarmlarınıza " }] } }] },
        {
          candidates: [
            {
              content: {
                role: "model",
                parts: [
                  { text: "bakıyorum." },
                  { toolCall: { id: "ara1", toolType: "GOOGLE_SEARCH_WEB", args: { queries: ["alarm"] } } },
                  { toolResponse: { id: "ara1", toolType: "GOOGLE_SEARCH_WEB", response: {} } },
                  { functionCall: { id: "fc_1", name: "list_alarms", args: {} }, thoughtSignature: "imza-abc" },
                ],
              },
              finishReason: "STOP",
            },
          ],
          usageMetadata: usage(1000, 100, 50),
        },
      ],
    },
    {
      sse: [
        { candidates: [{ content: { role: "model", parts: [{ text: "Kurulu " }] } }] },
        {
          candidates: [
            {
              content: { role: "model", parts: [{ text: "alarmınız yok." }] },
              finishReason: "STOP",
              groundingMetadata: { webSearchQueries: [], groundingChunks: [{ web: { uri: "https://kap.org.tr/x", title: "kap.org.tr" } }] },
            },
          ],
          usageMetadata: usage(2000, 40, 0, 1000),
        },
      ],
    },
  ];
  const events: { type: string; delta?: string; text?: string; message?: string }[] = [];
  const r = await runChatTurn({ message: "Alarmlarım neler?", emit: (e) => events.push(e as never), client: provider });
  assert.ok(r.conversationId, JSON.stringify(events));
  assert.equal(events.filter((e) => e.type === "error").length, 0, JSON.stringify(events));
  assert.equal(
    events
      .filter((e) => e.type === "text")
      .map((e) => e.delta)
      .join(""),
    "Alarmlarınıza bakıyorum.Kurulu alarmınız yok.",
  );
  assert.ok(events.some((e) => e.type === "status"), "araç durumu bildirilmeli");

  // 1. istek: akış uç noktası, anahtar başlıkta, araçlar + Google Search + VALIDATED kip
  const [r1, r2] = reqs;
  assert.match(r1.url, /\/v1beta\/models\/gemini-3\.5-flash-lite:streamGenerateContent\?alt=sse$/);
  assert.equal(r1.headers["x-goog-api-key"], client.apiKey);
  assert.ok(!r1.url.includes(client.apiKey), "anahtar URL'de olmamalı");
  const tools = r1.body.tools as Record<string, unknown>[];
  assert.ok(tools.some((t) => "functionDeclarations" in t));
  assert.ok(tools.some((t) => "googleSearch" in t));
  assert.deepEqual(r1.body.toolConfig, { includeServerSideToolInvocations: true, functionCallingConfig: { mode: "VALIDATED" } });
  assert.ok(((r1.body.systemInstruction as { parts: { text: string }[] }).parts[0].text).includes("Yatırım"));
  assert.deepEqual(r1.body.contents, [{ role: "user", parts: [{ text: "Alarmlarım neler?" }] }]);

  // 2. istek: model parçaları (imza ve toolCall dahil) aynen, ardından functionResponse
  const [, model, user] = r2.body.contents;
  assert.equal(model.role, "model");
  const call = model.parts.find((p) => p.functionCall)!;
  assert.equal(call.thoughtSignature, "imza-abc");
  assert.deepEqual(call.functionCall, { id: "fc_1", name: "list_alarms", args: {} });
  assert.ok(model.parts.some((p) => p.toolCall), "arama parçası geri gönderilmeli");
  assert.equal(user.role, "user");
  const fr = user.parts[0].functionResponse as { id: string; name: string; response: unknown };
  assert.equal(fr.id, "fc_1");
  assert.equal(fr.name, "list_alarms");
  assert.equal(typeof fr.response, "object");

  // Maliyet: 1. adım 1000 giriş, 150 çıktı (50 düşünme dahil), 1 arama; 2. adım 1000 giriş + 1000 önbellek, 40 çıktı
  const rows = (await db.all("SELECT * FROM ai_usage WHERE provider = 'gemini' AND kind = 'sohbet' ORDER BY id")) as Awaited<ReturnType<typeof lastUsage>>[];
  assert.equal(rows.length, 2);
  assert.equal(rows[0].model, "gemini-3.5-flash-lite");
  assert.equal(rows[0].output_tokens, 150);
  assert.equal(rows[0].web_searches, 1);
  close(rows[0].cost_usd, (1000 * 0.3 + 150 * 2.5) / 1e6 + 0.014);
  assert.equal(rows[1].input_tokens, 1000);
  assert.equal(rows[1].cache_read_tokens, 1000);
  close(rows[1].cost_usd, (1000 * 0.3 + 1000 * 0.3 * 0.1 + 40 * 2.5) / 1e6);
  const budget = await aiClient.getBudgetStatus();
  assert.ok(budget.byModel.some((m) => m.provider === "gemini" && m.model === "gemini-3.5-flash-lite"));

  // Görünen mesajlarda kaynak ve metin; ham Gemini alanları saklanmış
  const shown = JSON.stringify(await getDisplayMessages(r.conversationId!));
  assert.ok(shown.includes("alarmınız yok"));
  assert.ok(shown.includes("kap.org.tr"), "grounding kaynağı gösterilmeli");
});

await test("sohbet: arama kapalıyken (0) Google Search ve toolConfig gönderilmez; uzunluk sınırı uyarısı", async () => {
  await settings.updateAiSettings({ maxSearches: 0 });
  reqs.length = 0;
  script = [{ sse: [{ candidates: [{ content: { parts: [{ text: "Yarım" }] }, finishReason: "MAX_TOKENS" }], usageMetadata: usage(10, 10) }] }];
  const events: { type: string; message?: string }[] = [];
  await runChatTurn({ message: "uzun yaz", emit: (e) => events.push(e as never), client: provider });
  const tools = reqs[0].body.tools as Record<string, unknown>[];
  assert.ok(!tools.some((t) => "googleSearch" in t));
  assert.equal(reqs[0].body.toolConfig, undefined);
  assert.ok(events.some((e) => e.type === "warning" && /uzunluk/.test(e.message ?? "")));
  await settings.updateAiSettings({ maxSearches: 2 });
});

// ---- 4) Haber analizi (yapılandırılmış sonuç) ve özet --------------------------------------------

console.log("Haber analizi ve özet");

const reportTool = {
  name: "submit_news_report",
  description: "Rapor",
  input_schema: { type: "object" as const, properties: { ozet: { type: "string" } }, required: ["ozet"] },
};

await test("yapılandırılmış: Google Search + rapor işlevi aynı istekte; kaynaklar toplanır", async () => {
  reqs.length = 0;
  script = [
    {
      json: {
        candidates: [
          {
            content: { role: "model", parts: [{ functionCall: { id: "r1", name: "submit_news_report", args: { ozet: "Olumlu" } }, thoughtSignature: "s" }] },
            finishReason: "STOP",
            groundingMetadata: { webSearchQueries: ["a", "b"], groundingChunks: [{ web: { uri: "https://haber.com/1", title: "haber.com" } }] },
          },
        ],
        usageMetadata: usage(500, 50),
      },
    },
  ];
  const u: UsageTotals[] = [];
  const res = await provider.structured({ kind: "haber", system: "sistem", user: "THYAO", tool: reportTool, maxSearches: 3, onUsage: (x) => u.push(x) });
  assert.deepEqual(res.input, { ozet: "Olumlu" });
  assert.deepEqual([...res.sources], [["https://haber.com/1", "haber.com"]]);
  assert.match(reqs[0].url, /:generateContent$/);
  const tools = reqs[0].body.tools as Record<string, unknown>[];
  assert.ok(tools.some((t) => "googleSearch" in t) && tools.some((t) => "functionDeclarations" in t));
  assert.equal((reqs[0].body.toolConfig as { includeServerSideToolInvocations: boolean }).includeServerSideToolInvocations, true);
  assert.equal(u[0].webSearches, 2);
  close(u[0].costUsd, (500 * 0.3 + 50 * 2.5) / 1e6 + 2 * 0.014);
  assert.equal((await lastUsage()).kind, "haber");
});

await test("yapılandırılmış: araç çağrılmazsa bir kez aramasız ve zorunlu (ANY) hatırlatılır", async () => {
  reqs.length = 0;
  script = [
    { json: { candidates: [{ content: { parts: [{ text: "Haberleri inceledim." }] }, finishReason: "STOP" }], usageMetadata: usage(100, 10) } },
    {
      json: {
        candidates: [{ content: { parts: [{ functionCall: { id: "r2", name: "submit_news_report", args: { ozet: "Nötr" } } }] }, finishReason: "STOP" }],
        usageMetadata: usage(120, 10),
      },
    },
  ];
  const res = await provider.structured({ kind: "haber", system: "s", user: "ASELS", tool: reportTool, maxSearches: 2, onUsage: () => {} });
  assert.deepEqual(res.input, { ozet: "Nötr" });
  assert.equal(reqs.length, 2);
  const second = reqs[1].body;
  assert.ok(!(second.tools as Record<string, unknown>[]).some((t) => "googleSearch" in t));
  assert.deepEqual(second.toolConfig, { functionCallingConfig: { mode: "ANY", allowedFunctionNames: ["submit_news_report"] } });
  assert.equal(second.contents.length, 3);
  assert.match(String(second.contents[2].parts.at(-1)!.text), /submit_news_report aracıyla/);
});

await test("yapılandırılmış: güvenlik engeli ret olarak bildirilir", async () => {
  script = [{ json: { promptFeedback: { blockReason: "SAFETY" }, usageMetadata: usage(10, 0) } }];
  await assert.rejects(() => provider.structured({ kind: "haber", system: "s", user: "x", tool: reportTool, maxSearches: 0, onUsage: () => {} }), /reddetti/);
});

await test("günlük özet (complete, ucuz): Gemini 3.1 Flash-Lite, araçsız", async () => {
  reqs.length = 0;
  script = [{ json: { candidates: [{ content: { parts: [{ text: "  Bugün portföy sakin.  " }] }, finishReason: "STOP" }], usageMetadata: usage(300, 20, 10) } }];
  const r = await provider.complete({ kind: "ozet", system: "s", user: "özet", cheap: true });
  assert.equal(r.text, "Bugün portföy sakin.");
  assert.equal(r.model, "gemini-3.1-flash-lite");
  assert.match(reqs[0].url, /gemini-3\.1-flash-lite:generateContent$/);
  assert.equal(reqs[0].body.tools, undefined);
  close(r.usage.costUsd, (300 * 0.25 + 30 * 1.5) / 1e6);
  assert.equal((await lastUsage()).provider, "gemini");
});

// ---- 5) Bağlantı testi, hata mesajları, sağlayıcı seçimi --------------------------------------------

console.log("Bağlantı ve hatalar");

await test("bağlantıyı test et: başarılı ve geçersiz anahtar / kota / model hataları Türkçe", async () => {
  script = [{ json: { candidates: [{ content: { parts: [{ text: "tamam" }] }, finishReason: "STOP" }], usageMetadata: usage(5, 1) } }];
  const ok = await testConnection(undefined, provider);
  assert.equal(ok.ok, true);
  assert.match(ok.message, /Google Gemini bağlantısı başarılı\. Model: Gemini 3\.5 Flash-Lite/);
  assert.equal((await lastUsage()).kind, "test");

  const err = (status: number, s: string, message: string, reason?: string) => ({
    status,
    body: { error: { code: status, status: s, message, details: reason ? [{ "@type": "type.googleapis.com/google.rpc.ErrorInfo", reason }] : [] } },
  });
  script = [err(400, "INVALID_ARGUMENT", "API key not valid. Please pass a valid API key.", "API_KEY_INVALID")];
  const bad = await testConnection(undefined, provider);
  assert.equal(bad.ok, false);
  assert.match(bad.message, /Gemini API anahtarı geçersiz/);
  script = [err(429, "RESOURCE_EXHAUSTED", "You exceeded your current quota, please check your plan and billing details.")];
  assert.match((await testConnection(undefined, provider)).message, /Gemini kotası doldu/);
  script = [err(404, "NOT_FOUND", "models/gemini-x is not found")];
  assert.match((await testConnection(undefined, provider)).message, /Gemini modeli bulunamadı/);
  script = [err(400, "FAILED_PRECONDITION", "User location is not supported for the API use without a billing account linked.")];
  assert.match((await testConnection(undefined, provider)).message, /faturalandırma/);
  // Ağ hatası
  const down = gem.geminiProvider({
    apiKey: "x",
    fetch: async () => {
      throw new TypeError("fetch failed");
    },
  });
  const t0 = Date.now();
  assert.match((await testConnection(undefined, down)).message, /Gemini API'ye bağlanılamadı/);
  assert.ok(Date.now() - t0 >= 2900, "iki kez yeniden denenmeli");
});

await test("sağlayıcı seçimi: Gemini seçiliyken anahtar yoksa Türkçe hata; sahte istemciyle Gemini sağlayıcısı", async () => {
  await settings.updateAiSettings({ provider: "gemini" });
  assert.equal(await aiClient.isAiConfigured(), false);
  await assert.rejects(() => getProvider(), /Gemini anahtarı eklenmedi/);
  const none = await testConnection("gemini");
  assert.deepEqual(none, { ok: false, message: "Gemini anahtarı eklenmedi — Ayarlar'dan ekleyin." });
  aiClient.setGeminiClientOverride(client);
  try {
    assert.equal(await aiClient.isAiConfigured(), true);
    assert.equal((await getProvider()).id, "gemini");
  } finally {
    aiClient.setGeminiClientOverride(null);
  }
  await settings.updateAiSettings({ provider: "anthropic" });
});

await closeDb();
fs.rmSync(DIR, { recursive: true, force: true });
console.log(`\n${passed} Gemini testi geçti.`);
