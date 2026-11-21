import * as actions from "@/lib/actions";
import { handle, readJson } from "@/lib/api";
import { isAssetType } from "@/lib/assets";
import { ValidationError } from "@/lib/portfolio";

export const dynamic = "force-dynamic";

/**
 * POST /api/import { text, mapping?, defaultAssetType?, defaultAccountId?, createAccounts?, commit? }
 * commit yoksa önizleme (hiçbir şey kaydedilmez); commit: true → atomik kayıt.
 */
export async function POST(req: Request) {
  return handle(async () => {
    const b = await readJson(req);
    if (typeof b.text !== "string" || !b.text.trim()) throw new ValidationError("Dosya içeriği boş.");
    if (b.text.length > 5_000_000) throw new ValidationError("Dosya çok büyük.");
    const opts: actions.ImportOptions = {
      mapping: b.mapping && typeof b.mapping === "object" ? (b.mapping as actions.ImportMapping) : undefined,
      defaultAssetType: isAssetType(b.defaultAssetType) ? b.defaultAssetType : undefined,
      defaultAccountId: typeof b.defaultAccountId === "number" ? b.defaultAccountId : null,
      createAccounts: b.createAccounts === true,
    };
    if (b.commit === true) return actions.importTransactions(b.text, opts);
    return { preview: actions.previewTransactionImport(b.text, opts) };
  });
}
