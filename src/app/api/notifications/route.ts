import * as actions from "@/lib/actions";
import { handle } from "@/lib/api";

export const dynamic = "force-dynamic";

export async function GET() {
  return handle(async () => (await actions.listNotifications()));
}

/** POST /api/notifications — tümünü okundu işaretle */
export async function POST() {
  return handle(async () => {
    await actions.markNotificationsRead();
    return { ok: true };
  });
}
