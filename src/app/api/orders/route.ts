import * as actions from "@/lib/actions";
import { handle, readJson } from "@/lib/api";

export const dynamic = "force-dynamic";

export async function GET() {
  return handle(async () => ({ orders: await actions.listOrders() }));
}

/**
 * POST /api/orders — { mode, assetType, symbol, side, condition: "lte"|"gte", triggerPrice,
 *   entryBy: "amount"|"quantity", amount, amountCurrency | quantity, note }
 */
export async function POST(req: Request) {
  return handle(async () => {
    const body = await readJson(req) as unknown as actions.PlaceOrderParams & { entryBy?: string };
    if (body.entryBy === "quantity") delete body.amount;
    else delete body.quantity;
    return { order: await actions.placeOrder(body, "manuel") };
  }, 201);
}
