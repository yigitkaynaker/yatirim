"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { NotificationBell } from "./NotificationBell";

// Gezinme öğeleri. Masaüstünde üst menü, küçük ekranda alt sekme çubuğu.
// short: alt çubukta sığması için kısa ad. Yeni sayfa için buraya satır eklemek yeterli.
const NAV = [
  { href: "/", label: "Portföy", short: "Portföy", icon: "M3 13h4v8H3zM10 8h4v13h-4zM17 3h4v18h-4z" },
  { href: "/piyasa", label: "Piyasa", short: "Piyasa", icon: "M3 17l5-5 4 4 8-9M14 7h6v6" },
  { href: "/islemler", label: "İşlemler", short: "İşlemler", icon: "M4 6h16M4 12h16M4 18h10" },
  { href: "/emirler", label: "Emirler", short: "Emirler", icon: "M12 3v18M5 10l7-7 7 7M5 21h14" },
  { href: "/hesaplayicilar", label: "Hesaplayıcılar", short: "Hesapla", icon: "M6 3h12a1 1 0 0 1 1 1v16a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1zM8 7h8M8 12h2M14 12h2M8 16h2M14 16h2" },
  { href: "/sohbet", label: "Sohbet", short: "Sohbet", icon: "M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.6A8 8 0 1 1 21 12z" },
] as const;

function isActive(pathname: string, href: string) {
  return href === "/" ? pathname === "/" : pathname.startsWith(href);
}

function NavIcon({ d }: { d: string }) {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d={d} />
    </svg>
  );
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" }).catch(() => {});
    window.location.assign(new URL("/login", window.location.origin));
  }

  return (
    <div className="min-h-dvh">
      <header className="pt-safe sticky top-0 z-30 border-b border-line/70 bg-bg/85 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-6xl items-center gap-6 px-4 md:px-6">
          <Link href="/" className="flex items-center gap-2 font-semibold tracking-tight">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/icons/icon-192.png" alt="" width={28} height={28} className="rounded-lg" />
            Yatırım
          </Link>
          <nav className="hidden items-center gap-1 md:flex">
            {NAV.map((n) => (
              <Link
                key={n.href}
                href={n.href}
                className={`rounded-lg px-3 py-1.5 text-sm transition ${
                  isActive(pathname, n.href) ? "bg-surface-2 text-white" : "text-slate-400 hover:text-white"
                }`}
              >
                {n.label}
              </Link>
            ))}
          </nav>
          <div className="ml-auto flex items-center gap-1">
            <NotificationBell />
            <button onClick={logout} className="rounded-lg px-3 py-1.5 text-sm text-slate-400 hover:text-white">
              Çıkış
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 pt-4 pb-28 md:px-6 md:pt-6 md:pb-10">{children}</main>

      <nav className="pb-safe fixed inset-x-0 bottom-0 z-30 border-t border-line/70 bg-bg/95 backdrop-blur md:hidden">
        <div className="grid" style={{ gridTemplateColumns: `repeat(${NAV.length}, minmax(0, 1fr))` }}>
          {NAV.map((n) => (
            <Link
              key={n.href}
              href={n.href}
              aria-label={n.label}
              className={`flex min-w-0 flex-col items-center gap-1 py-2.5 text-[11px] leading-none ${
                isActive(pathname, n.href) ? "text-accent" : "text-slate-400"
              }`}
            >
              <NavIcon d={n.icon} />
              <span className="max-w-full truncate px-0.5">{n.short}</span>
            </Link>
          ))}
        </div>
      </nav>
    </div>
  );
}
