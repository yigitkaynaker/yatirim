import { handle } from "@/lib/api";
import { getMarketMood } from "@/lib/analytics";

export const dynamic = "force-dynamic";

/** GET /api/mood — kripto Korku & Açgözlülük endeksi (alternative.me; günde bir kez çekilir) */
export async function GET() {
  return handle(async () => ({ mood: await getMarketMood() }));
}
