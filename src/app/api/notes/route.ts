import * as actions from "@/lib/actions";
import { handle, readJson } from "@/lib/api";
import type { AssetType, Mode } from "@/lib/assets";

export const dynamic = "force-dynamic";

/** PUT /api/notes { mode, assetType, symbol, why?, exitPlan?, targetPrice?, stopPrice? } — pozisyon notu (boşsa silinir) */
export async function PUT(req: Request) {
  return handle(async () => {
    const b = await readJson(req);
    return {
      note: await actions.savePositionNote({
        mode: b.mode as Mode,
        assetType: b.assetType as AssetType,
        symbol: String(b.symbol ?? ""),
        why: typeof b.why === "string" ? b.why : null,
        exitPlan: typeof b.exitPlan === "string" ? b.exitPlan : null,
        targetPrice: (b.targetPrice as string | number | null | undefined) ?? null,
        stopPrice: (b.stopPrice as string | number | null | undefined) ?? null,
      }),
    };
  });
}

/** POST /api/notes { mode, assetType, symbol, which?: "target"|"stop"|"both" } — hedef / stop için alarm kurar */
export async function POST(req: Request) {
  return handle(async () => {
    const b = await readJson(req);
    const which = b.which === "target" || b.which === "stop" ? b.which : "both";
    return actions.createNoteAlarms({ mode: b.mode as Mode, assetType: b.assetType as AssetType, symbol: String(b.symbol ?? ""), which });
  }, 201);
}
