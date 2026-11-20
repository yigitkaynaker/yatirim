import { handle, notFound } from "@/lib/api";
import { parseInstrumentId } from "@/lib/assets";
import { getHeadlines } from "@/lib/freeNews";

export const dynamic = "force-dynamic";

/** GET /api/headlines?id=bist:THYAO[&ad=…] — ücretsiz RSS başlıkları (20 dk önbellekli) */
export async function GET(req: Request) {
  const sp = new URL(req.url).searchParams;
  const ref = parseInstrumentId(sp.get("id") ?? "");
  if (!ref) return notFound("Varlık bulunamadı.");
  return handle(() => getHeadlines(ref.type, ref.symbol, { name: sp.get("ad"), force: sp.get("force") === "1" }));
}
