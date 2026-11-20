import type { NextRequest } from "next/server";
import * as actions from "@/lib/actions";
import { handle } from "@/lib/api";

export const dynamic = "force-dynamic";

/** GET /api/search?q=thy — sembol arama */
export async function GET(req: NextRequest) {
  const q = (req.nextUrl.searchParams.get("q") ?? "").slice(0, 60);
  return handle(async () => ({ results: await actions.searchSymbols(q) }));
}
