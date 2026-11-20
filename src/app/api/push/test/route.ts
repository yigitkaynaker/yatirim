import { handle } from "@/lib/api";
import { sendPushToAll } from "@/lib/push";

export const dynamic = "force-dynamic";

/** POST /api/push/test — tüm cihazlara deneme bildirimi */
export async function POST() {
  return handle(() => sendPushToAll({ title: "Yatırım", body: "Deneme bildirimi: bildirimler bu cihazda çalışıyor.", url: "/ayarlar", tag: "deneme" }));
}
