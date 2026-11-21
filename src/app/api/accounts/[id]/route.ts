import * as actions from "@/lib/actions";
import { handle, notFound, parseId, readJson } from "@/lib/api";

type Ctx = { params: Promise<{ id: string }> };

/** PATCH /api/accounts/:id { name?, feePct?, includeInTotal?, archived? } */
export async function PATCH(req: Request, ctx: Ctx) {
  const id = parseId((await ctx.params).id);
  if (!id) return notFound("Hesap bulunamadı.");
  return handle(async () => {
    const b = await readJson(req);
    const p: Parameters<typeof actions.updateAccount>[1] = {};
    if (b.name !== undefined) p.name = String(b.name);
    if (b.feePct !== undefined) p.feePct = b.feePct as string | number | null;
    if (b.includeInTotal !== undefined) p.includeInTotal = !!b.includeInTotal;
    if (b.archived !== undefined) p.archived = !!b.archived;
    const account = actions.updateAccount(id, p);
    return account ? { account } : notFound("Hesap bulunamadı.");
  });
}
