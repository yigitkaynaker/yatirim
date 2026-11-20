import type { NextRequest } from "next/server";
import * as actions from "@/lib/actions";
import { handle, readJson } from "@/lib/api";
import type { AssetType } from "@/lib/assets";

export const dynamic = "force-dynamic";

/** GET /api/watchlist — izleme listesi */
export async function GET() {
  return handle(() => ({ items: actions.listWatchlist() }));
}

/** POST /api/watchlist { assetType, symbol, name? } */
export async function POST(req: NextRequest) {
  return handle(async () => {
    const b = await readJson(req);
    return actions.addToWatchlist({
      assetType: b.assetType as AssetType,
      symbol: String(b.symbol ?? ""),
      name: typeof b.name === "string" ? b.name : null,
    });
  }, 201);
}
