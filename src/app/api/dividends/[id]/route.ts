import type { NextRequest } from "next/server";
import * as actions from "@/lib/actions";
import { handle, notFound, parseId } from "@/lib/api";

export const dynamic = "force-dynamic";

/** DELETE /api/dividends/:id — kaydı geri alır (gelir silinir / gizlenen öneri yeniden görünür) */
export async function DELETE(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const id = parseId((await ctx.params).id);
  if (id == null) return notFound();
  return handle(() => (actions.removeDividend(id) ? { ok: true } : notFound()));
}
