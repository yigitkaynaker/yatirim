import { NextResponse } from "next/server";
import { checkPassword, createSessionToken, isSecureRequest, SESSION_COOKIE, SESSION_MAX_AGE_S } from "@/lib/auth";

// Basit kaba kuvvet koruması: art arda hatalı denemelerde gecikme. Sayaç istemci
// adresi (IP) başınadır; böylece bir başkasının hatalı denemeleri kullanıcının
// girişini yavaşlatmaz. Sayaç zamanla azalır (her DECAY_MS'de bir).
const DECAY_MS = 60_000;
const MAX_TRACKED = 1000;

interface FailState {
  count: number;
  last: number;
}

const g = globalThis as unknown as { __yatirimLoginFailsByIp?: Map<string, FailState> };
const fails = (g.__yatirimLoginFailsByIp ??= new Map());

/** İstemci adresi: proxy başlıkları (tailscale serve vb.), yoksa "yerel". */
function clientKey(req: Request): string {
  const xff = req.headers.get("x-forwarded-for");
  const first = xff?.split(",")[0]?.trim();
  return first || req.headers.get("x-real-ip")?.trim() || "yerel";
}

/** Zamanla azalmış güncel hatalı deneme sayısı */
function currentCount(key: string, now: number): number {
  const f = fails.get(key);
  if (!f) return 0;
  const count = Math.max(0, f.count - Math.floor((now - f.last) / DECAY_MS));
  if (count === 0) fails.delete(key);
  return count;
}

function recordFailure(key: string, now: number): number {
  const count = currentCount(key, now) + 1;
  fails.set(key, { count, last: now });
  if (fails.size > MAX_TRACKED) {
    for (const k of fails.keys()) {
      currentCount(k, now);
      if (fails.size <= MAX_TRACKED / 2) break;
    }
    // Hâlâ çoksa en eski kayıtları at (Map ekleme sırasını korur).
    for (const k of fails.keys()) {
      if (fails.size <= MAX_TRACKED) break;
      if (k !== key) fails.delete(k);
    }
  }
  return count;
}

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
    const count = recordFailure(key, Date.now());
    await new Promise((r) => setTimeout(r, Math.min(500 * count, 5000)));
    return NextResponse.json({ error: "Şifre hatalı." }, { status: 401 });
  }

  fails.delete(key);
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
