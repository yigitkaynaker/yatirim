import { handle, notFound } from "@/lib/api";
import { parseInstrumentId } from "@/lib/assets";
import { whyMoving } from "@/lib/dailySummary";

export const dynamic = "force-dynamic";

/** POST /api/why?id=bist:THYAO — "Neden hareket ediyor?" (ücretsiz RSS + KAP; varsa ucuz yapay zeka; 30 dk önbellek) */
export async function POST(req: Request) {
  const id = new URL(req.url).searchParams.get("id") ?? "";
  if (!parseInstrumentId(id)) return notFound("Varlık bulunamadı.");
  return handle(() => whyMoving(id));
}
