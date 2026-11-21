import * as actions from "@/lib/actions";
import { handle, notFound, parseId, readJson } from "@/lib/api";

type Ctx = { params: Promise<{ id: string }> };

/** DELETE /api/alarms/:id — alarmı siler */
export async function DELETE(_req: Request, ctx: Ctx) {
  const id = parseId((await ctx.params).id);
  if (!id) return notFound("Alarm bulunamadı.");
  return handle(async () => ((await actions.deleteAlarm(id)) ? { ok: true } : notFound("Alarm bulunamadı.")));
}

/** PATCH /api/alarms/:id — { active: boolean } */
export async function PATCH(req: Request, ctx: Ctx) {
  const id = parseId((await ctx.params).id);
  if (!id) return notFound("Alarm bulunamadı.");
  return handle(async () => {
    const body = await readJson(req);
    const alarm = await actions.setAlarmActive(id, !!body.active);
    return alarm ? { alarm } : notFound("Alarm bulunamadı.");
  });
}
