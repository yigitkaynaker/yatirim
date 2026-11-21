import { handle } from "@/lib/api";
import { getBudgetStatus, isAiConfigured } from "@/lib/aiClient";

export const dynamic = "force-dynamic";

/** GET /api/ai/status — anahtar var mı, bu ayki harcama */
export async function GET() {
  return handle(async () => ({ configured: await isAiConfigured(), budget: await getBudgetStatus() }));
}
