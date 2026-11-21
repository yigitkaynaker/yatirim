import * as actions from "@/lib/actions";
import { handle, notFound, parseId } from "@/lib/api";

type Ctx = { params: Promise<{ id: string }> };

/** DELETE /api/orders/:id — bekleyen emri iptal eder (kayıt silinmez). */
export async function DELETE(_req: Request, ctx: Ctx) {
  const id = parseId((await ctx.params).id);
  if (!id) return notFound("Emir bulunamadı.");
  return handle(async () => {
    const order = await actions.cancelOrder(id);
    return order ? { order } : notFound("Emir bulunamadı.");
  });
}
