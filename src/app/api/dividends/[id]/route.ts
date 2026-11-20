import type { NextRequest } from "next/server";
import * as actions from "@/lib/actions";
import { handle, notFound, parseId, readJson } from "@/lib/api";

export const dynamic = "force-dynamic";

/** DELETE /api/dividends/:id — kaydı geri alır (gelir silinir / gizlenen öneri yeniden görünür) */
export async function DELETE(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const id = parseId((await ctx.params).id);
  if (id == null) return notFound();
  return handle(() => (actions.removeDividend(id) ? { ok: true } : notFound()));
}

/** PATCH /api/dividends/:id — { amount, note? } kaydedilmiş temettünün tutarını açıkça düzenler */
export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const id = parseId((await ctx.params).id);
  if (id == null) return notFound();
  return handle(async () => {
    const b = await readJson(req);
    const r = actions.editDividend(id, { amount: b.amount as string | number, note: typeof b.note === "string" ? b.note : undefined });
    return r ?? notFound();
  });
}
