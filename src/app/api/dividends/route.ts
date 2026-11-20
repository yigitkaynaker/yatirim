import type { NextRequest } from "next/server";
import * as actions from "@/lib/actions";
import { handle, readJson } from "@/lib/api";
import { ValidationError } from "@/lib/portfolio";
import type { AssetType, Mode } from "@/lib/assets";

export const dynamic = "force-dynamic";

/**
 * GET /api/dividends — alınan temettüler (yıllara göre), öneriler, yaklaşanlar, hisse başına geçmiş.
 * ?only=suggestions → yalnızca onay bekleyen öneriler (portföy sayfası için, hafif).
 */
export async function GET(req: NextRequest) {
  if (req.nextUrl.searchParams.get("only") === "suggestions") {
    return handle(async () => ({ suggestions: await actions.getDividendSuggestions() }));
  }
  return handle(() => actions.getDividendOverview());
}

/** POST /api/dividends { action: "confirm" | "dismiss", mode, assetType, symbol, exDate, amount? } */
export async function POST(req: NextRequest) {
  return handle(async () => {
    const b = await readJson(req);
    const p = {
      mode: b.mode as Mode,
      assetType: b.assetType as AssetType,
      symbol: String(b.symbol ?? ""),
      exDate: String(b.exDate ?? ""),
    };
    if (b.action === "confirm") {
      return actions.confirmDividend({ ...p, amount: (b.amount as string | number | null | undefined) ?? null, note: typeof b.note === "string" ? b.note : null });
    }
    if (b.action === "dismiss") return actions.dismissDividend(p);
    throw new ValidationError("İşlem geçersiz.");
  });
}
