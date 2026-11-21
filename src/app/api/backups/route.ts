import * as actions from "@/lib/actions";
import { handle } from "@/lib/api";

export const dynamic = "force-dynamic";

/** GET /api/backups — yedek listesi (en yeni önce) */
export async function GET() {
  return handle(() => ({ backups: actions.listBackups() }));
}

/** POST /api/backups — şimdi yedekle */
export async function POST() {
  return handle(() => ({ backup: actions.createBackup() }), 201);
}
