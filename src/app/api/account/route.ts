import { NextResponse } from "next/server";
import { handle, readJson } from "@/lib/api";
import { clearLoginFailures, clientKey, currentFailures, failureDelayMs, LOCK_AFTER, recordLoginFailure } from "@/lib/loginThrottle";
import { getCurrentUserId, OWNER_USER_ID, requireOwner } from "@/lib/userContext";
import { changePassword, getUser, setCredentials } from "@/lib/users";

export const dynamic = "force-dynamic";

/** GET /api/account — oturumdaki kullanıcı (şifre özeti dönmez) */
export async function GET() {
  return handle(async () => ({ user: await getUser(await getCurrentUserId()) }));
}

/**
 * POST /api/account { email, password } — sahip, kendi hesabına giriş e-postası ve şifresi tanımlar
 * (APP_PASSWORD ile girmeye de devam edebilir).
 */
export async function POST(req: Request) {
  return handle(async () => {
    await requireOwner();
    const b = await readJson(req);
    return { user: await setCredentials(OWNER_USER_ID, b.email, b.password) };
  });
}

/**
 * PUT /api/account { currentPassword, newPassword } — şifre değiştir (her kullanıcı; sahipte mevcut şifre
 * olarak uygulama şifresi de geçer). Hatalı mevcut şifre giriş sayacına işlenir (IP başına, gecikme + kilit).
 */
export async function PUT(req: Request) {
  return handle(async () => {
    const key = clientKey(req);
    if ((await currentFailures(key)) >= LOCK_AFTER) {
      return NextResponse.json({ error: "Çok fazla hatalı deneme. Birkaç dakika bekleyip tekrar deneyin." }, { status: 429 });
    }
    const b = await readJson(req);
    if (!(await changePassword(await getCurrentUserId(), b.currentPassword, b.newPassword))) {
      const count = await recordLoginFailure(key).catch(() => 1);
      await new Promise((r) => setTimeout(r, failureDelayMs(count)));
      return NextResponse.json({ error: "Mevcut şifre hatalı." }, { status: 400 });
    }
    await clearLoginFailures(key).catch(() => {});
    return { ok: true };
  });
}
