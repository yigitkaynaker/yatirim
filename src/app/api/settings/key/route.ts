import { handle, readJson } from "@/lib/api";
import { deleteApiKey, getApiKey, maskKey, saveApiKey } from "@/lib/settings";

export const dynamic = "force-dynamic";

/** POST /api/settings/key — { apiKey } Ayarlar'dan yapıştırılan anahtarı kaydeder. */
export async function POST(req: Request) {
  return handle(async () => {
    saveApiKey((await readJson(req)).apiKey);
    const { key, source } = getApiKey();
    return { key: { source, masked: maskKey(key) } };
  });
}

/** DELETE /api/settings/key — kayıtlı anahtarı siler (.env'deki anahtara dokunmaz). */
export async function DELETE() {
  return handle(() => {
    deleteApiKey();
    const { key, source } = getApiKey();
    return { key: { source, masked: maskKey(key) } };
  });
}
