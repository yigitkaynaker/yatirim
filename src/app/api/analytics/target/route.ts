import { handle, readJson } from "@/lib/api";
import { setTargetAllocation } from "@/lib/analytics";

/** PUT /api/analytics/target — { bist: 40, gold: 20, … } (toplam 100); {} hedefi siler */
export async function PUT(req: Request) {
  return handle(async () => ({ target: setTargetAllocation(await readJson(req)) }));
}
