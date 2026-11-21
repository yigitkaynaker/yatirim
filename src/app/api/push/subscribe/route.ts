import { handle, readJson } from "@/lib/api";
import { saveSubscription } from "@/lib/push";

export const dynamic = "force-dynamic";

/** POST /api/push/subscribe — tarayıcının PushSubscription.toJSON() çıktısı */
export async function POST(req: Request) {
  return handle(async () => (await saveSubscription(await readJson(req), req.headers.get("user-agent"))), 201);
}
