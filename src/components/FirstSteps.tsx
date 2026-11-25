"use client";

import Link from "next/link";
import { useEffect, useState, useSyncExternalStore } from "react";
import { fetchJson, goToLogin, UnauthorizedError } from "@/lib/usePolling";
import { useCompletedLessons } from "./egitim/progress";
import { Card } from "./ui";
import { CheckIcon } from "./egitim/common";
import { GuideLink } from "./help";

// "İLK ADIMLAR" KARTI: Portföy sayfasında, kapatılabilir 5 maddelik başlangıç listesi.
// Maddeler gerçek veriden kendiliğinden işaretlenir (/api/onboarding + bu cihazdaki ders
// ilerlemesi). Kapatılma durumu yalnızca bu tarayıcıda (localStorage) tutulur; Kılavuz'dan
// yeniden açılabilir. Zorlama, seri ya da işlem teşviki yoktur.

/** Eğitim'deki 1. ders (src/content/egitim/index.ts içindeki LESSONS[0]) */
export const FIRST_LESSON_SLUG = "mum-grafigi";

const KEY = "yatirim:ilk-adimlar:gizli";
const EVENT = "ilk-adimlar";

function read(): string {
  try {
    return window.localStorage.getItem(KEY) ?? "0";
  } catch {
    return "0";
  }
}

function subscribe(cb: () => void) {
  window.addEventListener("storage", cb);
  window.addEventListener(EVENT, cb);
  return () => {
    window.removeEventListener("storage", cb);
    window.removeEventListener(EVENT, cb);
  };
}

export function setFirstStepsHidden(hidden: boolean) {
  try {
    window.localStorage.setItem(KEY, hidden ? "1" : "0");
  } catch {
    // Depolama kullanılamıyor; tercih yalnızca bu oturumda geçerli olmaz.
  }
  window.dispatchEvent(new Event(EVENT));
}

/** Sunucuda ve ilk çizimde "gizli" sayılır (yanıp sönmesin diye) */
function useHidden(): boolean {
  return useSyncExternalStore(subscribe, read, () => "1") === "1";
}

export interface OnboardingStatus {
  sanal: boolean;
  izleme: boolean;
  emirAlarm: boolean;
  bildirim: boolean;
}

export function FirstSteps({ onStartVirtual, refreshKey }: { onStartVirtual: () => void; refreshKey: string }) {
  const hidden = useHidden();
  const lessons = useCompletedLessons();
  const [s, setS] = useState<OnboardingStatus | null>(null);

  useEffect(() => {
    if (hidden) return;
    let alive = true;
    fetchJson<OnboardingStatus>("/api/onboarding")
      .then((d) => alive && setS(d))
      .catch((err: unknown) => {
        if (err instanceof UnauthorizedError) goToLogin();
      });
    return () => {
      alive = false;
    };
  }, [hidden, refreshKey]);

  if (hidden || !s) return null;

  const items: { done: boolean; label: string; hint: string; action: React.ReactNode }[] = [
    {
      done: s.sanal,
      label: "Sanal portföyde ilk alımını yap",
      hint: "Gerçek para kullanmadan dene.",
      action: (
        <button type="button" onClick={onStartVirtual} className="text-accent hover:underline">
          Sanal al
        </button>
      ),
    },
    {
      done: s.izleme,
      label: "Bir varlığı izleme listene ekle",
      hint: "Piyasa › + Ekle",
      action: <Link href="/piyasa" className="text-accent hover:underline">Piyasa</Link>,
    },
    {
      done: s.emirAlarm,
      label: "Bir emir ya da alarm kur",
      hint: "Fiyat bir seviyeye gelince haber al.",
      action: <Link href="/alarmlar" className="text-accent hover:underline">Alarmlar</Link>,
    },
    {
      done: lessons.has(FIRST_LESSON_SLUG),
      label: "Eğitim'den 1. dersi bitir",
      hint: "Mum grafiği · 5 dk",
      action: <Link href={`/egitim/${FIRST_LESSON_SLUG}`} className="text-accent hover:underline">Derse git</Link>,
    },
    {
      done: s.bildirim,
      label: "Bildirimleri aç",
      hint: "Ayarlar › Bildirimler",
      action: <Link href="/ayarlar#bildirimler" className="text-accent hover:underline">Ayarlar</Link>,
    },
  ];
  const doneCount = items.filter((i) => i.done).length;
  const all = doneCount === items.length;

  return (
    <Card className="p-4 md:p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="font-semibold">İlk adımlar</h2>
          <p className="mt-0.5 text-xs text-slate-500">
            {all ? "Hepsi tamam. Bu kartı artık kapatabilirsin." : `Uygulamayı tanımak için kısa bir liste · ${doneCount}/${items.length}`}
          </p>
        </div>
        <button
          type="button"
          onClick={() => setFirstStepsHidden(true)}
          aria-label="İlk adımlar kartını kapat"
          title="Kapat (Kılavuz'dan yeniden açabilirsin)"
          className="-mr-2 -mt-1 rounded-lg p-2 text-slate-400 hover:text-white"
        >
          <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" aria-hidden>
            <path d="M6 6l12 12M18 6L6 18" />
          </svg>
        </button>
      </div>
      <ol className="mt-3 divide-y divide-line/60">
        {items.map((i) => (
          <li key={i.label} className="flex items-center gap-3 py-2 text-sm">
            <span
              className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full ${i.done ? "bg-accent text-emerald-950" : "border border-line text-transparent"}`}
              aria-hidden
            >
              <CheckIcon className="h-3.5 w-3.5" />
            </span>
            <span className="min-w-0 flex-1">
              <span className={i.done ? "text-slate-500 line-through" : "text-slate-200"}>{i.label}</span>
              <span className="sr-only">{i.done ? " (tamamlandı)" : " (yapılmadı)"}</span>
              {!i.done && <span className="block text-xs text-slate-500">{i.hint}</span>}
            </span>
            {!i.done && <span className="shrink-0 text-xs font-medium">{i.action}</span>}
          </li>
        ))}
      </ol>
      <GuideLink href="/kilavuz#baslarken" className="mt-2">
        Kullanım kılavuzu: Başlarken
      </GuideLink>
    </Card>
  );
}
