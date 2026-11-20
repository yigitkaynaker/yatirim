import { handle, notFound } from "@/lib/api";
import { isMode, parseInstrumentId } from "@/lib/assets";
import { getBenchmark, getPositionBenchmark, getRisk } from "@/lib/analytics";

export const dynamic = "force-dynamic";

/**
 * GET /api/analytics?mode=real — kıyaslama + risk
 * GET /api/analytics?mode=real&id=bist:THYAO — pozisyon için "aldığımdan beri" kıyaslama
 */
export async function GET(req: Request) {
  const sp = new URL(req.url).searchParams;
  const mode = sp.get("mode");
  if (!isMode(mode)) return notFound("Portföy bulunamadı.");
  const id = sp.get("id");
  if (id) {
    const ref = parseInstrumentId(id);
    if (!ref) return notFound("Varlık bulunamadı.");
    return handle(async () => ({ position: await getPositionBenchmark(mode, ref.type, ref.symbol) }));
  }
  return handle(async () => {
    const [benchmark, risk] = await Promise.all([getBenchmark(mode), getRisk(mode)]);
    return { benchmark, risk };
  });
}
