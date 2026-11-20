import { NextResponse } from "next/server";
import { checkPassword, createSessionToken, isSecureRequest, SESSION_COOKIE, SESSION_MAX_AGE_S } from "@/lib/auth";

// Basit kaba kuvvet koruması: art arda hatalı denemelerde gecikme.
const g = globalThis as unknown as { __yatirimLoginFails?: { count: number; last: number } };

export async function POST(req: Request) {
  const fails = (g.__yatirimLoginFails ??= { count: 0, last: 0 });
  if (Date.now() - fails.last > 15 * 60_000) fails.count = 0;

  let password = "";
  try {
    const body = (await req.json()) as { password?: unknown };
    password = typeof body.password === "string" ? body.password : "";
  } catch {
    return NextResponse.json({ error: "Geçersiz istek." }, { status: 400 });
  }

  if (!(await checkPassword(password))) {
    fails.count += 1;
    fails.last = Date.now();
    await new Promise((r) => setTimeout(r, Math.min(500 * fails.count, 5000)));
    return NextResponse.json({ error: "Şifre hatalı." }, { status: 401 });
  }

  fails.count = 0;
  const res = NextResponse.json({ ok: true });
  res.cookies.set(SESSION_COOKIE, await createSessionToken(), {
    httpOnly: true,
    sameSite: "lax",
    secure: isSecureRequest(req),
    path: "/",
    maxAge: SESSION_MAX_AGE_S,
  });
  return res;
}
