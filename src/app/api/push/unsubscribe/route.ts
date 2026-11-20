import { handle, readJson } from "@/lib/api";
import { removeSubscription } from "@/lib/push";

export const dynamic = "force-dynamic";

/** POST /api/push/unsubscribe — { endpoint } ya da { id } */
export async function POST(req: Request) {
  return handle(async () => {
    const b = await readJson(req);
    return { removed: removeSubscription({ endpoint: b.endpoint, id: b.id }) };
  });
}
