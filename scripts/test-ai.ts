// Yapay zeka katmanının sahte (stub) Claude istemcisiyle testi. Gerçek API çağrısı yapmaz,
// ama fiyatlar için internet gerekir (Binance/Yahoo).
//
// ÇALIŞTIRMA (gerçek veritabanına dokunmaması için YATIRIM_DATA_DIR zorunludur):
//   YATIRIM_DATA_DIR=/tmp/yatirim-test npm run test:ai
import assert from "node:assert/strict";
import type Anthropic from "@anthropic-ai/sdk";
import { getDb } from "../src/lib/db";
import { aiErrorMessage, getBudgetStatus, setAiClientOverride, type AiClient } from "../src/lib/aiClient";
import { getDisplayMessages, runChatTurn } from "../src/lib/chat";
import { getReport, maybeRunScheduledScan, startNewsScan } from "../src/lib/news";
import { updateAiSettings } from "../src/lib/settings";
import { getVapidKeys, listSubscriptions, removeSubscription, saveSubscription } from "../src/lib/push";

if (!process.env.YATIRIM_DATA_DIR) {
  console.error("YATIRIM_DATA_DIR ayarlanmalı (test, gerçek veritabanını değiştirmesin).");
  process.exit(1);
}

type Client = Parameters<typeof setAiClientOverride>[0];

// ---- Sahte istemci -------------------------------------------------------------------

type Scripted = { content: Anthropic.ContentBlock[]; stop_reason: Anthropic.StopReason };
const calls: Anthropic.MessageCreateParams[] = [];
let script: Scripted[] = [];

function message(s: Scripted): Anthropic.Message {
  return {
    id: `msg_${calls.length}`,
    type: "message",
    role: "assistant",
    model: "claude-haiku-5-5",
    content: s.content,
    stop_reason: s.stop_reason,
    stop_sequence: null,
    usage: {
      input_tokens: 1000,
      output_tokens: 200,
      cache_creation_input_tokens: 0,
      cache_read_input_tokens: 0,
      server_tool_use: { web_search_requests: 1, web_fetch_requests: 0 },
    },
  } as unknown as Anthropic.Message;
}

const fake = {
  messages: {
    stream(params: Anthropic.MessageCreateParams) {
      calls.push(structuredClone(params));
      const next = script.shift();
      if (!next) throw new Error("Senaryoda yanıt kalmadı");
      const msg = message(next);
      return {
        async *[Symbol.asyncIterator]() {
          for (const [index, b] of msg.content.entries()) {
            yield { type: "content_block_start", index, content_block: b };
            if (b.type === "text") yield { type: "content_block_delta", index, delta: { type: "text_delta", text: b.text } };
          }
        },
        finalMessage: async () => msg,
      };
    },
    create: async () => {
      throw new Error("kullanılmamalı");
    },
  },
} as unknown as Client;

const text = (t: string): Anthropic.ContentBlock => ({ type: "text", text: t, citations: null }) as unknown as Anthropic.ContentBlock;
const toolUse = (name: string, input: unknown, id = `toolu_${Math.random().toString(36).slice(2)}`): Anthropic.ContentBlock =>
  ({ type: "tool_use", id, name, input, caller: { type: "direct" } }) as unknown as Anthropic.ContentBlock;

async function chat(message: string, conversationId?: number | null) {
  const events: unknown[] = [];
  const r = await runChatTurn({ conversationId, message, emit: (e) => events.push(e), client: fake as AiClient });
  return { ...r, events: events as { type: string; card?: { title: string; tone: string; lines: string[] }; message?: string }[] };
}

const db = getDb();
const count = (sql: string, ...args: (string | number)[]) => (db.prepare(sql).get(...args) as { c: number }).c;
let passed = 0;
function ok(name: string) {
  passed++;
  console.log(`  ✓ ${name}`);
}

// ---- 1) Sohbet: sanal pozisyon aç ---------------------------------------------------------
console.log("Sohbet araçları");
updateAiSettings({ budgetUsd: 10, maxSearches: 3, scheduleEnabled: true, scheduleTimes: "09:45, 13:00, 18:30" });

const virtBefore = count("SELECT COUNT(*) c FROM transactions WHERE mode='virtual' AND symbol='BTC' AND converted_at IS NULL");
script = [
  { content: [text("Açıyorum."), toolUse("create_sanal_position", { asset_type: "crypto", symbol: "BTC", amount: 1000, amount_currency: "TRY" })], stop_reason: "tool_use" },
  { content: [text("Sanal portföyünüze 1.000 TL'lik BTC eklendi.")], stop_reason: "end_turn" },
];
const c1 = await chat("Sanal portföye 1000 TL'lik BTC ekle");
assert.ok(c1.conversationId);
const virtAfter = count("SELECT COUNT(*) c FROM transactions WHERE mode='virtual' AND symbol='BTC' AND converted_at IS NULL");
assert.equal(virtAfter, virtBefore + 1, "sanal işlem eklenmeli");
const card1 = c1.events.find((e) => e.type === "card")?.card;
assert.ok(card1 && card1.tone === "ok" && card1.title.includes("Sanal pozisyon açıldı"), JSON.stringify(c1.events));
const lastTx = db.prepare("SELECT * FROM transactions ORDER BY id DESC LIMIT 1").get() as { amount: number; amount_currency: string; note: string };
assert.equal(lastTx.amount, 1000);
assert.equal(lastTx.amount_currency, "TRY");
assert.match(lastTx.note, /Yapay zeka/);
// İkinci API çağrısı tool_result içermeli
const second = calls[calls.length - 1];
const lastUser = second.messages[second.messages.length - 1];
assert.ok(Array.isArray(lastUser.content) && lastUser.content.some((b) => b.type === "tool_result"), "tool_result geri gönderilmeli");
assert.ok(second.tools?.some((t) => "type" in t && t.type === "web_search_20250305"), "web_search aracı eklenmeli");
ok(`create_sanal_position → sanal işlem eklendi (${card1.lines[0]})`);

// ---- 2) Sanalı gerçeğe al ---------------------------------------------------------------
const realBefore = count("SELECT COUNT(*) c FROM transactions WHERE mode='real' AND symbol='BTC'");
script = [
  { content: [toolUse("promote_sanal_to_gercek", { asset_type: "crypto", symbol: "BTC" })], stop_reason: "tool_use" },
  { content: [text("BTC gerçek portföye aktarıldı.")], stop_reason: "end_turn" },
];
const c2 = await chat("Sanal portföydeki BTC'yi gerçeğe al", c1.conversationId);
assert.equal(c2.conversationId, c1.conversationId);
assert.equal(count("SELECT COUNT(*) c FROM transactions WHERE mode='real' AND symbol='BTC'"), realBefore + 1, "gerçek işlem eklenmeli");
assert.equal(count("SELECT COUNT(*) c FROM transactions WHERE mode='virtual' AND symbol='BTC' AND converted_at IS NULL"), 0, "sanal arşivlenmeli");
const realTx = db.prepare("SELECT * FROM transactions WHERE mode='real' AND symbol='BTC' ORDER BY id DESC LIMIT 1").get() as { source_id: number | null; quantity: number };
assert.ok(realTx.source_id, "gerçek işlem sanal kaynağa bağlanmalı");
const card2 = c2.events.find((e) => e.type === "card")?.card;
assert.ok(card2?.title.includes("Gerçek portföye aktarıldı"));
ok(`promote_sanal_to_gercek → gerçek işlem #${realTx.source_id} kaynağıyla (${card2!.lines[0]})`);

// ---- 3) Emir ver ---------------------------------------------------------------------
script = [
  {
    content: [toolUse("place_order", { mode: "real", asset_type: "crypto", symbol: "BTC", side: "buy", condition: "lte", trigger_price: 1000, amount: 5000, amount_currency: "TRY" })],
    stop_reason: "tool_use",
  },
  { content: [text("Emir verildi.")], stop_reason: "end_turn" },
];
const c3 = await chat("BTC 1.000$'a düşerse 5.000 TL'lik al emri ver", c1.conversationId);
const order = db.prepare("SELECT * FROM orders ORDER BY id DESC LIMIT 1").get() as { source: string; status: string; trigger_price: number; amount: number; condition: string };
assert.equal(order.source, "yapay_zeka");
assert.equal(order.status, "pending");
assert.equal(order.trigger_price, 1000);
assert.equal(order.amount, 5000);
assert.equal(order.condition, "lte");
ok(`place_order → bekleyen emir, source=yapay_zeka (${c3.events.find((e) => e.type === "card")!.card!.lines.join(" | ")})`);

// ---- 4) Hatalı araç girdisi kart + is_error üretir --------------------------------------------
script = [
  { content: [toolUse("add_transaction", { mode: "real", asset_type: "crypto", symbol: "BTC", side: "sell", quantity: 999999, price: 1, currency: "USD" })], stop_reason: "tool_use" },
  { content: [text("Satış yapılamadı.")], stop_reason: "end_turn" },
];
const c4 = await chat("999999 BTC sat", c1.conversationId);
const errCard = c4.events.find((e) => e.type === "card")?.card;
assert.equal(errCard?.tone, "error");
const tr = calls[calls.length - 1].messages.at(-1)!.content as Anthropic.ToolResultBlockParam[];
assert.equal(tr[0].is_error, true);
ok(`geçersiz işlem → hata kartı: ${errCard!.lines[0]}`);

const display = getDisplayMessages(c1.conversationId!);
assert.ok(display.some((m) => m.role === "assistant" && m.cards.length > 0));
ok(`sohbet geçmişi kaydedildi (${display.length} görünen mesaj)`);

// ---- 5) Haber analizi ------------------------------------------------------------------
console.log("Haber analizi");
const notifBefore = count("SELECT COUNT(*) c FROM notifications WHERE kind='news_alert'");
const submit = {
  market_summary: "Piyasalar karışık seyrediyor.",
  items: [
    {
      asset_type: "crypto",
      symbol: "BTC",
      sentiment: "olumsuz",
      importance: 5,
      summary: "Bitcoin sert düştü. Büyük bir borsada güvenlik sorunu bildirildi.",
      position_impact: "Gerçek pozisyonunuzun değeri düşebilir.",
      sources: ["https://example.com/btc-haber"],
    },
    { asset_type: "crypto", symbol: "UYDURMA", sentiment: "olumlu", importance: 5, summary: "x", position_impact: "x", sources: [] },
  ],
};
script = [
  {
    content: [
      {
        type: "web_search_tool_result",
        tool_use_id: "srvtoolu_1",
        content: [{ type: "web_search_result", url: "https://example.com/btc-haber", title: "BTC haberi", encrypted_content: "x", page_age: null }],
      } as unknown as Anthropic.ContentBlock,
      toolUse("submit_news_report", submit),
    ],
    stop_reason: "tool_use",
  },
];
const rep0 = await startNewsScan({ trigger: "manuel", wait: true, client: fake as AiClient });
const rep = getReport(rep0.id)!;
assert.equal(rep.status, "ok", rep.error ?? "");
assert.equal(rep.items.length, 1, "listede olmayan varlık atlanmalı");
assert.equal(rep.items[0].importance, 5);
assert.equal(rep.sources[0]?.url, "https://example.com/btc-haber");
assert.ok(rep.costUsd > 0 && rep.webSearches === 1);
const prompt = calls[calls.length - 1];
assert.ok(JSON.stringify(prompt.messages).includes("symbol=BTC"), "BTC taramaya girmeli");
assert.equal(count("SELECT COUNT(*) c FROM notifications WHERE kind='news_alert'"), notifBefore + 1, "önem 5 → bildirim");
ok(`rapor #${rep.id} kaydedildi, önem 5 → bildirim oluştu (maliyet ~$${rep.costUsd.toFixed(4)})`);

// ---- 6) Bütçe ve zamanlayıcı ----------------------------------------------------------------
console.log("Bütçe ve zamanlayıcı");
// Çarşamba 2026-11-18 09:50 İstanbul = 06:50 UTC
const wed = new Date("2026-11-18T06:50:00Z");
updateAiSettings({ budgetUsd: 0.000001 });
assert.ok(getBudgetStatus().overBudget);
const r1 = await maybeRunScheduledScan(wed, fake as AiClient);
assert.deepEqual(r1, { ran: false, reason: "butce" });
ok("bütçe dolu → otomatik tarama atlandı");
updateAiSettings({ budgetUsd: 10 });
const r2 = await maybeRunScheduledScan(wed, fake as AiClient);
assert.deepEqual(r2, { ran: false, reason: "zaten_calisti" });
ok("aynı zaman dilimi ikinci kez çalışmaz");
script = [{ content: [toolUse("submit_news_report", { market_summary: "Sakin.", items: [] })], stop_reason: "tool_use" }];
const r3 = await maybeRunScheduledScan(new Date("2026-11-18T10:05:00Z"), fake as AiClient); // 13:05 İstanbul
assert.equal(r3.ran, true);
ok("bütçe uygunken 13:00 dilimi çalıştı");
assert.deepEqual(await maybeRunScheduledScan(new Date("2026-11-21T06:50:00Z"), fake as AiClient), { ran: false, reason: "hafta_sonu" });
assert.deepEqual(await maybeRunScheduledScan(new Date("2026-11-18T08:00:00Z"), fake as AiClient), { ran: false, reason: "zamani_degil" });
ok("hafta sonu ve saat dışı atlanır");

// ---- 7) Anahtarsız durum ve hata mesajları -------------------------------------------------------
console.log("Anahtar yok");
setAiClientOverride(null);
const saved = process.env.ANTHROPIC_API_KEY;
delete process.env.ANTHROPIC_API_KEY;
db.prepare("DELETE FROM settings WHERE key = 'anthropic_api_key'").run();
const evs: { type: string; message?: string }[] = [];
await runChatTurn({ message: "merhaba", emit: (e) => evs.push(e) });
assert.match(evs.find((e) => e.type === "error")?.message ?? "", /Ayarlar/);
await assert.rejects(() => startNewsScan({ trigger: "manuel" }), /Ayarlar/);
assert.equal((await maybeRunScheduledScan(wed)).ran, false);
if (saved) process.env.ANTHROPIC_API_KEY = saved;
ok("anahtar yokken sohbet ve analiz Türkçe uyarı verir, çökmez");
assert.match(aiErrorMessage(new Error("x")), /Beklenmeyen/);

// ---- 8) Web Push -------------------------------------------------------------------------
console.log("Web Push");
const k1 = getVapidKeys();
const k2 = getVapidKeys();
assert.equal(k1.publicKey, k2.publicKey, "VAPID anahtarları bir kez üretilip saklanmalı");
assert.equal(Buffer.from(k1.publicKey, "base64url").length, 65);
const sub = saveSubscription({ endpoint: "https://push.example.com/abc", keys: { p256dh: "x", auth: "y" } }, "test");
assert.ok(listSubscriptions().some((s) => s.id === sub.id));
assert.ok(removeSubscription({ id: sub.id }));
ok("VAPID üretildi, abonelik kaydedildi/silindi");

console.log(`\n${passed} test geçti.`);
process.exit(0);
