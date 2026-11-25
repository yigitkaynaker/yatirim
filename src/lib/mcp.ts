import "server-only";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { CallToolRequestSchema, ListToolsRequestSchema, type CallToolResult, type Tool } from "@modelcontextprotocol/sdk/types.js";
import { getDb } from "./db";
import * as actions from "./actions";
import { isAssetType, isCurrency, normalizeSymbol } from "./assets";
import { CHAT_TOOLS, executeChatTool, isMutatingTool, type ToolOutcome } from "./chatTools";
import { getMcpSettings, type McpSettings } from "./settings";
import { unauthorized, verifyBearer, type BearerCheck } from "./oauth";
import { formatMoney } from "./format";
import { getCurrentUserId, runAsUser } from "./userContext";

// MCP SUNUCUSU (/api/mcp, Streamable HTTP, durumsuz)
// ChatGPT (Plugins › Add custom MCP server) ve Claude.ai özel bağlayıcıları uygulamayı buradan
// yönetir. Araçlar sohbet araçlarıyla aynıdır (aynı şemalar, aynı eylem katmanı). Okuma araçları
// readOnlyHint: true taşır; yazma araçları Türkçe açıklamalarında etkisini söyler ve ChatGPT bunlar
// için kullanıcıdan onay ister. Güvenlik: yazma araçlarında tutar denetimi ve çağrı başına üst
// sınır (Ayarlar), her çağrı mcp_calls tablosuna yazılır ("Son ChatGPT işlemleri").

const MCP_NOTE = "ChatGPT (MCP) ile";

const READ_TOOLS = [
  "get_portfolio_summary",
  "get_positions",
  "get_quote",
  "search_symbol",
  "list_orders",
  "list_alarms",
  "list_dividends",
  "get_kap_disclosures",
  "get_technical_signals",
  "get_latest_news_report",
  "get_headlines",
] as const;

const WRITE_TOOLS = ["create_sanal_position", "promote_sanal_to_gercek", "add_transaction", "place_order", "cancel_order", "create_alarm", "delete_alarm"] as const;

/** Yazma araçlarının etkisi (açıklamanın başına eklenir) ve başlıkları */
const WRITE_INFO: Record<(typeof WRITE_TOOLS)[number], { title: string; effect: string; destructive: boolean }> = {
  create_sanal_position: {
    title: "Sanal pozisyon aç",
    effect: "DEĞİŞİKLİK YAPAR: Uygulamadaki SANAL (hayali) portföye yeni bir pozisyon ekler. Gerçek para hareketi olmaz.",
    destructive: false,
  },
  promote_sanal_to_gercek: {
    title: "Sanalı gerçeğe al",
    effect: "DEĞİŞİKLİK YAPAR: Sanal pozisyonu arşivler ve kullanıcının GERÇEK portföy kaydına alış işlemi ekler. Aracı kuruma emir gitmez; yalnızca uygulamadaki kayıt değişir.",
    destructive: false,
  },
  add_transaction: {
    title: "İşlem ekle",
    effect: "DEĞİŞİKLİK YAPAR: Portföy kaydına (gerçek ya da sanal) alış/satış işlemi ekler; pozisyonlar ve K/Z buna göre değişir. Aracı kuruma emir gitmez.",
    destructive: false,
  },
  place_order: {
    title: "Emir ver",
    effect: "DEĞİŞİKLİK YAPAR: Uygulama içi koşullu emir oluşturur. Koşul sağlanınca işlem onay beklenmeden portföy kaydına eklenir. Aracı kurum yok, gerçek para hareketi yok.",
    destructive: false,
  },
  cancel_order: { title: "Emri iptal et", effect: "DEĞİŞİKLİK YAPAR: Bekleyen bir emri iptal eder (geri alınamaz).", destructive: true },
  create_alarm: { title: "Alarm kur", effect: "DEĞİŞİKLİK YAPAR: Bildirim alarmı kurar. Alarm işlem yapmaz, yalnızca bildirim gönderir.", destructive: false },
  delete_alarm: { title: "Alarmı sil", effect: "DEĞİŞİKLİK YAPAR: Bir alarmı kalıcı olarak siler.", destructive: true },
};

const READ_TITLES: Record<(typeof READ_TOOLS)[number], string> = {
  get_portfolio_summary: "Portföy özeti",
  get_positions: "Pozisyonlar",
  get_quote: "Canlı fiyat",
  search_symbol: "Sembol ara",
  list_orders: "Emirler",
  list_alarms: "Alarmlar",
  list_dividends: "Temettüler",
  get_kap_disclosures: "KAP bildirimleri",
  get_technical_signals: "Teknik sinyaller",
  get_latest_news_report: "Son haber raporu",
  get_headlines: "Haber başlıkları",
};

const POSITIONS_TOOL = {
  name: "get_positions",
  description: "Açık pozisyonları listeler (varlık, adet, ortalama maliyet, güncel fiyat, değer, K/Z). mode verilmezse gerçek ve sanal portföyün ikisi de döner.",
  input_schema: { type: "object" as const, properties: { mode: { type: "string", enum: ["real", "virtual"], description: "real: gerçek, virtual: sanal" } } },
};

const MCP_INSTRUCTIONS = [
  "Bu, kullanıcının kişisel yatırım uygulaması 'Yatırım'dır (tek kullanıcı, Türkçe). Aracı kurum bağlantısı yoktur; işlemler yalnızca uygulamadaki kayıtları değiştirir.",
  "Rakamları tahmin etme; araçlardan al ve veri zamanını (veri_zamani / fiyat_zamani) belirt.",
  "Portföy belirtilmemiş işlemlerde gerçek portföyü kullan ve bunu söyle; kullanıcı 'sanal' derse sanal portföyü kullan. Belirsizse önce sor.",
  "Yazma araçlarını yalnızca kullanıcı açıkça istediğinde çağır. Yanıtları sade Türkçe ver; analizler yatırım tavsiyesi değildir.",
].join(" ");

export function mcpToolList(s: McpSettings): Tool[] {
  const byName = new Map<string, { name: string; description?: string; input_schema: unknown }>(CHAT_TOOLS.map((t) => [t.name, t]));
  byName.set(POSITIONS_TOOL.name, POSITIONS_TOOL);
  const out: Tool[] = [];
  for (const name of READ_TOOLS) {
    const t = byName.get(name)!;
    out.push({
      name,
      title: READ_TITLES[name],
      description: t.description,
      inputSchema: t.input_schema as Tool["inputSchema"],
      annotations: { title: READ_TITLES[name], readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    });
  }
  if (s.allowWrites) {
    for (const name of WRITE_TOOLS) {
      const t = byName.get(name)!;
      const w = WRITE_INFO[name];
      out.push({
        name,
        title: w.title,
        description: `${w.effect} ${t.description ?? ""}`.trim(),
        inputSchema: t.input_schema as Tool["inputSchema"],
        annotations: { title: w.title, readOnlyHint: false, destructiveHint: w.destructive, idempotentHint: false, openWorldHint: false },
      });
    }
  }
  return out;
}

// ---- Güvenlik denetimi ---------------------------------------------------------------------

type Input = Record<string, unknown>;

async function fxToTry(cur: string | null | undefined): Promise<number | null> {
  if (!cur || cur === "TRY") return 1;
  const [q] = await actions.getPrices([{ type: "fx", symbol: cur }]);
  return q?.price != null && q.price > 0 ? q.price : null;
}

async function livePrice(i: Input): Promise<{ price: number; currency: string } | null> {
  if (!isAssetType(i.asset_type)) return null;
  const symbol = normalizeSymbol(i.asset_type, String(i.symbol ?? ""));
  if (!symbol) return null;
  const [q] = await actions.getPrices([{ type: i.asset_type, symbol }]);
  return q?.price != null && q.price > 0 ? { price: q.price, currency: q.currency } : null;
}

const NUMERIC = ["amount", "quantity", "price", "trigger_price", "fee", "fee_pct", "threshold", "cooldown_min"] as const;

/** Yazma aracı girdisinin tahmini TL karşılığı (hesaplanamıyorsa null) */
async function estimateTry(name: string, i: Input): Promise<number | null> {
  const n = (k: string) => (typeof i[k] === "number" ? (i[k] as number) : null);
  const viaAmount = async () => {
    const fx = await fxToTry(isCurrency(i.amount_currency) ? i.amount_currency : "TRY");
    return fx != null ? n("amount")! * fx : null;
  };
  switch (name) {
    case "create_sanal_position": {
      if (n("amount") != null) return viaAmount();
      const q = n("quantity");
      const lp = await livePrice(i);
      if (q == null || !lp) return null;
      const fx = await fxToTry(lp.currency);
      return fx != null ? q * lp.price * fx : null;
    }
    case "add_transaction": {
      const fx = await fxToTry(isCurrency(i.currency) ? i.currency : null);
      return fx != null && n("quantity") != null && n("price") != null ? n("quantity")! * n("price")! * fx : null;
    }
    case "place_order": {
      if (n("amount") != null) return viaAmount();
      const q = n("quantity");
      const lp = await livePrice(i);
      if (q == null || n("trigger_price") == null || !lp) return null;
      const fx = await fxToTry(lp.currency);
      return fx != null ? q * n("trigger_price")! * fx : null;
    }
    case "promote_sanal_to_gercek": {
      const virtual = await actions.getPortfolioSummary("virtual");
      const sym = isAssetType(i.asset_type) ? normalizeSymbol(i.asset_type, String(i.symbol ?? "")) : "";
      const h = virtual.holdings.find((x) => x.assetType === i.asset_type && x.symbol === sym);
      if (!h) return 0; // pozisyon yok: araç kendi hatasını verir
      const q = n("quantity") ?? h.quantity;
      let price = n("price");
      let cur: string | null = isCurrency(i.currency) ? i.currency : h.currency;
      if (price == null) {
        const lp = await livePrice(i);
        if (!lp) return h.valueTry ?? null;
        price = lp.price;
        cur = lp.currency;
      }
      const fx = await fxToTry(cur);
      return fx != null ? q * price * fx : null;
    }
    default:
      return 0; // tutarsız araçlar (iptal, alarm)
  }
}

/** Yazma aracını çalıştırmadan önce: izin, sayı doğrulaması ve tutar sınırı. Hata mesajı ya da null. */
export async function guardWrite(name: string, i: Input, s: McpSettings): Promise<string | null> {
  if (!s.allowWrites) return "Ayarlar'da ChatGPT bağlantısının işlem yapması kapalı. Yalnızca okuma araçları kullanılabilir.";
  for (const k of NUMERIC) {
    if (i[k] === undefined || i[k] === null) continue;
    if (typeof i[k] !== "number" || !Number.isFinite(i[k] as number)) return `${k} bir sayı olmalı.`;
    if (k !== "threshold" && (i[k] as number) < 0) return `${k} negatif olamaz.`;
    if (["amount", "quantity", "price", "trigger_price"].includes(k) && (i[k] as number) <= 0) return `${k} sıfırdan büyük olmalı.`;
  }
  const value = await estimateTry(name, i);
  if (value == null) return "İşlemin TL karşılığı doğrulanamadı (fiyat ya da kur alınamadı). Tutarı TRY olarak belirtip tekrar deneyin.";
  if (value > s.maxAmountTry) {
    return `Bu işlem yaklaşık ${formatMoney(value, "TRY")}; ChatGPT için çağrı başına sınır ${formatMoney(s.maxAmountTry, "TRY")} (Ayarlar › ChatGPT bağlantısı). Daha küçük bir tutar deneyin ya da işlemi uygulamadan yapın.`;
  }
  return null;
}

// ---- Çalıştırma ve günlük -------------------------------------------------------------------

async function logCall(client: string, tool: string, input: unknown, ok: boolean, write: boolean, summary: string) {
  const db = await getDb();
  const now = Date.now();
  await db.run("INSERT INTO mcp_calls (user_id, client, tool, input, ok, is_write, summary, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)", [
    await getCurrentUserId(),
    client,
    tool,
    JSON.stringify(input ?? {}).slice(0, 2000),
    ok ? 1 : 0,
    write ? 1 : 0,
    summary.slice(0, 500),
    now,
  ]);
  if (Math.random() < 0.05) await db.run("DELETE FROM mcp_calls WHERE created_at < ?", [now - 90 * 24 * 3600_000]);
}

async function positionsOutcome(i: Input): Promise<ToolOutcome> {
  const modes = i.mode === "real" || i.mode === "virtual" ? [i.mode] : ["real", "virtual"];
  const result: Record<string, unknown> = {};
  for (const mode of modes) {
    const o = await executeChatTool("get_portfolio_summary", { mode });
    if (o.isError) return o;
    const r = o.result as { veri_zamani?: string; pozisyonlar?: unknown[] };
    result[mode === "real" ? "gercek" : "sanal"] = { veri_zamani: r.veri_zamani, pozisyonlar: r.pozisyonlar };
  }
  return { result };
}

/** Bir MCP araç çağrısı: denetim, çalıştırma, günlük. */
export async function callMcpTool(name: string, rawArgs: unknown, auth: Extract<BearerCheck, { ok: true }>): Promise<CallToolResult> {
  const args = (rawArgs && typeof rawArgs === "object" ? rawArgs : {}) as Input;
  const s = await getMcpSettings();
  const known = (READ_TOOLS as readonly string[]).includes(name) || (WRITE_TOOLS as readonly string[]).includes(name);
  const write = isMutatingTool(name);
  const fail = async (message: string): Promise<CallToolResult> => {
    await logCall(auth.clientLabel, name, args, false, write, message);
    return { content: [{ type: "text", text: JSON.stringify({ hata: message }) }], isError: true };
  };
  if (!known) return fail(`Bilinmeyen araç: ${name}`);
  if (write) {
    const blocked = await guardWrite(name, args, s);
    if (blocked) return fail(blocked);
  }
  const outcome = name === "get_positions" ? await positionsOutcome(args) : await executeChatTool(name, args, { note: MCP_NOTE });
  const card = outcome.card;
  const summary = card ? [card.title, ...card.lines].join(" · ") : outcome.isError ? String((outcome.result as { hata?: string })?.hata ?? "Hata") : "Okundu";
  await logCall(auth.clientLabel, name, args, !outcome.isError, write, summary);
  const text = JSON.stringify(outcome.result);
  return {
    content: [{ type: "text", text: card ? `${card.title}\n${card.lines.join("\n")}\n\n${text}` : text }],
    ...(outcome.result && typeof outcome.result === "object" && !Array.isArray(outcome.result) ? { structuredContent: outcome.result as Record<string, unknown> } : {}),
    isError: outcome.isError || undefined,
  };
}

export interface McpCallLog {
  id: number;
  client: string | null;
  tool: string;
  ok: boolean;
  write: boolean;
  summary: string | null;
  createdAt: number;
}

export async function recentMcpCalls(limit = 20): Promise<McpCallLog[]> {
  const rows = await (await getDb()).all<{ id: number; client: string | null; tool: string; ok: number; is_write: number; summary: string | null; created_at: number }>(
    "SELECT id, client, tool, ok, is_write, summary, created_at FROM mcp_calls WHERE user_id = ? ORDER BY id DESC LIMIT ?",
    [await getCurrentUserId(), limit],
  );
  return rows.map((r) => ({ id: r.id, client: r.client, tool: r.tool, ok: r.ok === 1, write: r.is_write === 1, summary: r.summary, createdAt: r.created_at }));
}

// ---- HTTP ucu ------------------------------------------------------------------------------

/** /api/mcp — her istek kendi (durumsuz) sunucu + aktarım nesnesiyle işlenir. */
export async function handleMcpRequest(req: Request): Promise<Response> {
  const auth = await verifyBearer(req);
  if (!auth.ok) return unauthorized(req, auth.error, auth.description);
  // Belirtecin sahibi kullanıcının bağlamında: tüm araçlar yalnızca onun verisini görür / değiştirir.
  return runAsUser(auth.userId, () => handleAuthorized(req, auth));
}

async function handleAuthorized(req: Request, auth: Extract<BearerCheck, { ok: true }>): Promise<Response> {
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ jsonrpc: "2.0", error: { code: -32000, message: "Bu sunucu yalnızca POST destekler (durumsuz)." }, id: null }), {
      status: 405,
      headers: { "Content-Type": "application/json", Allow: "POST" },
    });
  }
  const settings = await getMcpSettings();
  const server = new Server({ name: "yatirim", title: "Yatırım", version: "1.0.0" }, { capabilities: { tools: {} }, instructions: MCP_INSTRUCTIONS });
  server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: mcpToolList(settings) }));
  server.setRequestHandler(CallToolRequestSchema, async (r) => callMcpTool(r.params.name, r.params.arguments, auth));
  const transport = new WebStandardStreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });
  await server.connect(transport);
  try {
    return await transport.handleRequest(req);
  } finally {
    void server.close().catch(() => {});
  }
}
