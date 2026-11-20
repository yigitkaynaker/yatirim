import { NextResponse, type NextRequest } from "next/server";
import * as actions from "@/lib/actions";
import { handle } from "@/lib/api";
import { parseInstrumentId } from "@/lib/assets";
import { isChartRange } from "@/lib/market";

export const dynamic = "force-dynamic";

/** GET /api/chart?id=bist:THYAO&range=1A — fiyat grafiği verisi */
export async function GET(req: NextRequest) {
  const ref = parseInstrumentId(req.nextUrl.searchParams.get("id") ?? "");
  if (!ref) return NextResponse.json({ error: "Geçersiz enstrüman." }, { status: 400 });
  const range = req.nextUrl.searchParams.get("range") ?? "1A";
  if (!isChartRange(range)) return NextResponse.json({ error: "Geçersiz aralık." }, { status: 400 });
  return handle(async () => {
    try {
      return await actions.getPriceChart(ref, range);
    } catch (err) {
      console.warn("[grafik]", (err as Error).message);
      return NextResponse.json({ error: "Grafik verisi alınamadı." }, { status: 502 });
    }
  });
}
