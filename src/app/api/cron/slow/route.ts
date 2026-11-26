import { after, NextResponse } from "next/server";
import { drainBackground } from "@/lib/background";
import { cronAuthorized } from "@/lib/cron/auth";

// Yavaş nöbet görevleri (zamanlanmış haber analizi, günlük özet, teknik sinyaller, sembol kataloğu).
// /api/cron/tick tetikler; hemen 202 döner, iş yanıttan sonra (en fazla maxDuration) sürer.
// Görev kilitleri çift çalışmayı engeller. ?bekle=1: işi bitirip sonucu döndür (deneme için).

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

async function handle(req: Request) {
  if (!cronAuthorized(req)) return NextResponse.json({ error: "Yetkisiz." }, { status: 401 });
  const { runSlow } = await import("@/lib/cron/runner");
  if (new URL(req.url).searchParams.get("bekle") === "1") {
    const tasks = await runSlow();
    await drainBackground(30_000);
    return NextResponse.json({ ok: true, tasks });
  }
  after(async () => {
    try {
      const tasks = await runSlow();
      if (Object.keys(tasks).length) console.log("[nöbet] yavaş görevler", tasks);
    } catch (err) {
      console.error("[nöbet] yavaş görev hatası", err);
    }
    await drainBackground(60_000);
  });
  return NextResponse.json({ ok: true, started: true }, { status: 202 });
}

export const GET = handle;
export const POST = handle;
