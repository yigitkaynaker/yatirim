import { NextResponse, type NextRequest } from "next/server";
import { isMode } from "@/lib/assets";
import * as actions from "@/lib/actions";
import { handle, parseId } from "@/lib/api";

export const dynamic = "force-dynamic";

/** GET /api/portfolio?mode=real|virtual&hesap=<id> — gerçek ve sanal toplamlar asla karışmaz. hesap yoksa "toplama dahil" hesaplar. */
export async function GET(req: NextRequest) {
  const raw = req.nextUrl.searchParams.get("mode") ?? "real";
  if (!isMode(raw)) return NextResponse.json({ error: "Geçersiz mod." }, { status: 400 });
  const hesap = req.nextUrl.searchParams.get("hesap");
  return handle(() =>
    actions.getPortfolioSummary(raw, { force: req.nextUrl.searchParams.get("force") === "1", account: raw === "real" && hesap ? parseId(hesap) : null }),
  );
}
