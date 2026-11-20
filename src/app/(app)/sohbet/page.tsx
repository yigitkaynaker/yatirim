import type { Metadata } from "next";

export const metadata: Metadata = { title: "Sohbet" };

// Yer tutucu. Sonraki aşamada Claude tool-use sohbeti buraya gelecek ve
// src/lib/actions.ts içindeki fonksiyonları araç olarak çağıracak.
export default function ChatPage() {
  return (
    <div className="flex h-[calc(100dvh-12rem)] flex-col md:h-[calc(100dvh-8rem)]">
      <h1 className="mb-3 text-xl font-semibold tracking-tight">Sohbet</h1>
      <div className="flex flex-1 flex-col items-center justify-center rounded-2xl border border-line bg-surface p-6 text-center">
        <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-violet-500/15 text-violet-200">
          <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <path d="M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.6A8 8 0 1 1 21 12z" />
          </svg>
        </div>
        <p className="font-medium">Yapay zeka asistanı yakında</p>
        <p className="mt-1 max-w-sm text-sm text-slate-500">
          Portföyünüzü sorabilecek, sanal pozisyon açtırabilecek ve emir verdirebileceksiniz.
        </p>
      </div>
      <form className="mt-3 flex gap-2">
        <input disabled placeholder="Mesajınızı yazın…" className="flex-1 rounded-xl border border-line bg-surface px-3.5 py-2.5 opacity-60" />
        <button type="button" disabled className="rounded-xl bg-violet-500 px-4 py-2.5 text-sm font-semibold text-white opacity-50">
          Gönder
        </button>
      </form>
    </div>
  );
}
