import * as actions from "@/lib/actions";
import { handle, readJson } from "@/lib/api";

export const dynamic = "force-dynamic";

/** GET /api/alarms[?id=bist:THYAO] — alarmlar ve son çalanlar */
export async function GET(req: Request) {
  const instrument = new URL(req.url).searchParams.get("id") ?? undefined;
  return handle(() => ({ alarms: actions.listAlarms({ instrument }), events: instrument ? [] : actions.listAlarmEvents(30) }));
}

/** POST /api/alarms — { kind, scope?, assetType?, symbol?, mode?, direction?, threshold?, repeat?, cooldownMin?, note? } */
export async function POST(req: Request) {
  return handle(async () => {
    const body = (await readJson(req)) as unknown as actions.CreateAlarmParams;
    return { alarm: await actions.createAlarm(body, "manuel") };
  }, 201);
}
