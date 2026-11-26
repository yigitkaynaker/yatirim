import { handle } from "@/lib/api";
import { testConnection } from "@/lib/aiProvider";
import { isAiProviderId } from "@/lib/settings";

export const dynamic = "force-dynamic";

/** POST /api/ai/test — { provider? } küçük bir istekle anahtarı ve krediyi (yerel modelde Ollama bağlantısını) dener (verilmezse etkin sağlayıcı). */
export async function POST(req: Request) {
  return handle(async () => {
    const body = (await req.json().catch(() => null)) as { provider?: unknown } | null;
    return testConnection(isAiProviderId(body?.provider) ? body.provider : undefined);
  });
}
