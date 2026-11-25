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
import { setSignalAlertsEnabled, updateAiSettings } from "../src/lib/settings";
import { maybeRunSignalAlerts } from "../src/lib/technical";
import { getVapidKeys, listSubscriptions, removeSubscription, saveSubscription } from "../src/lib/push";
import * as actions from "../src/lib/actions";
import { checkAlarms } from "../src/lib/alarms";
import { generateDailySummary, maybeRunDailySummary, whyMoving } from "../src/lib/dailySummary";
import { enterUserForScripts } from "../src/lib/userContext";

// Çok kullanıcılı mod: betik sahibin (kullanıcı 1) bağlamında çalışır.
enterUserForScripts(1);

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

const db = await getDb();
const count = async (sql: string, ...args: (string | number)[]) => (await db.get(sql, [...args]) as { c: number }).c;
let passed = 0;
function ok(name: string) {
  passed++;
  console.log(`  ✓ ${name}`);
}

// ---- 1) Sohbet: sanal pozisyon aç ---------------------------------------------------------
console.log("Sohbet araçları");
await updateAiSettings({ budgetUsd: 10, maxSearches: 3, scheduleEnabled: true, scheduleTimes: "09:45, 13:00, 18:30" });

const virtBefore = await count("SELECT COUNT(*) c FROM transactions WHERE mode='virtual' AND symbol='BTC' AND converted_at IS NULL");
script = [
  { content: [text("Açıyorum."), toolUse("create_sanal_position", { asset_type: "crypto", symbol: "BTC", amount: 1000, amount_currency: "TRY" })], stop_reason: "tool_use" },
  { content: [text("Sanal portföyünüze 1.000 TL'lik BTC eklendi.")], stop_reason: "end_turn" },
];
const c1 = await chat("Sanal portföye 1000 TL'lik BTC ekle");
assert.ok(c1.conversationId);
const virtAfter = await count("SELECT COUNT(*) c FROM transactions WHERE mode='virtual' AND symbol='BTC' AND converted_at IS NULL");
assert.equal(virtAfter, virtBefore + 1, "sanal işlem eklenmeli");
const card1 = c1.events.find((e) => e.type === "card")?.card;
assert.ok(card1 && card1.tone === "ok" && card1.title.includes("Sanal pozisyon açıldı"), JSON.stringify(c1.events));
const lastTx = await db.get("SELECT * FROM transactions ORDER BY id DESC LIMIT 1") as { amount: number; amount_currency: string; note: string };
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
const realBefore = await count("SELECT COUNT(*) c FROM transactions WHERE mode='real' AND symbol='BTC'");
script = [
  { content: [toolUse("promote_sanal_to_gercek", { asset_type: "crypto", symbol: "BTC" })], stop_reason: "tool_use" },
  { content: [text("BTC gerçek portföye aktarıldı.")], stop_reason: "end_turn" },
];
const c2 = await chat("Sanal portföydeki BTC'yi gerçeğe al", c1.conversationId);
assert.equal(c2.conversationId, c1.conversationId);
assert.equal(await count("SELECT COUNT(*) c FROM transactions WHERE mode='real' AND symbol='BTC'"), realBefore + 1, "gerçek işlem eklenmeli");
assert.equal(await count("SELECT COUNT(*) c FROM transactions WHERE mode='virtual' AND symbol='BTC' AND converted_at IS NULL"), 0, "sanal arşivlenmeli");
const realTx = await db.get("SELECT * FROM transactions WHERE mode='real' AND symbol='BTC' ORDER BY id DESC LIMIT 1") as { source_id: number | null; quantity: number };
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
const order = await db.get("SELECT * FROM orders ORDER BY id DESC LIMIT 1") as { source: string; status: string; trigger_price: number; amount: number; condition: string };
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

// Teknik sinyal aracı (asset_type verilmeden, sembolden tahmin)
script = [
  { content: [toolUse("get_technical_signals", { symbol: "BTCUSDT" })], stop_reason: "tool_use" },
  { content: [text("BTC'nin teknik görünümü şöyle.")], stop_reason: "end_turn" },
];
await chat("BTC teknik olarak nasıl görünüyor?", c1.conversationId);
const techResults = calls[calls.length - 1].messages.at(-1)!.content as Anthropic.ToolResultBlockParam[];
assert.notEqual(techResults[0].is_error, true, String(techResults[0].content));
const tech = JSON.parse(techResults[0].content as string) as { asset_type: string; sinyal: string; puan: number; gostergeler: { rsi14: number; macd: number }; nedenler: { aciklama: string }[]; uyari: string };
assert.equal(tech.asset_type, "crypto");
assert.ok(["Güçlü Al", "Al", "Nötr", "Sat", "Güçlü Sat"].includes(tech.sinyal));
assert.ok(tech.gostergeler.rsi14 > 0 && tech.gostergeler.rsi14 < 100);
assert.ok(tech.nedenler.every((n) => n.aciklama.length > 10));
assert.match(tech.uyari, /yatırım tavsiyesi değildir/);
ok(`get_technical_signals → BTC: ${tech.sinyal} (puan ${tech.puan}, RSI ${tech.gostergeler.rsi14})`);

const display = await getDisplayMessages(c1.conversationId!);
assert.ok(display.some((m) => m.role === "assistant" && m.cards.length > 0));
ok(`sohbet geçmişi kaydedildi (${display.length} görünen mesaj)`);

// ---- 5) Haber analizi ------------------------------------------------------------------
console.log("Haber analizi");
const notifBefore = await count("SELECT COUNT(*) c FROM notifications WHERE kind='news_alert'");
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
const rep = (await getReport(rep0.id))!;
assert.equal(rep.status, "ok", rep.error ?? "");
assert.equal(rep.items.length, 1, "listede olmayan varlık atlanmalı");
assert.equal(rep.items[0].importance, 5);
assert.equal(rep.sources[0]?.url, "https://example.com/btc-haber");
assert.ok(rep.costUsd > 0 && rep.webSearches === 1);
const prompt = calls[calls.length - 1];
assert.ok(JSON.stringify(prompt.messages).includes("symbol=BTC"), "BTC taramaya girmeli");
assert.match(JSON.stringify(prompt.messages), /symbol=BTC[^"]*teknik sinyal (Güçlü Al|Al|Nötr|Sat|Güçlü Sat)/, "istemde teknik sinyal özeti olmalı");
assert.match(String(prompt.system), /teknik sinyal/);
assert.equal(await count("SELECT COUNT(*) c FROM notifications WHERE kind='news_alert'"), notifBefore + 1, "önem 5 → bildirim");
ok(`rapor #${rep.id} kaydedildi, önem 5 → bildirim oluştu (maliyet ~$${rep.costUsd.toFixed(4)})`);

// ---- 6) Bütçe ve zamanlayıcı ----------------------------------------------------------------
console.log("Bütçe ve zamanlayıcı");
// Zamanlayıcı testleri İÇİNDE BULUNULAN AYIN ilk çarşambasını kullanır: bütçe ay bazında
// hesaplandığından sabit bir tarih (örn. geçen ay) bu ayın harcamasını görmez ve test
// ay değişince bozulurdu. Önceki çalıştırmalardan kalan dilim kayıtları da silinir.
const ym = new Date().toLocaleDateString("en-CA", { timeZone: "Europe/Istanbul" }).slice(0, 7);
let wedDay = 1;
while (new Date(`${ym}-${String(wedDay).padStart(2, "0")}T12:00:00Z`).getUTCDay() !== 3) wedDay++;
const WED = `${ym}-${String(wedDay).padStart(2, "0")}`;
const sat = `${ym}-${String(wedDay + 3).padStart(2, "0")}`;
const at = (date: string, utc: string) => new Date(`${date}T${utc}:00Z`);
await db.run("DELETE FROM scheduled_runs WHERE slot LIKE ?", [`%${WED}%`]);
const wed = at(WED, "06:50"); // 09:50 İstanbul
await updateAiSettings({ budgetUsd: 0.000001 });
assert.ok((await getBudgetStatus()).overBudget);
const r1 = await maybeRunScheduledScan(wed, fake as AiClient);
assert.deepEqual(r1, { ran: false, reason: "butce" });
ok("bütçe dolu → otomatik tarama atlandı");
await updateAiSettings({ budgetUsd: 1000 }); // kopyalanmış veritabanında bu ayın gerçek harcaması olabilir
const r2 = await maybeRunScheduledScan(wed, fake as AiClient);
assert.deepEqual(r2, { ran: false, reason: "zaten_calisti" });
ok("aynı zaman dilimi ikinci kez çalışmaz");
script = [{ content: [toolUse("submit_news_report", { market_summary: "Sakin.", items: [] })], stop_reason: "tool_use" }];
const r3 = await maybeRunScheduledScan(at(WED, "10:05"), fake as AiClient); // 13:05 İstanbul
assert.equal(r3.ran, true);
ok("bütçe uygunken 13:00 dilimi çalıştı");
assert.deepEqual(await maybeRunScheduledScan(at(sat, "06:50"), fake as AiClient), { ran: false, reason: "hafta_sonu" });
assert.deepEqual(await maybeRunScheduledScan(at(WED, "08:00"), fake as AiClient), { ran: false, reason: "zamani_degil" });
ok("hafta sonu ve saat dışı atlanır");
// Hata veren tarama: aynı dilimde 10 dk sonra yalnızca bir kez yeniden denenir
script = []; // sahte istemci hata fırlatır → rapor "error"
const t1830 = at(WED, "15:31"); // 18:31 İstanbul
const f1 = await maybeRunScheduledScan(t1830, fake as AiClient);
assert.equal(f1.ran, false);
assert.equal(!f1.ran && f1.reason, "hata");
assert.deepEqual(await maybeRunScheduledScan(at(WED, "15:35"), fake as AiClient), { ran: false, reason: "zaten_calisti" }, "10 dk dolmadan tekrar yok");
script = [{ content: [toolUse("submit_news_report", { market_summary: "Toparlandı.", items: [] })], stop_reason: "tool_use" }];
const f2 = await maybeRunScheduledScan(at(WED, "15:42"), fake as AiClient);
assert.equal(f2.ran, true, JSON.stringify(f2));
assert.deepEqual(await maybeRunScheduledScan(at(WED, "15:55"), fake as AiClient), { ran: false, reason: "zaten_calisti" }, "ikinci tekrar yok");
ok("hata veren dilim 10 dk sonra bir kez yeniden denendi, sonra çift çalışma yok");

// ---- 6b) Günlük teknik sinyal değişimi uyarısı ----------------------------------------------
console.log("Teknik sinyal uyarıları");
await db.run("DELETE FROM scheduled_runs WHERE slot LIKE '%teknik %'");
await db.run("DELETE FROM technical_signals");
const day1 = new Date("2026-11-18T17:00:00Z"); // 20:00 İstanbul
await setSignalAlertsEnabled(false);
assert.deepEqual(await maybeRunSignalAlerts(day1), { ran: false, reason: "kapali" });
await setSignalAlertsEnabled(true);
assert.deepEqual(await maybeRunSignalAlerts(new Date("2026-11-18T12:00:00Z")), { ran: false, reason: "zamani_degil" });
const sigBefore = await count("SELECT COUNT(*) c FROM notifications WHERE kind='signal_change'");
const s1 = await maybeRunSignalAlerts(day1);
assert.ok(s1.ran && s1.changes.length === 0, "ilk kontrol yalnızca kaydeder: " + JSON.stringify(s1));
assert.ok((await count("SELECT COUNT(*) c FROM technical_signals WHERE instrument='crypto:BTC'")) === 1);
assert.deepEqual(await maybeRunSignalAlerts(new Date("2026-11-18T20:00:00Z")), { ran: false, reason: "zaten_calisti" });
ok(`kapalı / saat dışı / aynı gün ikinci kez çalışmaz (${s1.checked} varlık kaydedildi)`);
// Değişimi taklit et: BTC'nin kayıtlı sinyalini farklı bir değere çevir
const btcPrev = (await db.get("SELECT label FROM technical_signals WHERE instrument='crypto:BTC'") as { label: string }).label;
const fakePrev = btcPrev === "Güçlü Sat" ? "Güçlü Al" : "Güçlü Sat";
await db.run("UPDATE technical_signals SET label = ? WHERE instrument='crypto:BTC'", [fakePrev]);
const s2 = await maybeRunSignalAlerts(new Date("2026-11-19T17:00:00Z"));
assert.ok(s2.ran);
const btcChange = s2.changes.find((c) => c.instrument === "crypto:BTC");
assert.ok(btcChange && btcChange.from === fakePrev && btcChange.to === btcPrev, JSON.stringify(s2));
assert.equal(await count("SELECT COUNT(*) c FROM notifications WHERE kind='signal_change'"), sigBefore + s2.changes.length);
const sigNote = await db.get("SELECT title, body FROM notifications WHERE kind='signal_change' ORDER BY id DESC LIMIT 1") as { title: string; body: string };
ok(`sinyal değişimi → bildirim: "${sigNote.title}: ${sigNote.body.split(".")[0]}"`);

// ---- 6c) Alarmlar ----------------------------------------------------------------------------
console.log("Alarmlar");
await db.run("DELETE FROM alarms");
const alarmNotes = async () => (await count("SELECT COUNT(*) c FROM notifications WHERE kind='alarm'"));
const n0 = await alarmNotes();
const every = await actions.createAlarm({ kind: "price", assetType: "crypto", symbol: "BTC", direction: "up", threshold: 1, repeat: "every", cooldownMin: 60 });
assert.equal((await actions.listAlarms()).find((a) => a.id === every.id)?.fireCount, 1, "koşul zaten sağlanıyor → kurulunca bir kez çalar");
assert.equal(await alarmNotes(), n0 + 1);
await checkAlarms();
await checkAlarms();
assert.equal(await alarmNotes(), n0 + 1, "koşul sürdükçe tekrar çalmaz");
// Koşul bozulup yeniden oluşmuş gibi: yeniden kur, ama son çalma 10 dk önce → bekleme süresi (60 dk) engeller
const setState = async (id: number, st: unknown) => (await db.run("UPDATE alarms SET state = ? WHERE id = ?", [JSON.stringify(st), id]));
await setState(every.id, { "crypto:BTC": { armed: true, lastFiredAt: Date.now() - 10 * 60_000 } });
await checkAlarms();
assert.equal(await alarmNotes(), n0 + 1, "bekleme süresi dolmadan çalmaz");
await setState(every.id, { "crypto:BTC": { armed: true, lastFiredAt: Date.now() - 61 * 60_000 } });
await checkAlarms();
assert.equal(await alarmNotes(), n0 + 2, "bekleme süresi dolunca çalar");
ok("her seferinde alarmı: bir kez çaldı, koşul sürerken ve bekleme süresinde sustu, süre dolunca yeniden çaldı");

const once = await actions.createAlarm({ kind: "price", assetType: "crypto", symbol: "BTC", direction: "up", threshold: 1, repeat: "once" });
assert.equal((await actions.listAlarms()).find((a) => a.id === once.id)?.active, false, "tek sefer alarm çalınca kapanır");
await actions.addToWatchlist({ assetType: "crypto", symbol: "ETH" });
const wl = await actions.createAlarm({ kind: "day_change", scope: "watchlist", direction: "both", threshold: 0.0001, repeat: "every", cooldownMin: 30 });
const ev = (await actions.listAlarmEvents(10)).filter((e) => e.alarmId === wl.id);
assert.ok(ev.some((e) => e.instrument === "crypto:ETH"), "izleme listesi alarmı ETH için çalmalı: " + JSON.stringify(ev));
await assert.rejects(() => actions.createAlarm({ kind: "price", scope: "watchlist", threshold: 5, direction: "up" }), /İzleme listesi alarmı/);
await assert.rejects(() => actions.createAlarm({ kind: "cost_change", assetType: "bist", symbol: "THYAO", threshold: 10 }), /pozisyonu yok/);
ok(`tek sefer kapanır, izleme listesi alarmı çalıştı (${ev[0].message.slice(0, 60)}…), geçersiz alarmlar Türkçe hata verir`);

script = [
  { content: [toolUse("create_alarm", { kind: "day_change", asset_type: "crypto", symbol: "BTC", direction: "both", threshold: 5 })], stop_reason: "tool_use" },
  { content: [text("BTC bir günde %5 hareket ederse haber vereceğim.")], stop_reason: "end_turn" },
];
const ca = await chat("BTC bir günde %5 oynarsa haber ver");
const alarmCard = ca.events.find((e) => e.type === "card")?.card;
assert.ok(alarmCard?.title.startsWith("Alarm kuruldu"), JSON.stringify(ca.events));
assert.ok((await actions.listAlarms()).some((a) => a.source === "yapay_zeka" && a.kind === "day_change"));
ok(`sohbet create_alarm → ${alarmCard!.lines[0]}`);

// ---- 6d) Rakam son kontrolü (sohbet) -----------------------------------------------------------
console.log("Yapay zeka güvenilirliği");
script = [
  { content: [toolUse("get_quote", { instruments: [{ asset_type: "crypto", symbol: "BTC" }] })], stop_reason: "tool_use" },
  { content: [text("BTC şu an 12.345.678,9 USD; hedef 999.999 USD olabilir.")], stop_reason: "end_turn" },
];
const cv = await chat("BTC kaç para?");
const warn = cv.events.find((e) => e.type === "card" && e.card?.tone === "warn")?.card;
assert.ok(warn && warn.lines.includes("12.345.678,9") && warn.lines.includes("999.999"), JSON.stringify(cv.events));
const quoteResult = JSON.parse((calls[calls.length - 1].messages.at(-1)!.content as Anthropic.ToolResultBlockParam[])[0].content as string) as { veri_zamani: string; fiyat: number }[];
assert.ok(quoteResult[0].veri_zamani, "get_quote veri zamanı döndürmeli");
// Doğru rakam işaretlenmez
const realPrice = quoteResult[0].fiyat;
script = [
  { content: [toolUse("get_quote", { instruments: [{ asset_type: "crypto", symbol: "BTC" }] })], stop_reason: "tool_use" },
  { content: [text(`BTC ${realPrice.toLocaleString("tr-TR", { maximumFractionDigits: 2 })} USD (${quoteResult[0].veri_zamani} itibarıyla).`)], stop_reason: "end_turn" },
];
const cv2 = await chat("BTC kaç para?", cv.conversationId);
assert.ok(!cv2.events.some((e) => e.type === "card" && e.card?.tone === "warn"), JSON.stringify(cv2.events));
const shown = await getDisplayMessages(cv.conversationId!);
assert.ok(shown.some((m) => m.cards.some((c) => c.tone === "warn")), "uyarı kartı geçmişte de görünmeli");
assert.match(String(calls[calls.length - 1].system), /RAKAM KURALI/);
ok(`uydurma rakam → "doğrulanamayan rakam" (${warn!.lines.join(", ")}); araç rakamı işaretlenmedi`);

// Haber raporu: senaryolar, güven, ücretsiz başlık sayımı ve kaynaklar
script = [
  {
    content: [
      toolUse("submit_news_report", {
        market_summary: "Sakin.",
        items: [{ asset_type: "crypto", symbol: "BTC", sentiment: "nötr", importance: 2, summary: "Fiyat 123.456.789 USD oldu.", position_impact: "Etkisi sınırlı olabilir.", scenario_positive: "Yükseliş sürebilir.", scenario_negative: "Düşüş gelebilir.", confidence: "düşük", sources: [] }],
      }),
    ],
    stop_reason: "tool_use",
  },
];
const nr = (await getReport((await startNewsScan({ trigger: "manuel", wait: true, client: fake as AiClient })).id))!;
const sys = String(calls[calls.length - 1].system);
assert.match(sys, /ÜCRETSİZ kaynakları/);
assert.equal(nr.items[0].confidence, "düşük");
assert.equal(nr.items[0].scenarioNegative, "Düşüş gelebilir.");
assert.ok(nr.freeHeadlines >= 0 && nr.searchesSaved >= 0);
ok(`haber raporu: senaryo + güven kaydedildi, ücretsiz başlık ${nr.freeHeadlines}, tasarruf edilen arama ${nr.searchesSaved}${nr.items[0].unverified ? `, doğrulanamayan: ${nr.items[0].unverified.join(",")}` : ""}`);

// ---- 6e) Günlük özet ve "Neden hareket ediyor?" ---------------------------------------------------
console.log("Günlük özet");
setAiClientOverride(null);
const savedKey = process.env.ANTHROPIC_API_KEY;
delete process.env.ANTHROPIC_API_KEY;
await db.run("DELETE FROM settings WHERE key = 'anthropic_api_key'");
const det = await generateDailySummary();
assert.equal(det.ai, false);
assert.match(det.text, /yatırım tavsiyesi değildir/);
ok(`anahtarsız kurallı özet: "${det.text.split("\n")[0]}"`);
await db.run("DELETE FROM scheduled_runs WHERE slot LIKE '%ozet %'");
script = [{ content: [text("- Portföyünüz bugün sakin.\n- Yatırım tavsiyesi değildir.")], stop_reason: "end_turn" }];
assert.deepEqual(await maybeRunDailySummary(at(WED, "15:00"), fake as AiClient), { ran: false, reason: "zamani_degil" }); // 18:00 İstanbul
assert.deepEqual(await maybeRunDailySummary(at(sat, "16:00"), fake as AiClient), { ran: false, reason: "hafta_sonu" });
const sumNotes = await count("SELECT COUNT(*) c FROM notifications WHERE kind='daily_summary'");
const sr = await maybeRunDailySummary(at(WED, "15:50"), fake as AiClient); // 18:50 İstanbul
assert.deepEqual(sr, { ran: true, ai: true });
assert.deepEqual(await maybeRunDailySummary(at(WED, "16:30"), fake as AiClient), { ran: false, reason: "zaten_calisti" });
assert.equal(await count("SELECT COUNT(*) c FROM notifications WHERE kind='daily_summary'"), sumNotes + 1);
const sumCall = calls[calls.length - 1];
assert.ok(!sumCall.tools, "günlük özet web araması / araç kullanmamalı");
assert.match(JSON.stringify(sumCall.messages), /portfoyler/);
ok("18:45 sonrası bir kez (yapay zekalı, araçsız) çalıştı ve bildirim üretti; hafta sonu / saat dışı atlanır");

const why = await whyMoving("crypto:BTC", { force: true });
assert.equal(why.ai, false);
assert.match(why.text, /BTC bugün/);
script = [{ content: [text("Olası neden: başlıklara göre piyasa genelinde satış var. Olumlu senaryo: toparlanabilir. Olumsuz senaryo: düşüş sürebilir. Güven: düşük")], stop_reason: "end_turn" }];
const why2 = await whyMoving("crypto:BTC", { force: true, client: fake as AiClient });
assert.ok(why2.headlines.length === 0 || why2.ai, "başlık varsa ucuz yapay zeka özeti");
ok(`"Neden hareket ediyor?": yapay zekasız ${why.headlines.length} başlık; stub ile ai=${why2.ai}`);
if (savedKey) process.env.ANTHROPIC_API_KEY = savedKey;

// ---- 7) Anahtarsız durum ve hata mesajları -------------------------------------------------------
console.log("Anahtar yok");
setAiClientOverride(null);
const saved = process.env.ANTHROPIC_API_KEY;
delete process.env.ANTHROPIC_API_KEY;
await db.run("DELETE FROM settings WHERE key = 'anthropic_api_key'");
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
const k1 = await getVapidKeys();
const k2 = await getVapidKeys();
assert.equal(k1.publicKey, k2.publicKey, "VAPID anahtarları bir kez üretilip saklanmalı");
assert.equal(Buffer.from(k1.publicKey, "base64url").length, 65);
const sub = await saveSubscription({ endpoint: "https://push.example.com/abc", keys: { p256dh: "x", auth: "y" } }, "test");
assert.ok((await listSubscriptions()).some((s) => s.id === sub.id));
assert.ok(await removeSubscription({ id: sub.id }));
ok("VAPID üretildi, abonelik kaydedildi/silindi");

console.log(`\n${passed} test geçti.`);
process.exit(0);
