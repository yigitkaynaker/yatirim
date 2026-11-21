import type { NextRequest } from "next/server";
import * as actions from "@/lib/actions";
import { handle, parseId } from "@/lib/api";

export const dynamic = "force-dynamic";

/** GET /api/reports/yearly?hesap=<id> — yıllık gerçekleşen kazanç raporu */
export async function GET(req: NextRequest) {
  const raw = req.nextUrl.searchParams.get("hesap");
  return handle(() => actions.getYearlyReport({ account: raw ? parseId(raw) : null }));
}
