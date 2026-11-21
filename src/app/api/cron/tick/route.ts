import { after, NextResponse } from "next/server";
import { drainBackground } from "@/lib/background";
import { cronAuthorized, cronSource } from "@/lib/cron/auth";
import { tickGate } from "@/lib/cron/schedule";

// Nöbet: dış zamanlayıcı (cron-job.org her dakika, GitHub Actions 5 dk'da bir yedek) çağırır.
// GET ya da POST, "Authorization: Bearer $CRON_SECRET". Pencere dışındaki çağrılar
// veritabanına dokunmadan döner (Neon uyusun). ?force=1: pencereyi yok say (elle deneme).

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** Yanıtı en geç bu sürede ver (cron-job.org 30 sn'de zaman aşımına uğrar); iş after() ile sürer */
const RESPOND_WITHIN_MS = 20_000;

const g = globalThis as unknown as { __yatirimSlowRunAt?: number };

async function handle(req: Request) {
  if (!cronAuthorized(req)) return NextResponse.json({ error: "Yetkisiz." }, { status: 401 });
  const url = new URL(req.url);
  const now = Date.now();
  const gate = tickGate(now, { force: url.searchParams.get("force") === "1", lastSlowRunAt: g.__yatirimSlowRunAt ?? null });
  if (!gate.run) return NextResponse.json({ ok: true, skipped: gate.reason });
  if (gate.window === "slow") g.__yatirimSlowRunAt = now;

  const { runTick } = await import("@/lib/cron/runner");
  const work = runTick({ source: cronSource(req), now });
  const auth = req.headers.get("authorization") ?? "";
  // Yanıttan sonra: kalan iş, yavaş görevleri tetikleme ve arka plan işleri (bildirim gönderme).
  after(async () => {
    try {
      const r = await work;
      if (r.slowDue) {
        // Ayrı işlev çağrısı: /api/cron/slow hemen 202 döner, işi kendi after()'ında yapar.
        await fetch(new URL("/api/cron/slow", url.origin), { method: "POST", headers: { authorization: auth }, signal: AbortSignal.timeout(15_000) }).catch(
          (err: unknown) => console.warn("[nöbet] yavaş görevler tetiklenemedi", (err as Error).message),
        );
      }
    } catch {}
    await drainBackground(30_000);
  });
  let timer: ReturnType<typeof setTimeout> | undefined;
  const r = await Promise.race([work, new Promise<null>((res) => (timer = setTimeout(() => res(null), RESPOND_WITHIN_MS)))]).catch(
    (err: unknown) => ({ error: (err as Error)?.message ?? String(err) }),
  );
  clearTimeout(timer);
  if (r === null) return NextResponse.json({ ok: true, pending: true });
  if ("error" in r) return NextResponse.json({ ok: false, error: r.error }, { status: 500 });
  return NextResponse.json({ ok: true, ...r });
}

export const GET = handle;
export const POST = handle;
