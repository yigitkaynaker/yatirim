import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE, verifySessionToken } from "@/lib/auth";

// Giriş / kayıt sayfaları ve API'leri ve PWA dosyaları dışındaki her şey oturum ister. Oturum çerezi
// kullanıcı kimliğini taşır; veri kapsamlama sunucu tarafında yapılır (lib/userContext.ts).
// Nöbet uçları (/api/cron/tick, /api/cron/slow) çerez yerine kendi Bearer CRON_SECRET denetimini yapar.
const PUBLIC_PATHS = new Set(["/login", "/api/auth/login", "/register", "/api/auth/register", "/manifest.webmanifest", "/sw.js", "/offline.html", "/api/cron/tick", "/api/cron/slow"]);

// MCP sunucusu, OAuth uçları ve .well-known meta verileri kendi denetimlerini yapar (Bearer belirteç;
// /api/oauth/authorize oturumu kendisi ister ve gerekirse girişe yönlendirir).
function isSelfAuthPath(pathname: string): boolean {
  return pathname === "/api/mcp" || pathname.startsWith("/api/mcp/") || pathname.startsWith("/api/oauth/") || pathname.startsWith("/.well-known/");
}

export async function proxy(req: NextRequest) {
  const { pathname, search } = req.nextUrl;
  if (PUBLIC_PATHS.has(pathname) || isSelfAuthPath(pathname)) return NextResponse.next();

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
