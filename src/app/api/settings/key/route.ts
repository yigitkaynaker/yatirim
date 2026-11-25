import { handle, readJson } from "@/lib/api";
import { deleteApiKey, isAiProviderId, publicKeyState, saveApiKey, type AiProviderId } from "@/lib/settings";

export const dynamic = "force-dynamic";

const providerOf = (v: unknown): AiProviderId => (isAiProviderId(v) ? v : "anthropic");

// Anahtarlar kullanıcı başınadır: her kullanıcı yalnızca kendi anahtarını kaydeder / siler / (maskeli) görür.
// Sahibin anahtarı diğer kullanıcılara hiçbir biçimde dönmez (bkz. publicKeyState).
async function keyState(provider: AiProviderId) {
  return { provider, key: await publicKeyState(provider) };
}

/** POST /api/settings/key — { apiKey, provider? } Ayarlar'dan yapıştırılan anahtarı kaydeder (varsayılan: Claude). */
export async function POST(req: Request) {
  return handle(async () => {
    const body = await readJson(req);
    const provider = providerOf(body.provider);
    await saveApiKey(body.apiKey, provider);
    return keyState(provider);
  });
}

/** DELETE /api/settings/key?provider=openai — kayıtlı anahtarı siler (.env'deki anahtara dokunmaz). */
export async function DELETE(req: Request) {
  return handle(async () => {
    const provider = providerOf(new URL(req.url).searchParams.get("provider"));
    await deleteApiKey(provider);
    return keyState(provider);
  });
}
