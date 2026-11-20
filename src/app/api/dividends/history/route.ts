import { NextResponse, type NextRequest } from "next/server";
import * as actions from "@/lib/actions";
import { handle } from "@/lib/api";
import { parseInstrumentId, supportsDividends } from "@/lib/assets";

export const dynamic = "force-dynamic";

/** GET /api/dividends/history?id=bist:THYAO — hissenin temettü geçmişi ve bu hisse için kayıtlar */
export async function GET(req: NextRequest) {
  const ref = parseInstrumentId(req.nextUrl.searchParams.get("id") ?? "");
  if (!ref || !supportsDividends(ref.type)) return NextResponse.json({ error: "Geçersiz enstrüman." }, { status: 400 });
  return handle(async () => {
    const [history, suggestions] = await Promise.all([actions.getDividendHistory(ref), actions.getDividendSuggestions()]);
    const records = actions.listDividends({ status: "confirmed" }).filter((d) => d.assetType === ref.type && d.symbol === ref.symbol);
    return { history, records, suggestions: suggestions.filter((s) => s.assetType === ref.type && s.symbol === ref.symbol) };
  });
}
