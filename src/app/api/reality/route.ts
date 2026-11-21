import * as actions from "@/lib/actions";
import { handle } from "@/lib/api";

export const dynamic = "force-dynamic";

/** GET /api/reality — sanal portföy gerçeklik kontrolü */
export async function GET() {
  return handle(() => actions.getSanalRealityCheck());
}
