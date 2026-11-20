import { DISCLAIMER, LEVEL_LABEL, type Level } from "@/content/egitim/types";

export const LEVEL_CLS: Record<Level, string> = {
  baslangic: "bg-emerald-500/15 text-emerald-300",
  orta: "bg-sky-500/15 text-sky-300",
  ileri: "bg-violet-500/20 text-violet-200",
};

export function LevelBadge({ level }: { level: Level }) {
  return <span className={`rounded-md px-1.5 py-0.5 text-[11px] font-medium ${LEVEL_CLS[level]}`}>{LEVEL_LABEL[level]}</span>;
}

export function Disclaimer() {
  return (
    <footer className="border-t border-line/70 pt-4 text-center text-xs text-slate-500">
      {DISCLAIMER}
    </footer>
  );
}

export function CheckIcon({ className = "h-4 w-4" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M5 12.5l4.5 4.5L19 7.5" />
    </svg>
  );
}
