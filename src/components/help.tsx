"use client";

import Link from "next/link";
import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { getTerm, type TermId } from "@/content/sozluk/terimler";

// YARDIM KATMANI: "?" bilgi ipuçları, boş liste ekranları ve kılavuz bağlantıları.
// Yardım "çekmeli"dir: kullanıcı isterse açar; açılış turu ya da zorlayıcı uyarı yoktur.

const TIP_W = 260;

/**
 * Terimin yanında küçük "?" düğmesi. Dokununca / tıklayınca / Enter ile tek cümlelik açıklama
 * ve sözlüğe "Daha fazla" bağlantısı açılır. Kutu terimin ALTINA (yer yoksa üstüne) konur,
 * terimi kapatmaz. Esc, dışarı tıklama ya da kaydırma kapatır. Satıra tıklayınca açılan
 * kartların içinde de kullanılabilir (tıklama yukarı taşınmaz).
 */
export function InfoTip({ term, className = "" }: { term: TermId; className?: string }) {
  const t = getTerm(term);
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ left: number; top: number; above: boolean } | null>(null);
  const btn = useRef<HTMLButtonElement>(null);
  const box = useRef<HTMLDivElement>(null);
  const id = useId();

  const place = useCallback(() => {
    const r = btn.current?.getBoundingClientRect();
    if (!r) return;
    const vw = window.innerWidth;
    const w = Math.min(TIP_W, vw - 16);
    const left = Math.max(8, Math.min(r.left + r.width / 2 - w / 2, vw - 8 - w));
    const h = box.current?.offsetHeight ?? 110;
    const above = r.bottom + 8 + h > window.innerHeight && r.top - 8 - h > 0;
    setPos({ left, top: above ? r.top - 8 - h : r.bottom + 8, above });
  }, []);

  useLayoutEffect(() => {
    if (open) place();
  }, [open, place]);

  useEffect(() => {
    if (!open) return;
    const close = () => setOpen(false);
    const onDown = (e: PointerEvent) => {
      const n = e.target as Node;
      if (!box.current?.contains(n) && !btn.current?.contains(n)) close();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        close();
        btn.current?.focus();
      }
    };
    document.addEventListener("pointerdown", onDown);
    document.addEventListener("keydown", onKey);
    window.addEventListener("scroll", close, true);
    window.addEventListener("resize", close);
    return () => {
      document.removeEventListener("pointerdown", onDown);
      document.removeEventListener("keydown", onKey);
      window.removeEventListener("scroll", close, true);
      window.removeEventListener("resize", close);
    };
  }, [open]);

  const stop = (e: React.SyntheticEvent) => e.stopPropagation();

  return (
    <>
      <button
        ref={btn}
        type="button"
        aria-label={`${t.term} nedir?`}
        aria-expanded={open}
        aria-controls={open ? id : undefined}
        onClick={(e) => {
          e.stopPropagation();
          e.preventDefault();
          setOpen((o) => !o);
        }}
        onKeyDown={stop}
        className={`relative inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-full border border-slate-500/70 align-middle text-[10px] font-bold leading-none text-slate-400 transition before:absolute before:-inset-2 before:content-[''] hover:border-slate-300 hover:text-white focus-visible:outline-2 focus-visible:outline-accent ${
          open ? "border-accent text-accent" : ""
        } ${className}`}
      >
        ?
      </button>
      {open &&
        createPortal(
          <div
            ref={box}
            id={id}
            role="dialog"
            aria-label={t.term}
            onClick={stop}
            onKeyDown={stop}
            style={{ left: pos?.left ?? -9999, top: pos?.top ?? -9999, width: Math.min(TIP_W, typeof window === "undefined" ? TIP_W : window.innerWidth - 16) }}
            className="fixed z-[70] rounded-xl border border-line bg-surface-2 p-3 text-left text-xs font-normal leading-relaxed text-slate-200 shadow-2xl"
          >
            <span className="block font-semibold text-white">{t.term}</span>
            <span className="mt-1 block">{t.short}</span>
            <Link href={`/sozluk#${t.id}`} onClick={() => setOpen(false)} className="mt-2 inline-flex items-center gap-1 font-medium text-accent hover:underline">
              Daha fazla ›
            </Link>
          </div>,
          document.body,
        )}
    </>
  );
}

/** Etiket + "?" ipucu (tablo başlıkları, kart etiketleri için) */
export function Term({ term, children }: { term: TermId; children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1">
      {children}
      <InfoTip term={term} />
    </span>
  );
}

export interface EmptyAction {
  label: string;
  href?: string;
  onClick?: () => void;
  tone?: "real" | "virtual";
}

/**
 * Boş liste ekranı: bu nedir (1–2 cümle), TEK net eylem düğmesi ve ilgili kılavuz
 * bölümüne ya da derse bağlantı.
 */
export function EmptyState({
  title,
  children,
  action,
  guide,
  compact = false,
}: {
  title: string;
  children: React.ReactNode;
  action?: EmptyAction;
  guide?: { href: string; label: string };
  compact?: boolean;
}) {
  const toneCls = action?.tone === "virtual" ? "bg-violet-500 text-white" : "bg-accent text-emerald-950";
  const btnCls = `inline-flex rounded-xl px-4 py-2.5 text-sm font-semibold transition hover:brightness-110 ${toneCls}`;
  return (
    <section className={`rounded-2xl border border-dashed border-line bg-surface text-center ${compact ? "p-5" : "p-6 md:p-8"}`}>
      <p className="font-medium text-slate-200">{title}</p>
      <div className="mx-auto mt-1 max-w-md text-sm leading-relaxed text-slate-400">{children}</div>
      {action && (
        <div className="mt-4">
          {action.href ? (
            <Link href={action.href} className={btnCls}>
              {action.label}
            </Link>
          ) : (
            <button type="button" onClick={action.onClick} className={btnCls}>
              {action.label}
            </button>
          )}
        </div>
      )}
      {guide && <GuideLink href={guide.href} className="mt-3">{guide.label}</GuideLink>}
    </section>
  );
}

/** Kılavuz / ders / sözlük bağlantısı (kitap simgeli, küçük) */
export function GuideLink({ href, children, className = "" }: { href: string; children: React.ReactNode; className?: string }) {
  return (
    <Link href={href} className={`inline-flex items-center gap-1.5 text-xs text-slate-400 hover:text-accent ${className}`}>
      <BookIcon className="h-3.5 w-3.5" />
      {children}
    </Link>
  );
}

export const BOOK_ICON_PATH = "M4 5a2 2 0 0 1 2-2h13v16H6a2 2 0 0 0-2 2zM4 21V5M19 19v2H6M8 7h7M8 11h5";

export function BookIcon({ className = "h-4 w-4" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d={BOOK_ICON_PATH} />
    </svg>
  );
}

/** Türkçe karakterleri sadeleştirip küçük harfe çevirir (arama için) */
export function normalizeTr(s: string): string {
  return s
    .toLocaleLowerCase("tr-TR")
    .replace(/ı/g, "i")
    .replace(/ğ/g, "g")
    .replace(/ü/g, "u")
    .replace(/ş/g, "s")
    .replace(/ö/g, "o")
    .replace(/ç/g, "c")
    .replace(/[âà]/g, "a")
    .replace(/[îï]/g, "i")
    .replace(/û/g, "u");
}

/**
 * Sayfa #bölüm ile açıldıysa ve o bölüm sonradan (veri yüklenince) çiziliyorsa, belirince
 * bir kez oraya kaydırır. Kılavuzdaki "Uygulamada aç" bağlantıları için (örn. /ayarlar#yedek).
 */
export function useHashScroll() {
  useEffect(() => {
    const id = decodeURIComponent(window.location.hash.slice(1));
    if (!id) return;
    let tries = 0;
    const timer = setInterval(() => {
      const el = document.getElementById(id);
      if (el || ++tries > 25) {
        clearInterval(timer);
        el?.scrollIntoView({ block: "start" });
      }
    }, 120);
    return () => clearInterval(timer);
  }, []);
}
