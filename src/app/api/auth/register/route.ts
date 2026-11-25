import { NextResponse } from "next/server";
import { createSessionToken, secureCookie, SESSION_COOKIE, SESSION_MAX_AGE_S } from "@/lib/auth";
import { clientKey, recordLoginFailure, REGISTER_LIMIT } from "@/lib/loginThrottle";
import { ValidationError } from "@/lib/portfolio";
import { createUser } from "@/lib/users";

// Kayıt (herkese açık, onay yok). Başarılı kayıtta oturum açılır. Hız sınırı: IP başına her deneme
// (başarılı ya da değil) sayılır; art arda REGISTER_LIMIT denemeden sonra dakikada bir hak geri gelir.
// Sayaç giriş sayacıyla aynı tablodadır ("kayit:" önekli anahtar).

export async function POST(req: Request) {
  let body: { email?: unknown; password?: unknown; password2?: unknown };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Geçersiz istek." }, { status: 400 });
  }

  let count = 1;
  try {
    count = await recordLoginFailure(`kayit:${clientKey(req)}`);
  } catch (err) {
    console.warn("[kayıt] deneme kaydedilemedi", (err as Error)?.message);
  }
  if (count > REGISTER_LIMIT) {
    return NextResponse.json({ error: "Çok fazla kayıt denemesi. Birkaç dakika bekleyip tekrar deneyin." }, { status: 429 });
  }

  if (body.password2 !== undefined && body.password2 !== body.password) {
    return NextResponse.json({ error: "Şifreler aynı değil." }, { status: 400 });
  }

  let uid: number;
  try {
    uid = (await createUser(body.email, body.password)).id;
  } catch (err) {
    if (err instanceof ValidationError) return NextResponse.json({ error: err.message }, { status: 400 });
    console.error("[kayıt] hata", err);
    return NextResponse.json({ error: "Sunucu hatası. Biraz sonra tekrar deneyin." }, { status: 500 });
  }

  const res = NextResponse.json({ ok: true }, { status: 201 });
  res.cookies.set(SESSION_COOKIE, await createSessionToken(uid), {
    httpOnly: true,
    sameSite: "lax",
    secure: secureCookie(req),
    path: "/",
    maxAge: SESSION_MAX_AGE_S,
  });
  return res;
}
