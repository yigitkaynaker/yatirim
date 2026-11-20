"use client";

import { useEffect } from "react";
import { MODE_LABEL, type Mode } from "@/lib/assets";
import { formatTime } from "@/lib/format";

export function Card({ className = "", children }: { className?: string; children: React.ReactNode }) {
  return <section className={`rounded-2xl border border-line bg-surface ${className}`}>{children}</section>;
}

export function StaleBadge({ fetchedAt, title, label = "eski" }: { fetchedAt?: number | null; title?: string; label?: string }) {
  return (
    <span
      title={title ?? (fetchedAt ? `Son güncel fiyat: ${formatTime(fetchedAt)}` : "Fiyat alınamadı")}
      className="inline-flex items-center gap-1 rounded-md bg-amber-500/15 px-1.5 py-0.5 text-[11px] font-medium text-amber-300"
    >
      <span className="h-1.5 w-1.5 rounded-full bg-amber-400" />
      {label}
    </span>
  );
}

export function ModeTabs({ mode, onChange }: { mode: Mode; onChange: (m: Mode) => void }) {
  return (
    <div role="tablist" className="grid grid-cols-2 gap-1 rounded-xl border border-line bg-surface p-1 sm:inline-grid">
      {(["real", "virtual"] as const).map((m) => {
        const active = m === mode;
        const activeCls = m === "real" ? "bg-emerald-500/15 text-emerald-300" : "bg-violet-500/20 text-violet-200";
        return (
          <button
            key={m}
            role="tab"
            aria-selected={active}
            onClick={() => onChange(m)}
            className={`rounded-lg px-4 py-2 text-sm font-medium transition ${active ? activeCls : "text-slate-400 hover:text-white"}`}
          >
            {MODE_LABEL[m]}
          </button>
        );
      })}
    </div>
  );
}

export function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 backdrop-blur-sm sm:items-center sm:p-4" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onClick={(e) => e.stopPropagation()}
        className="pb-safe max-h-[92dvh] w-full overflow-y-auto rounded-t-2xl border border-line bg-surface shadow-2xl sm:max-w-lg sm:rounded-2xl"
      >
        <div className="sticky top-0 flex items-center justify-between border-b border-line bg-surface px-5 py-3.5">
          <h2 className="font-semibold">{title}</h2>
          <button onClick={onClose} aria-label="Kapat" className="-mr-2 rounded-lg p-2 text-slate-400 hover:text-white">
            <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round">
              <path d="M6 6l12 12M18 6L6 18" />
            </svg>
          </button>
        </div>
        <div className="p-5">{children}</div>
      </div>
    </div>
  );
}

export const inputCls =
  "w-full rounded-xl border border-line bg-bg px-3 py-2.5 outline-none transition focus:border-accent disabled:opacity-60";

export function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-sm text-slate-300">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-xs text-slate-500">{hint}</span>}
    </label>
  );
}

export function Segmented<T extends string>({
  value,
  options,
  onChange,
}: {
  value: T;
  options: { value: T; label: string; activeCls?: string }[];
  onChange: (v: T) => void;
}) {
  return (
    <div className="grid gap-1 rounded-xl border border-line bg-bg p-1" style={{ gridTemplateColumns: `repeat(${options.length}, minmax(0,1fr))` }}>
      {options.map((o) => (
        <button
          type="button"
          key={o.value}
          onClick={() => onChange(o.value)}
          className={`rounded-lg py-2 text-sm font-medium transition ${
            o.value === value ? (o.activeCls ?? "bg-surface-2 text-white") : "text-slate-400 hover:text-white"
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function PrimaryButton(props: React.ButtonHTMLAttributes<HTMLButtonElement> & { tone?: "real" | "virtual" }) {
  const { tone = "real", className = "", ...rest } = props;
  const toneCls = tone === "virtual" ? "bg-violet-500 text-white" : "bg-accent text-emerald-950";
  return (
    <button
      {...rest}
      className={`rounded-xl px-4 py-2.5 text-sm font-semibold transition hover:brightness-110 disabled:opacity-50 ${toneCls} ${className}`}
    />
  );
}

/** "20.11 15:54" (İstanbul saati) ya da günlük fiyatta "20.11.2026" */
export function formatSourceTime(ms: number, dateOnly = false): string {
  const d = new Date(ms);
  if (dateOnly) return d.toLocaleDateString("tr-TR", { timeZone: "Europe/Istanbul", day: "2-digit", month: "2-digit", year: "numeric" });
  const sameDay = d.toLocaleDateString("en-CA", { timeZone: "Europe/Istanbul" }) === new Date().toLocaleDateString("en-CA", { timeZone: "Europe/Istanbul" });
  return d.toLocaleString("tr-TR", {
    timeZone: "Europe/Istanbul",
    ...(sameDay ? {} : { day: "2-digit", month: "2-digit" }),
    hour: "2-digit",
    minute: "2-digit",
  });
}

export interface PriceMetaInfo {
  sourceTime: number | null;
  fetchedAt: number | null;
  stale: boolean;
  source?: string;
  delayed?: boolean;
  daily?: boolean;
  approx?: boolean;
}

/**
 * Fiyatın kaynağı ve zamanı: "Yahoo · 15:54", BIST için "gecikmeli (15 dk)",
 * güncellenemediyse "eski · son güncelleme …", gram altından hesaplandıysa "yaklaşık".
 */
export function PriceMeta({ q, className = "" }: { q: PriceMetaInfo | null | undefined; className?: string }) {
  if (!q) return null;
  const when = q.sourceTime ?? q.fetchedAt;
  return (
    <span className={`inline-flex flex-wrap items-center gap-1 text-[11px] leading-tight text-slate-500 ${className}`}>
      {when != null && (
        <span title={q.daily ? "Fon fiyatı her iş günü bir kez açıklanır; bu tarih son açıklanan fiyatın günüdür." : "Fiyatın kaynaktaki zamanı (İstanbul saati)"}>
          {q.source ? `${q.source} · ` : ""}
          {formatSourceTime(when, q.daily)}
        </span>
      )}
      {q.delayed && (
        <span
          title="Borsa İstanbul fiyatları ücretsiz kaynakta yaklaşık 15 dakika gecikmeli gelir. Anlık fiyat için aracı kurumunuza bakın."
          className="rounded bg-slate-500/15 px-1 py-px font-medium text-slate-300"
        >
          gecikmeli (15 dk)
        </span>
      )}
      {q.approx && (
        <span title="Kaynağa ulaşılamadı; gram altın fiyatı × ağırlık × saflık ile yaklaşık hesaplandı. İşçilik ve makas dahil değildir." className="rounded bg-sky-500/15 px-1 py-px font-medium text-sky-300">
          yaklaşık
        </span>
      )}
      {q.stale && (
        <StaleBadge
          fetchedAt={q.fetchedAt}
          title={q.fetchedAt ? `Kaynağa şu an ulaşılamıyor. Son güncelleme: ${formatSourceTime(q.fetchedAt)}` : "Fiyat alınamadı"}
          label={q.fetchedAt ? `eski · son güncelleme ${formatSourceTime(q.fetchedAt)}` : "eski"}
        />
      )}
    </span>
  );
}

/** Yeni başlayanlar için kısa açıklama kutusu */
export function Explain({ title, children, className = "" }: { title?: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={`rounded-xl border border-line/70 bg-bg/40 px-3 py-2.5 text-xs leading-relaxed text-slate-400 ${className}`}>
      {title && <span className="font-medium text-slate-200">{title} </span>}
      {children}
    </div>
  );
}
