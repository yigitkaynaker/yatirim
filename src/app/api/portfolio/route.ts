import { NextResponse, type NextRequest } from "next/server";
import { isMode } from "@/lib/assets";
import * as actions from "@/lib/actions";
import { handle } from "@/lib/api";

export const dynamic = "force-dynamic";

/** GET /api/portfolio?mode=real|virtual — gerçek ve sanal toplamlar asla karışmaz. */
export async function GET(req: NextRequest) {
  const raw = req.nextUrl.searchParams.get("mode") ?? "real";
  if (!isMode(raw)) return NextResponse.json({ error: "Geçersiz mod." }, { status: 400 });
  return handle(() => actions.getPortfolioSummary(raw, { force: req.nextUrl.searchParams.get("force") === "1" }));
}
