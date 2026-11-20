import { NextResponse, type NextRequest } from "next/server";
import * as actions from "@/lib/actions";
import { handle } from "@/lib/api";
import { parseInstrumentId } from "@/lib/assets";

export const dynamic = "force-dynamic";

/** GET /api/technical?id=bist:THYAO — teknik göstergeler, özet sinyal ve grafik katmanları */
export async function GET(req: NextRequest) {
  const ref = parseInstrumentId(req.nextUrl.searchParams.get("id") ?? "");
  if (!ref) return NextResponse.json({ error: "Geçersiz enstrüman." }, { status: 400 });
  return handle(async () => {
    try {
      return await actions.getTechnicalSignals(ref, { overlays: true });
    } catch (err) {
      console.warn("[teknik]", (err as Error).message);
      return NextResponse.json({ error: "Teknik analiz için fiyat verisi alınamadı." }, { status: 502 });
    }
  });
}
