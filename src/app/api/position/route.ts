import { NextResponse, type NextRequest } from "next/server";
import { handle } from "@/lib/api";
import { isMode, parseInstrumentId } from "@/lib/assets";
import * as actions from "@/lib/actions";

export const dynamic = "force-dynamic";

/** GET /api/position?mode=real|virtual&id=bist:THYAO — tek pozisyonun ayrıntısı */
export async function GET(req: NextRequest) {
  const mode = req.nextUrl.searchParams.get("mode") ?? "real";
  const ref = parseInstrumentId(req.nextUrl.searchParams.get("id") ?? "");
  if (!isMode(mode) || !ref) return NextResponse.json({ error: "Geçersiz pozisyon." }, { status: 400 });
  return handle(() => actions.getPositionDetail(mode, { type: ref.type, symbol: ref.symbol }));
}
