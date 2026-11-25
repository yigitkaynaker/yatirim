import { NextResponse } from "next/server";
import { checkPassword, createSessionToken, secureCookie, SESSION_COOKIE, SESSION_MAX_AGE_S } from "@/lib/auth";
import { clearLoginFailures, clientKey, currentFailures, failureDelayMs, LOCK_AFTER, recordLoginFailure } from "@/lib/loginThrottle";
import { authenticate } from "@/lib/users";
import { OWNER_USER_ID } from "@/lib/userContext";

// Giriş: e-posta + şifre (kayıtlı kullanıcılar) ya da e-posta boş + APP_PASSWORD (uygulama sahibi).
// Kaba kuvvet koruması: art arda hatalı denemelerde gecikme, çok sayıda hatada geçici kilit (IP başına,
// zamanla azalır). Sayaç veritabanındadır (bkz. lib/loginThrottle.ts); bulutta da tüm örnekler aynı
// sayacı görür. Hata mesajı e-postanın kayıtlı olup olmadığını söylemez.

export async function POST(req: Request) {
  const key = clientKey(req);

  let email = "";
  let password = "";
  try {
    const body = (await req.json()) as { email?: unknown; password?: unknown };
    email = typeof body.email === "string" ? body.email.trim() : "";
    password = typeof body.password === "string" ? body.password : "";
  } catch {
    return NextResponse.json({ error: "Geçersiz istek." }, { status: 400 });
  }

  try {
    if ((await currentFailures(key)) >= LOCK_AFTER) {
      return NextResponse.json({ error: "Çok fazla hatalı deneme. Birkaç dakika bekleyip tekrar deneyin." }, { status: 429 });
    }
  } catch {}

  let uid: number | null = null;
  if (!email) {
    // Sahip: e-posta boş, .env'deki APP_PASSWORD
    if (password && (await checkPassword(password))) uid = OWNER_USER_ID;
  } else {
    uid = (await authenticate(email, password))?.id ?? null;
  }

  if (uid == null) {
    let count = 1;
    try {
      count = await recordLoginFailure(key);
    } catch (err) {
      console.warn("[giriş] hatalı deneme kaydedilemedi", (err as Error)?.message);
    }
    await new Promise((r) => setTimeout(r, failureDelayMs(count)));
    return NextResponse.json({ error: email ? "E-posta ya da şifre hatalı." : "Şifre hatalı." }, { status: 401 });
  }

  try {
    await clearLoginFailures(key);
  } catch {}
  const res = NextResponse.json({ ok: true });
  res.cookies.set(SESSION_COOKIE, await createSessionToken(uid), {
    httpOnly: true,
    sameSite: "lax",
    secure: secureCookie(req),
    path: "/",
    maxAge: SESSION_MAX_AGE_S,
  });
  return res;
}
