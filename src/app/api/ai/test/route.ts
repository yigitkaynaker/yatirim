import { handle } from "@/lib/api";
import { testConnection } from "@/lib/aiClient";

export const dynamic = "force-dynamic";

/** POST /api/ai/test — küçük bir istekle anahtarı ve krediyi dener. */
export async function POST() {
  return handle(() => testConnection());
}
