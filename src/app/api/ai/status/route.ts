import { handle } from "@/lib/api";
import { aiStatus, getBudgetStatus } from "@/lib/aiClient";

export const dynamic = "force-dynamic";

/** GET /api/ai/status — anahtar var mı, bu ayki harcama */
export async function GET() {
  return handle(async () => ({ ...(await aiStatus()), budget: await getBudgetStatus() }));
}
