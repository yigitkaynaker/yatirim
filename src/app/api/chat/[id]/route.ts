import { handle, notFound, parseId } from "@/lib/api";
import { deleteConversation, getConversation, getDisplayMessages } from "@/lib/chat";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

/** GET /api/chat/:id — sohbetin gösterilecek mesajları */
export async function GET(_req: Request, ctx: Ctx) {
  const id = parseId((await ctx.params).id);
  const conv = id ? await getConversation(id) : null;
  if (!id || !conv) return notFound("Sohbet bulunamadı.");
  return handle(async () => ({ conversation: conv, messages: await getDisplayMessages(id) }));
}

/** DELETE /api/chat/:id */
export async function DELETE(_req: Request, ctx: Ctx) {
  const id = parseId((await ctx.params).id);
  if (!id) return notFound("Sohbet bulunamadı.");
  return handle(async () => ((await deleteConversation(id)) ? { ok: true } : notFound("Sohbet bulunamadı.")));
}
