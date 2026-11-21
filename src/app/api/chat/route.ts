import { after } from "next/server";
import { handle, readJson } from "@/lib/api";
import { drainBackground } from "@/lib/background";
import { listConversations, runChatTurn, type ChatEvent } from "@/lib/chat";
import { getBudgetStatus, isAiConfigured } from "@/lib/aiClient";

export const dynamic = "force-dynamic";
// Yapay zeka araç döngüsü uzun sürebilir (bulut modunda işlev süre sınırı).
export const maxDuration = 300;

/** GET /api/chat — sohbet listesi ve yapay zeka durumu */
export async function GET() {
  return handle(async () => ({ configured: await isAiConfigured(), budget: await getBudgetStatus(), conversations: await listConversations() }));
}

/**
 * POST /api/chat — { conversationId?, message }
 * Yanıt: NDJSON akışı (her satır bir ChatEvent).
 */
export async function POST(req: Request) {
  let body: Record<string, unknown>;
  try {
    body = await readJson(req);
  } catch {
    return Response.json({ error: "Geçersiz istek." }, { status: 400 });
  }
  const message = typeof body.message === "string" ? body.message : "";
  const conversationId = Number.isInteger(body.conversationId) ? (body.conversationId as number) : null;
  const encoder = new TextEncoder();

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const emit = (e: ChatEvent) => {
        try {
          controller.enqueue(encoder.encode(JSON.stringify(e) + "\n"));
        } catch {
          // istemci bağlantıyı kapattı
        }
      };
      await runChatTurn({ conversationId, message, emit, signal: req.signal });
      try {
        controller.close();
      } catch {}
    },
  });
  // Akış bitince arka plan işleri (bildirim gönderme) tamamlansın (bulut modunda işlev donmasın).
  after(() => drainBackground(60_000));
  return new Response(stream, {
    headers: { "Content-Type": "application/x-ndjson; charset=utf-8", "Cache-Control": "no-store", "X-Accel-Buffering": "no" },
  });
}
