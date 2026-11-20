import type { NextRequest } from "next/server";
import { isMode } from "@/lib/assets";
import * as actions from "@/lib/actions";
import { handle, readJson } from "@/lib/api";

export const dynamic = "force-dynamic";

/** GET /api/transactions?mode=real|virtual (mod verilmezse hepsi) */
export async function GET(req: NextRequest) {
  const mode = req.nextUrl.searchParams.get("mode");
  return handle(() => ({ transactions: actions.listTransactions(isMode(mode) ? mode : undefined) }));
}

/**
 * Normal işlem: { mode, assetType, symbol, side, quantity, price, currency, date, note }
 * Sanal hızlı giriş (canlı fiyatla): { mode: "virtual", entryBy: "amount" | "quantity",
 *   assetType, symbol, amount, amountCurrency | quantity, note }
 */
export async function POST(req: Request) {
  return handle(async () => {
    const body = await readJson(req);
    if (body.mode === "virtual" && body.entryBy) {
      const p = body as unknown as actions.SanalPositionParams & { entryBy: string };
      if (p.entryBy === "quantity") delete p.amount;
      else delete p.quantity;
      return { transaction: await actions.createSanalPosition(p) };
    }
    return { transaction: actions.addTransaction(body as unknown as actions.AddTransactionParams) };
  }, 201);
}
