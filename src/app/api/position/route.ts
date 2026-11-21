import { NextResponse, type NextRequest } from "next/server";
import { handle, parseId } from "@/lib/api";
import { isMode, parseInstrumentId } from "@/lib/assets";
import * as actions from "@/lib/actions";

export const dynamic = "force-dynamic";

/** GET /api/position?mode=real|virtual&id=bist:THYAO&hesap=<id> — tek pozisyonun ayrıntısı (hesap yoksa birleşik) */
export async function GET(req: NextRequest) {
  const mode = req.nextUrl.searchParams.get("mode") ?? "real";
  const ref = parseInstrumentId(req.nextUrl.searchParams.get("id") ?? "");
  if (!isMode(mode) || !ref) return NextResponse.json({ error: "Geçersiz pozisyon." }, { status: 400 });
  const hesap = req.nextUrl.searchParams.get("hesap");
  return handle(() => actions.getPositionDetail(mode, { type: ref.type, symbol: ref.symbol }, { account: mode === "real" && hesap ? parseId(hesap) : null }));
}
