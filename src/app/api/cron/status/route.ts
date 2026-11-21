import { handle } from "@/lib/api";
import { nobetStatus } from "@/lib/cron/runner";

export const dynamic = "force-dynamic";

/** GET /api/cron/status — "Son nöbet" durumu (Ayarlar) */
export async function GET() {
  return handle(() => nobetStatus());
}
