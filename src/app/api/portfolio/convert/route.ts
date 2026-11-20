import * as actions from "@/lib/actions";
import { handle, readJson } from "@/lib/api";

/**
 * POST /api/portfolio/convert — "Gerçekten aldım".
 * Gövde: { assetType, symbol, quantity, price, currency, date, note }
 */
export async function POST(req: Request) {
  return handle(async () => ({
    transaction: actions.promoteSanalToGercek((await readJson(req)) as unknown as actions.PromoteParams),
  }), 201);
}
