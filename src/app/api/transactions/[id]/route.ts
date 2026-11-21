import * as actions from "@/lib/actions";
import { handle, notFound, parseId, readJson } from "@/lib/api";

type Ctx = { params: Promise<{ id: string }> };
const NF = "İşlem bulunamadı.";

export async function PUT(req: Request, ctx: Ctx) {
  const id = parseId((await ctx.params).id);
  if (!id) return notFound(NF);
  return handle(async () => {
    const tx = await actions.editTransaction(id, await readJson(req) as unknown as actions.AddTransactionParams);
    return tx ? { transaction: tx } : notFound(NF);
  });
}

export async function DELETE(_req: Request, ctx: Ctx) {
  const id = parseId((await ctx.params).id);
  if (!id) return notFound(NF);
  return handle(async () => ((await actions.removeTransaction(id)) ? { ok: true } : notFound(NF)));
}
