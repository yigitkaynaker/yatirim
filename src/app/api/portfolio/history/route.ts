import { NextResponse, type NextRequest } from "next/server";
import { isMode } from "@/lib/assets";
import * as actions from "@/lib/actions";
import { handle } from "@/lib/api";

export const dynamic = "force-dynamic";

/** GET /api/portfolio/history?mode=real|virtual — günlük değer geçmişi */
export async function GET(req: NextRequest) {
  const mode = req.nextUrl.searchParams.get("mode") ?? "real";
  if (!isMode(mode)) return NextResponse.json({ error: "Geçersiz mod." }, { status: 400 });
  return handle(async () => ({ mode, points: await actions.getPortfolioHistory(mode) }));
}
