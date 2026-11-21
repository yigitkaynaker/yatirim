import { handle, readJson } from "@/lib/api";
import { importAllData } from "@/lib/dataExport";
import { ValidationError } from "@/lib/portfolio";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * POST /api/data/import — { confirm: "GERI YUKLE", data: <indirilen JSON> }
 * Mevcut verilerin YERİNE geçer. Vercel'de istek gövdesi en fazla ~4,5 MB olabilir;
 * daha büyük dosyalar için "npm run tasi:neon" kullanın (BULUT.md).
 */
export async function POST(req: Request) {
  return handle(async () => {
    const b = await readJson(req);
    if (b.confirm !== "GERI YUKLE") throw new ValidationError("Geri yükleme onaylanmadı.");
    return { ok: true, ...(await importAllData(b.data)) };
  });
}
