import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE, verifySessionToken } from "@/lib/auth";

// Giriş sayfası, giriş API'si ve PWA dosyaları dışındaki her şey oturum ister.
// Nöbet uçları (/api/cron/tick, /api/cron/slow) çerez yerine kendi Bearer CRON_SECRET denetimini yapar.
const PUBLIC_PATHS = new Set(["/login", "/api/auth/login", "/manifest.webmanifest", "/sw.js", "/offline.html", "/api/cron/tick", "/api/cron/slow"]);

export async function proxy(req: NextRequest) {
  const { pathname, search } = req.nextUrl;
  if (PUBLIC_PATHS.has(pathname)) return NextResponse.next();

  const ok = await verifySessionToken(req.cookies.get(SESSION_COOKIE)?.value);
  if (ok) return NextResponse.next();

  if (pathname.startsWith("/api/")) {
    return NextResponse.json({ error: "Oturum gerekli." }, { status: 401 });
  }
  const url = req.nextUrl.clone();
  url.pathname = "/login";
  url.search = pathname !== "/" ? `?next=${encodeURIComponent(pathname + search)}` : "";
  return NextResponse.redirect(url);
}

export const config = {
  // Next iç dosyaları, ikonlar ve favicon hariç tüm yollar
  matcher: ["/((?!_next/static|_next/image|icons/|favicon.ico|icon.png|apple-icon.png).*)"],
};
