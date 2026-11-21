import * as actions from "@/lib/actions";
import { handle } from "@/lib/api";
import { isCloud } from "@/lib/db";

export const dynamic = "force-dynamic";

/** GET /api/backups — yedek listesi (en yeni önce). cloud: bulut modunda dosya yedeği yok (JSON kullanılır). */
export async function GET() {
  return handle(() => ({ backups: actions.listBackups(), cloud: isCloud() }));
}

/** POST /api/backups — şimdi yedekle */
export async function POST() {
  return handle(async () => ({ backup: await actions.createBackup() }), 201);
}
