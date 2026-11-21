import { NextResponse } from "next/server";
import { exportAllData } from "@/lib/dataExport";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * GET /api/data/export — tüm veriler tek JSON dosyası (?onbellek=1: fiyat önbelleği dahil;
 * ?gizli=1: API anahtarı ve bildirim anahtarları dahil — varsayılan olarak dahil DEĞİL)
 */
export async function GET(req: Request) {
  try {
    const q = new URL(req.url).searchParams;
    const dump = await exportAllData({ includeCaches: q.get("onbellek") === "1", includeSecrets: q.get("gizli") === "1" });
    const day = new Date().toLocaleDateString("en-CA", { timeZone: "Europe/Istanbul" });
    return new NextResponse(JSON.stringify(dump), {
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Content-Disposition": `attachment; filename="yatirim-veri-${day}.json"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "Veriler hazırlanamadı." }, { status: 500 });
  }
}
