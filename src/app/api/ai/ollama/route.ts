import { handle } from "@/lib/api";
import { getOllamaClient } from "@/lib/aiClient";
import { listOllamaModels } from "@/lib/aiOllama";
import { requireOwner } from "@/lib/userContext";

export const dynamic = "force-dynamic";

/**
 * GET /api/ai/ollama — yerel modelin (Ollama) yüklü modelleri. YALNIZCA SAHİP: istek sahibin
 * kaydettiği adrese sunucudan gider. Ulaşılamazsa { models: [], error }.
 */
export async function GET() {
  return handle(async () => {
    await requireOwner();
    const c = await getOllamaClient();
    try {
      return { url: c.baseUrl, models: await listOllamaModels(c), error: null };
    } catch (err) {
      return { url: c.baseUrl, models: [], error: (err as Error).message };
    }
  });
}
