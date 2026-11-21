import * as actions from "@/lib/actions";
import { handle } from "@/lib/api";
import { ValidationError } from "@/lib/portfolio";

export const dynamic = "force-dynamic";

/**
 * POST /api/backups/restore
 * - multipart/form-data, alan "file": yedeği yükler ve doğrular (henüz bir şey değişmez) → { token, check }
 * - JSON { token, confirm: "GERI YUKLE" }: hazırlanan yedeği geri yükler (önce mevcut veri yedeklenir)
 */
export async function POST(req: Request) {
  return handle(async () => {
    const type = req.headers.get("content-type") ?? "";
    if (type.startsWith("multipart/form-data")) {
      const form = await req.formData().catch(() => null);
      const file = form?.get("file");
      if (!file || typeof file === "string") throw new ValidationError("Dosya seçin.");
      return actions.stageRestore(new Uint8Array(await file.arrayBuffer()));
    }
    const b = (await req.json().catch(() => null)) as { token?: unknown; confirm?: unknown } | null;
    if (!b || typeof b.token !== "string") throw new ValidationError("Geçersiz istek.");
    if (b.confirm !== "GERI YUKLE") throw new ValidationError("Geri yükleme onaylanmadı.");
    const r = actions.restoreBackup(b.token);
    return { ok: true, before: r.before, check: r.check };
  });
}
