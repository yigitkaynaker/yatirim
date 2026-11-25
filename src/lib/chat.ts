import "server-only";
import type Anthropic from "@anthropic-ai/sdk";
import { getDb, sqlNow } from "./db";
import { aiErrorMessage, getBudgetStatus } from "./aiClient";
import { getProvider, type AiBackend, type AiProvider } from "./aiProvider";
import { getAiSettings } from "./settings";
import { CHAT_TOOLS, executeChatTool, toolLabel, type ActionCard } from "./chatTools";
import { todayIstanbul } from "./portfolio";
import { kapContext, tickersOfInterest } from "./kap";
import { unverifiedNumbers } from "./numberCheck";
import { getCurrentUserId } from "./userContext";

// SOHBET
// Yapay zeka (Claude ya da OpenAI, bkz. aiProvider.ts) ile araç kullanan sohbet. Mesajlar Claude içerik blokları olarak
// chat_messages tablosunda saklanır ve her turda geri gönderilir. Yanıt
// istemciye NDJSON olayları olarak akıtılır (bkz. ChatEvent).

export interface Conversation {
  id: number;
  title: string;
  createdAt: string;
  updatedAt: string;
}

export interface DisplayMessage {
  id: number;
  role: "user" | "assistant";
  text: string;
  cards: ActionCard[];
  sources: { url: string; title: string }[];
}

export type ChatEvent =
  | { type: "conversation"; id: number }
  | { type: "text"; delta: string }
  | { type: "status"; text: string }
  | { type: "card"; card: ActionCard }
  | { type: "warning"; message: string }
  | { type: "error"; message: string }
  | { type: "done" };

interface MsgRow {
  id: number;
  conversation_id: number;
  role: "user" | "assistant";
  content: string;
  cards: string | null;
  created_at: string;
}

// ---- Saklama ----------------------------------------------------------------------

export async function listConversations(limit = 50): Promise<Conversation[]> {
  const rows = await (await getDb()).all("SELECT * FROM chat_conversations WHERE user_id = ? ORDER BY updated_at DESC, id DESC LIMIT ?", [await getCurrentUserId(), limit]) as unknown as {
    id: number;
    title: string;
    created_at: string;
    updated_at: string;
  }[];
  return rows.map((r) => ({ id: r.id, title: r.title, createdAt: r.created_at, updatedAt: r.updated_at }));
}

export async function getConversation(id: number): Promise<Conversation | null> {
  return (await listConversations(1000)).find((c) => c.id === id) ?? null;
}

export async function deleteConversation(id: number): Promise<boolean> {
  return Number((await (await getDb()).run("DELETE FROM chat_conversations WHERE id = ? AND user_id = ?", [id, await getCurrentUserId()])).changes) > 0;
}

async function createConversation(firstMessage: string): Promise<number> {
  const title = firstMessage.replace(/\s+/g, " ").trim().slice(0, 60) || "Yeni sohbet";
  return (await (await getDb()).run("INSERT INTO chat_conversations (user_id, title) VALUES (?, ?) RETURNING id", [await getCurrentUserId(), title])).lastId!;
}

async function insertMessage(conversationId: number, role: "user" | "assistant", content: unknown, cards?: ActionCard[]): Promise<number> {
  const res = await (await getDb()).run("INSERT INTO chat_messages (user_id, conversation_id, role, content, cards) VALUES (?, ?, ?, ?, ?) RETURNING id", [await getCurrentUserId(), conversationId, role, JSON.stringify(content), cards && cards.length ? JSON.stringify(cards) : null]);
  await (await getDb()).run("UPDATE chat_conversations SET updated_at = ? WHERE id = ? AND user_id = ?", [sqlNow(), conversationId, await getCurrentUserId()]);
  return res.lastId!;
}

/**
 * Rakam son kontrolü: bu turdaki asistan metnindeki rakamlar sohbetin araç sonuçlarında,
 * kullanıcı mesajlarında ya da sistem bağlamında geçiyor mu? Geçmeyenler için uyarı kartı
 * (engellemez). Kart son asistan mesajına kaydedilir, böylece geçmişte de görünür.
 */
async function verifyNumbers(conversationId: number, turnText: string, system: string): Promise<ActionCard | null> {
  if (!turnText.trim()) return null;
  const sources = [system];
  for (const r of (await rowsFor(conversationId))) {
    if (r.role !== "user") continue;
    sources.push(r.content); // araç sonuçları (JSON) ve kullanıcı metinleri
  }
  const bad = unverifiedNumbers(turnText, sources);
  if (bad.length === 0) return null;
  return { tone: "warn", title: "Doğrulanamayan rakam", lines: bad.slice(0, 8) };
}

async function rowsFor(conversationId: number): Promise<MsgRow[]> {
  return await (await getDb()).all("SELECT * FROM chat_messages WHERE conversation_id = ? AND user_id = ? ORDER BY id", [conversationId, await getCurrentUserId()]) as unknown as MsgRow[];
}

type Block = { type: string; text?: string; citations?: { type: string; url?: string; title?: string | null }[] | null };

/** Kullanıcıya gösterilecek mesajlar: metinler, işlem kartları, kaynaklar. Araç sonucu mesajları kart olarak birleşir. */
export async function getDisplayMessages(conversationId: number): Promise<DisplayMessage[]> {
  const out: DisplayMessage[] = [];
  for (const r of (await rowsFor(conversationId))) {
    const content = JSON.parse(r.content) as string | Block[];
    const blocks: Block[] = typeof content === "string" ? [{ type: "text", text: content }] : content;
    const text = blocks
      .filter((b) => b.type === "text")
      .map((b) => b.text ?? "")
      .join("")
      .trim();
    const cards = r.cards ? (JSON.parse(r.cards) as ActionCard[]) : [];
    const sources = new Map<string, string>();
    for (const b of blocks) {
      for (const c of b.citations ?? []) if (c.url && !sources.has(c.url)) sources.set(c.url, c.title ?? c.url);
    }
    const isToolResults = r.role === "user" && blocks.some((b) => b.type === "tool_result");
    if (isToolResults) {
      // Araç sonuçları: kartları bir önceki asistan mesajına ekle
      const prev = out[out.length - 1];
      if (cards.length) {
        if (prev && prev.role === "assistant") prev.cards.push(...cards);
        else out.push({ id: r.id, role: "assistant", text: "", cards, sources: [] });
      }
      continue;
    }
    if (!text && !cards.length && r.role === "assistant") continue;
    const prev = out[out.length - 1];
    if (r.role === "assistant" && prev?.role === "assistant") {
      // Aynı yanıtın devamı (araç çağrısından sonra)
      prev.text = [prev.text, text].filter(Boolean).join("\n\n");
      prev.cards.push(...cards);
      for (const [url, title] of sources) if (!prev.sources.some((s) => s.url === url)) prev.sources.push({ url, title });
      continue;
    }
    out.push({ id: r.id, role: r.role, text, cards, sources: [...sources].map(([url, title]) => ({ url, title })) });
  }
  return out;
}

const MAX_HISTORY_ROWS = 60;

/** API'ye gönderilecek geçmiş. Uzunsa, bir kullanıcı metin mesajından başlayacak şekilde kırpılır. */
async function historyFor(conversationId: number): Promise<Anthropic.MessageParam[]> {
  let rows = await rowsFor(conversationId);
  if (rows.length > MAX_HISTORY_ROWS) {
    const tail = rows.slice(-MAX_HISTORY_ROWS);
    const start = tail.findIndex((r) => {
      if (r.role !== "user") return false;
      const c = JSON.parse(r.content) as string | Block[];
      return typeof c === "string" || !c.some((b) => b.type === "tool_result");
    });
    rows = start >= 0 ? tail.slice(start) : tail;
  }
  return rows.map((r) => ({ role: r.role, content: JSON.parse(r.content) }));
}

// ---- Sistem istemi ------------------------------------------------------------------

async function systemPrompt(): Promise<string> {
  return [
    "Sen \"Yatırım\" adlı kişisel yatırım uygulamasının Türkçe yapay zeka asistanısın. Tek bir kullanıcın var ve yatırıma yeni başlıyor.",
    "",
    "Nasıl konuşursun:",
    "- Her zaman Türkçe, sade ve kısa yaz. Teknik terimleri (ör. K/Z, ortalama maliyet, volatilite) ilk geçtiğinde bir cümleyle açıkla.",
    "- Sayıları Türkçe biçimde yaz (10.000 TL, %2,5).",
    "- Haber ya da güncel olay iddiasında bulunduğunda kaynağını (site adı ve bağlantı) mutlaka belirt. Kaynağın yoksa bunu açıkça söyle; asla uydurma.",
    "- RAKAM KURALI: Hiçbir fiyat, K/Z, yüzde, tutar ya da gösterge değerini kendi bilginden yazma. Her rakam bu turdaki bir araç sonucundan ya da aşağıdaki bağlam bloklarından gelmeli. Rakamı verirken veri zamanını da söyle (araç sonucundaki veri_zamani / fiyat_zamani alanı; örn. \"20.11.2026 15:40 itibarıyla\"). Aracı çağıramadıysan rakam verme, bunu söyle. Uygulama, araç sonuçlarında bulunmayan rakamları kullanıcıya \"doğrulanamayan rakam\" olarak işaretler.",
    "- Bir varlık hakkında analiz/yorum istenirse: kısa bir olumlu senaryo ve olumsuz senaryo yaz, güven düzeyini (düşük/orta/yüksek) belirt. Doğrudan \"al\" ya da \"sat\" deme; kararı kullanıcıya bırak.",
    "- Hiçbir şeyi garanti edilmiş öneri gibi sunma. Analiz, yorum ya da öneri içeren yanıtları kısa bir \"Bu bir yatırım tavsiyesi değildir.\" notuyla bitir.",
    "",
    "Araçlar ve işlemler:",
    "- Kullanıcının portföy, fiyat ve emir bilgilerini tahmin etme; araçlarla kontrol et.",
    "- Kullanıcı açıkça bir işlem istediğinde (sanal pozisyon aç, sanalı gerçeğe al, işlem ekle, emir ver, emri iptal et) ONAY SORMADAN ilgili aracı çağırıp işlemi yap. Uygulama yapılan işlemi kullanıcıya ayrıca kart olarak gösterir; sen de sonucu rakamlarla bir iki cümleyle özetle.",
    "- Talimat belirsizse tahmin etme, kısa bir soruyla netleştir. Örnekler: hangi varlık/pozisyon kastedildiği belli değilse; tutar ya da adet söylenmemişse; birden fazla eşleşen pozisyon ya da emir varsa; sembol bulunamıyorsa (önce search_symbol dene).",
    "- Portföy belirtilmemiş emir ve işlemlerde gerçek portföyü kullan ve yanıtında bunu belirt. 'Sanal' derse sanal portföyü kullan.",
    "- \"Sanaldaki X'i gerçeğe al\" denirse promote_sanal_to_gercek kullan. Kullanıcı ödediği fiyatı ya da adedi söylemediyse sanal adet ve güncel piyasa fiyatı kullanılır; bunu yanıtında belirt.",
    "- Emirlerde tetik fiyatı varlığın kendi fiyat biriminde olmalı: BIST ve gram altın TL, kripto ve yabancı hisse USD, döviz TL. Kullanıcı \"BTC 60.000$'a düşerse 5.000 TL'lik al\" derse: side=buy, condition=lte, trigger_price=60000, amount=5000, amount_currency=TRY.",
    "- Emirler yalnızca bu uygulamanın içinde gerçekleşir; aracı kuruma emir gitmez, gerçek para hareketi olmaz. Gerekirse bunu hatırlat.",
    "- Bir araç hata döndürürse hatayı sade dille açıkla ve ne yapılabileceğini söyle.",
    "- Güncel haber gerekiyorsa önce ÜCRETSİZ kaynaklara bak: get_headlines (RSS başlıkları), get_kap_disclosures (BIST) ve get_latest_news_report. web_search ücretlidir; yalnızca bunlar yetersizse kullan.",
    "- Kullanıcı \"haber ver\", \"uyar\", \"alarm kur\" derse create_alarm kullan (işlem yapmaz). \"al\"/\"sat\" derse emir (place_order) kullan.",
    "- Teknik analiz (RSI, MACD, hareketli ortalamalar, al/sat sinyali) sorulursa get_technical_signals kullan; göstergeleri sade dille açıkla ve teknik sinyallerin geleceği garanti etmediğini belirt.",
    "- Bir BIST hissesiyle ilgili güncel gelişme sorulursa önce aşağıdaki KAP bildirimlerine ve get_kap_disclosures aracına bak (ücretsiz, resmi kaynak); yetmezse web_search kullan. KAP bildirimini anlatırken bağlantısını ver.",
    "- Temettü (kâr payı) sorulursa list_dividends kullan. Temettü, şirketin kârından hissedarlara dağıttığı paradır; tutarlar brüttür, BIST'te stopaj kesilebilir.",
    "- Varlık türleri: fund = TEFAS yatırım fonu (fiyatı günde bir açıklanır), gold = altın (GRAM, CEYREK, YARIM, TAM, CUMHURIYET, ATA, BILEZIK22). Sikke altın fiyatı kuyumcu satış fiyatıdır; satarken alış fiyatı alınır (makas).",
    "",
    `Bugünün tarihi (İstanbul): ${todayIstanbul()}.`,
    ...await kapSystemLines(),
  ].join("\n");
}

/** Portföy / izleme listesi hisselerinin son 48 saatlik KAP bildirimleri (ücretsiz bağlam). */
async function kapSystemLines(): Promise<string[]> {
  try {
    const ctx = await kapContext([...(await tickersOfInterest()).keys()], 48, 3);
    if (ctx.size === 0) return [];
    const lines = [...ctx.entries()].slice(0, 12).flatMap(([t, items]) => items.map((x) => `- ${t}: ${x}`));
    return ["", "Son 48 saatin KAP bildirimleri (kullanıcının hisseleri; resmi kaynak):", ...lines];
  } catch {
    return [];
  }
}

// ---- Tur çalıştırma -------------------------------------------------------------------

const MAX_STEPS = 10;

/**
 * Kullanıcı mesajını işler: Claude'u akış modunda çağırır, araçları çalıştırır,
 * her şeyi kaydeder. Olaylar emit ile istemciye iletilir. Hata fırlatmaz.
 */
export async function runChatTurn(opts: {
  conversationId?: number | null;
  message: string;
  emit: (e: ChatEvent) => void;
  /** Claude istemcisi ya da sağlayıcı (testler); verilmezse Ayarlar'daki etkin sağlayıcı */
  client?: AiBackend;
  signal?: AbortSignal;
}): Promise<{ conversationId: number | null }> {
  const { emit } = opts;
  const text = opts.message.trim().slice(0, 8000);
  if (!text) {
    emit({ type: "error", message: "Mesaj boş." });
    emit({ type: "done" });
    return { conversationId: opts.conversationId ?? null };
  }

  let provider: AiProvider;
  try {
    provider = await getProvider(opts.client);
  } catch (err) {
    emit({ type: "error", message: aiErrorMessage(err) });
    emit({ type: "done" });
    return { conversationId: opts.conversationId ?? null };
  }

  let conversationId = opts.conversationId ?? null;
  if (conversationId != null && !(await getConversation(conversationId))) conversationId = null;
  const isNew = conversationId == null;
  if (conversationId == null) conversationId = await createConversation(text);
  emit({ type: "conversation", id: conversationId });

  const budget = await getBudgetStatus();
  if (budget.overBudget) {
    emit({
      type: "warning",
      message: `Bu ayki yapay zeka bütçesi doldu ($${budget.spentUsd.toFixed(2)} / $${budget.budgetUsd}). Sohbet yine de çalışır; otomatik taramalar durduruldu.`,
    });
  }

  await insertMessage(conversationId, "user", [{ type: "text", text }]);

  const { maxSearches } = await getAiSettings();
  const system = await systemPrompt();
  let turnText = "";
  let lastAssistantId: number | null = null;
  // Web araması bütün tur için sınırlıdır (her adımda kalan hak gönderilir).
  let searchesLeft = maxSearches;

  try {
    for (let step = 0; step < MAX_STEPS; step++) {
      const msg = await provider.chatStep({
        system,
        tools: CHAT_TOOLS,
        maxSearches: searchesLeft,
        messages: await historyFor(conversationId),
        signal: opts.signal,
        onText: (delta) => {
          turnText += delta;
          emit({ type: "text", delta });
        },
        onStatus: (name) => emit({ type: "status", text: `${toolLabel(name)}…` }),
      });
      searchesLeft = Math.max(0, searchesLeft - msg.usage.webSearches);

      if (msg.stop === "pause") {
        await insertMessage(conversationId, "assistant", msg.content);
        continue;
      }
      const toolUses = msg.toolCalls;
      if (toolUses.length === 0 || msg.stop === "refusal") {
        lastAssistantId = await insertMessage(conversationId, "assistant", msg.content.filter((b) => b.type !== "tool_use"));
        if (msg.stop === "refusal") emit({ type: "warning", message: "Yapay zeka bu isteği yanıtlamadı." });
        if (msg.stop === "max_tokens") emit({ type: "warning", message: "Yanıt uzunluk sınırına ulaştı ve kesildi." });
        break;
      }
      if (msg.stop === "max_tokens") {
        // Araç girdisi yarım kalmış olabilir: çalıştırma.
        await insertMessage(conversationId, "assistant", msg.content.filter((b) => b.type !== "tool_use"));
        emit({ type: "warning", message: "Yanıt uzunluk sınırına ulaştı; işlem yapılmadı. Lütfen tekrar deneyin." });
        break;
      }

      // Araçları sırayla çalıştır (değişiklikler birbirini etkileyebilir).
      const results: Anthropic.ToolResultBlockParam[] = [];
      const cards: ActionCard[] = [];
      for (const t of toolUses) {
        const outcome = await executeChatTool(t.name, t.input);
        results.push({ type: "tool_result", tool_use_id: t.id, content: JSON.stringify(outcome.result), is_error: outcome.isError || undefined });
        if (outcome.card) {
          cards.push(outcome.card);
          emit({ type: "card", card: outcome.card });
        }
      }
      await (await getDb()).tx(async () => {
        await insertMessage(conversationId, "assistant", msg.content);
        await insertMessage(conversationId, "user", results, cards);
      });
      if (step === MAX_STEPS - 1) emit({ type: "warning", message: "Çok fazla adım gerekti; yanıt burada durduruldu." });
    }
  } catch (err) {
    if (!opts.signal?.aborted) {
      console.error("[sohbet] hata", err);
      emit({ type: "error", message: aiErrorMessage(err) });
    }
    // İlk mesajda hiç yanıt alınamadıysa boş sohbeti geçmişte bırakma.
    if (isNew && !(await rowsFor(conversationId)).some((r) => r.role === "assistant")) {
      await deleteConversation(conversationId);
      emit({ type: "done" });
      return { conversationId: null };
    }
  }
  try {
    const warn = await verifyNumbers(conversationId, turnText, system);
    if (warn) {
      emit({ type: "card", card: warn });
      if (lastAssistantId != null) await (await getDb()).run("UPDATE chat_messages SET cards = ? WHERE id = ? AND user_id = ?", [JSON.stringify([warn]), lastAssistantId, await getCurrentUserId()]);
    }
  } catch (err) {
    console.warn("[sohbet] rakam kontrolü yapılamadı", err);
  }
  emit({ type: "done" });
  return { conversationId };
}
