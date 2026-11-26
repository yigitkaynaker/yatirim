"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { NotificationBell } from "./NotificationBell";
import { BOOK_ICON_PATH } from "./help";
import { NO_ADVICE } from "@/content/kilavuz/types";

// Gezinme öğeleri. Masaüstünde üst menü, küçük ekranda alt sekme çubuğu.
// short: alt çubukta sığması için kısa ad. mobile: false olanlar menüde değil,
// üst çubukta simge olarak görünür (Ayarlar). primary: telefonda alt çubukta ve
// orta genişlikte üst menüde doğrudan görünür; diğerleri "Daha fazla" menüsündedir
// (geniş ekranda hepsi üst menüde). extra: yardım sayfaları; masaüstünde her zaman "Daha fazla"
// menüsünde durur (üst menüye sığsın diye). Yeni sayfa için buraya satır eklemek yeterli.
const NAV: { href: string; label: string; short: string; icon: string; mobile?: boolean; primary?: boolean; extra?: boolean }[] = [
  { href: "/", label: "Portföy", short: "Portföy", primary: true, icon: "M3 13h4v8H3zM10 8h4v13h-4zM17 3h4v18h-4z" },
  { href: "/piyasa", label: "Piyasa", short: "Piyasa", primary: true, icon: "M3 17l5-5 4 4 8-9M14 7h6v6" },
  { href: "/sinyaller", label: "Sinyaller", short: "Sinyaller", icon: "M3 12h4l3-8 4 16 3-8h4" },
  { href: "/egitim", label: "Eğitim", short: "Eğitim", icon: "M2 9l10-5 10 5-10 5zM6 11v5c3 2 9 2 12 0v-5M22 9v6" },
  { href: "/alarmlar", label: "Alarmlar", short: "Alarmlar", icon: "M6 8a6 6 0 1 1 12 0c0 7 3 8 3 8H3s3-1 3-8zM10 20a2 2 0 0 0 4 0" },
  { href: "/temettu", label: "Temettü", short: "Temettü", icon: "M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zM14.5 9.5c-.4-1-1.4-1.5-2.5-1.5-1.5 0-2.5.8-2.5 2s1.1 1.6 2.5 2 2.5.8 2.5 2-1 2-2.5 2c-1.1 0-2.1-.5-2.5-1.5M12 6.5V8M12 16v1.5" },
  { href: "/kap", label: "KAP", short: "KAP", icon: "M6 3h9l4 4v14H6zM14 3v5h5M9 12h7M9 16h7" },
  { href: "/islemler", label: "İşlemler", short: "İşlemler", icon: "M4 6h16M4 12h16M4 18h10" },
  { href: "/rapor", label: "Rapor & veri", short: "Rapor", icon: "M4 20V10M10 20V4M16 20v-7M22 20H2" },
  { href: "/emirler", label: "Emirler", short: "Emirler", primary: true, icon: "M12 3v18M5 10l7-7 7 7M5 21h14" },
  { href: "/hesaplayicilar", label: "Hesaplayıcılar", short: "Hesapla", extra: true, icon: "M6 3h12a1 1 0 0 1 1 1v16a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1zM8 7h8M8 12h2M14 12h2M8 16h2M14 16h2" },
  { href: "/sohbet", label: "Sohbet", short: "Sohbet", primary: true, icon: "M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.6A8 8 0 1 1 21 12z" },
  { href: "/analizler", label: "Analizler", short: "Analiz", icon: "M4 5h16v14H4zM8 9h8M8 13h8M8 17h5" },
  { href: "/kilavuz", label: "Kılavuz", short: "Kılavuz", extra: true, icon: BOOK_ICON_PATH },
  { href: "/sozluk", label: "Sözlük", short: "Sözlük", extra: true, icon: "M4 19V6a2 2 0 0 1 2-2h12v14H6a2 2 0 0 0-2 2zM8 13l2.5-6 2.5 6M8.8 11h3.4M15 9h2" },
  {
    href: "/ayarlar",
    label: "Ayarlar",
    short: "Ayarlar",
    mobile: false,
    icon: "M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z",
  },
];

const MAIN_NAV = NAV.filter((n) => n.mobile !== false);
const PRIMARY_NAV = MAIN_NAV.filter((n) => n.primary);
const MORE_NAV = MAIN_NAV.filter((n) => !n.primary);
const SETTINGS = NAV.find((n) => n.href === "/ayarlar")!;
const MORE_ICON = "M4 4h6v6H4zM14 4h6v6h-6zM4 14h6v6H4zM14 14h6v6h-6z";

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
  const [moreOpen, setMoreOpen] = useState(false);
  const moreActive = MORE_NAV.some((n) => isActive(pathname, n.href)) || isActive(pathname, SETTINGS.href);

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" }).catch(() => {});
    window.location.assign(new URL("/login", window.location.origin));
  }

  return (
    <div className="min-h-dvh">
      <header className="pt-safe sticky top-0 z-30 border-b border-line/70 bg-bg/85 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-6xl items-center gap-6 px-4 md:px-6 xl:gap-4">
          <Link href="/" className="flex items-center gap-2 font-semibold tracking-tight">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/icons/icon-192.png" alt="" width={28} height={28} className="rounded-lg" />
            Yatırım
          </Link>
          <nav className="hidden items-center gap-0.5 md:flex lg:gap-1 xl:gap-0">
            {MAIN_NAV.filter((n) => !n.extra).map((n) => (
              <Link
                key={n.href}
                href={n.href}
                className={`rounded-lg px-2.5 py-1.5 text-sm whitespace-nowrap transition lg:px-3 xl:px-2 ${n.primary ? "" : "hidden xl:block"} ${
                  isActive(pathname, n.href) ? "bg-surface-2 text-white" : "text-slate-400 hover:text-white"
                }`}
              >
                {n.label}
              </Link>
            ))}
            <div className="relative">
              <button
                type="button"
                onClick={() => setMoreOpen((o) => !o)}
                aria-expanded={moreOpen}
                className={`rounded-lg px-2.5 py-1.5 text-sm whitespace-nowrap transition lg:px-3 xl:px-2 ${
                  MORE_NAV.some((n) => isActive(pathname, n.href)) ? "bg-surface-2 text-white" : "text-slate-400 hover:text-white"
                }`}
              >
                Daha fazla ▾
              </button>
              {moreOpen && (
                <>
                  <div className="fixed inset-0 z-40" onClick={() => setMoreOpen(false)} />
                  <div className="absolute top-10 left-0 z-50 w-56 overflow-hidden rounded-xl border border-line bg-surface py-1 shadow-2xl">
                    {MORE_NAV.map((n) => (
                      <Link
                        key={n.href}
                        href={n.href}
                        onClick={() => setMoreOpen(false)}
                        className={`flex items-center gap-3 px-3 py-2 text-sm ${n.extra ? "" : "xl:hidden"} ${isActive(pathname, n.href) ? "text-accent" : "text-slate-300 hover:bg-surface-2 hover:text-white"}`}
                      >
                        <NavIcon d={n.icon} />
                        {n.label}
                      </Link>
                    ))}
                  </div>
                </>
              )}
            </div>
          </nav>
          <div className="ml-auto flex items-center gap-1">
            <NotificationBell />
            <Link
              href={SETTINGS.href}
              aria-label={SETTINGS.label}
              title={SETTINGS.label}
              className={`rounded-lg p-2 ${isActive(pathname, SETTINGS.href) ? "text-accent" : "text-slate-300 hover:bg-surface-2 hover:text-white"}`}
            >
              <NavIcon d={SETTINGS.icon} />
            </Link>
            <button onClick={logout} className="rounded-lg px-3 py-1.5 text-sm text-slate-400 hover:text-white">
              Çıkış
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 pt-4 pb-28 md:px-6 md:pt-6 md:pb-10">
        {children}
        <p className="mt-8 text-center text-[11px] text-slate-600">
          {NO_ADVICE}{" "}
          <Link href="/kilavuz" className="hover:text-slate-400">
            Kullanım kılavuzu
          </Link>
        </p>
      </main>

      <nav className="pb-safe fixed inset-x-0 bottom-0 z-30 border-t border-line/70 bg-bg/95 backdrop-blur md:hidden">
        <div className="grid" style={{ gridTemplateColumns: `repeat(${PRIMARY_NAV.length + 1}, minmax(0, 1fr))` }}>
          {PRIMARY_NAV.map((n) => (
            <Link
              key={n.href}
              href={n.href}
              onClick={() => setMoreOpen(false)}
              aria-label={n.label}
              className={`flex min-w-0 flex-col items-center gap-1 py-2.5 text-[11px] leading-none ${
                isActive(pathname, n.href) ? "text-accent" : "text-slate-400"
              }`}
            >
              <NavIcon d={n.icon} />
              <span className="max-w-full truncate px-0.5">{n.short}</span>
            </Link>
          ))}
          <button
            type="button"
            onClick={() => setMoreOpen((o) => !o)}
            aria-expanded={moreOpen}
            aria-label="Daha fazla"
            className={`flex min-w-0 flex-col items-center gap-1 py-2.5 text-[11px] leading-none ${moreActive || moreOpen ? "text-accent" : "text-slate-400"}`}
          >
            <NavIcon d={MORE_ICON} />
            <span className="max-w-full truncate px-0.5">Daha fazla</span>
          </button>
        </div>
      </nav>

      {moreOpen && (
        <div className="fixed inset-0 z-20 bg-black/50 md:hidden" onClick={() => setMoreOpen(false)}>
          <div
            onClick={(e) => e.stopPropagation()}
            className="absolute inset-x-0 bottom-0 rounded-t-2xl border-t border-line bg-surface px-3 pt-3 pb-[calc(4.5rem+env(safe-area-inset-bottom))] shadow-2xl"
          >
            <div className="grid grid-cols-3 gap-2">
              {[...MORE_NAV, SETTINGS].map((n) => (
                <Link
                  key={n.href}
                  href={n.href}
                  onClick={() => setMoreOpen(false)}
                  className={`flex flex-col items-center gap-1.5 rounded-xl border px-2 py-3 text-xs ${
                    isActive(pathname, n.href) ? "border-accent/50 text-accent" : "border-line text-slate-300 active:bg-surface-2"
                  }`}
                >
                  <NavIcon d={n.icon} />
                  {n.label}
                </Link>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
