import * as actions from "@/lib/actions";
import { handle } from "@/lib/api";

export const dynamic = "force-dynamic";

/** GET /api/signals — pozisyonlar (gerçek + sanal) ve izleme listesindeki varlıkların teknik sinyalleri */
export async function GET() {
  return handle(async () => ({ items: await actions.listTechnicalSignals() }));
}
