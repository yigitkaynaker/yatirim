import fs from "node:fs";
import { NextResponse } from "next/server";
import { backupFilePath } from "@/lib/backup";
import { isOwner } from "@/lib/userContext";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ name: string }> };

/** GET /api/backups/:name — yedek dosyasını indirir */
export async function GET(_req: Request, ctx: Ctx) {
  // Dosya yedeği tüm veritabanını içerir: yalnızca sahip indirebilir.
  if (!(await isOwner().catch(() => false))) return NextResponse.json({ error: "Bu işlemi yalnızca uygulama sahibi yapabilir." }, { status: 403 });
  const name = decodeURIComponent((await ctx.params).name);
  const file = backupFilePath(name);
  if (!file) return NextResponse.json({ error: "Yedek bulunamadı." }, { status: 404 });
  const data = fs.readFileSync(file);
  return new NextResponse(new Uint8Array(data), {
    headers: {
      "Content-Type": "application/vnd.sqlite3",
      "Content-Disposition": `attachment; filename="${name}"`,
      "Content-Length": String(data.byteLength),
      "Cache-Control": "no-store",
    },
  });
}
