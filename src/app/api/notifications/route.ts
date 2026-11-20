import * as actions from "@/lib/actions";
import { handle } from "@/lib/api";

export const dynamic = "force-dynamic";

export async function GET() {
  return handle(() => actions.listNotifications());
}

/** POST /api/notifications — tümünü okundu işaretle */
export async function POST() {
  return handle(() => {
    actions.markNotificationsRead();
    return { ok: true };
  });
}
