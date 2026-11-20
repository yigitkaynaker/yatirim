import { handle } from "@/lib/api";
import { getVapidKeys, listSubscriptions } from "@/lib/push";

export const dynamic = "force-dynamic";

/** GET /api/push — VAPID açık anahtarı (ilk çağrıda üretilir) ve kayıtlı cihazlar */
export async function GET() {
  return handle(() => ({ publicKey: getVapidKeys().publicKey, devices: listSubscriptions() }));
}
