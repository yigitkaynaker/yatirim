import { NextResponse } from "next/server";
import { checkPassword, createSessionToken, secureCookie, SESSION_COOKIE, SESSION_MAX_AGE_S } from "@/lib/auth";
import { clearLoginFailures, clientKey, failureDelayMs, recordLoginFailure } from "@/lib/loginThrottle";

// Kaba kuvvet koruması: art arda hatalı denemelerde gecikme (IP başına, zamanla azalır).
// Sayaç veritabanındadır (bkz. lib/loginThrottle.ts); bulutta da tüm örnekler aynı sayacı görür.

export async function POST(req: Request) {
  const key = clientKey(req);

  let password = "";
  try {
    const body = (await req.json()) as { password?: unknown };
    password = typeof body.password === "string" ? body.password : "";
  } catch {
    return NextResponse.json({ error: "Geçersiz istek." }, { status: 400 });
  }

  if (!(await checkPassword(password))) {
    let count = 1;
    try {
      count = await recordLoginFailure(key);
    } catch (err) {
      console.warn("[giriş] hatalı deneme kaydedilemedi", (err as Error)?.message);
    }
    await new Promise((r) => setTimeout(r, failureDelayMs(count)));
    return NextResponse.json({ error: "Şifre hatalı." }, { status: 401 });
  }

  try {
    await clearLoginFailures(key);
  } catch {}
  const res = NextResponse.json({ ok: true });
  res.cookies.set(SESSION_COOKIE, await createSessionToken(), {
    httpOnly: true,
    sameSite: "lax",
    secure: secureCookie(req),
    path: "/",
    maxAge: SESSION_MAX_AGE_S,
  });
  return res;
}
