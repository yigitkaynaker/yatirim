"use client";

import Link from "next/link";
import { useState } from "react";
import type { AppNotification } from "@/lib/orders";
import { usePolling } from "@/lib/usePolling";

/** Uygulama içi bildirimler (emir gerçekleşti, önemli haber vb.). */
export function NotificationBell() {
  const { data, reload } = usePolling<{ items: AppNotification[]; unread: number }>("/api/notifications");
  const [open, setOpen] = useState(false);
  const unread = data?.unread ?? 0;

  async function toggle() {
    const next = !open;
    setOpen(next);
    if (next && unread > 0) {
      await fetch("/api/notifications", { method: "POST" }).catch(() => {});
      void reload();
    }
  }

  return (
    <div className="relative">
      <button onClick={toggle} aria-label="Bildirimler" className="relative rounded-lg p-2 text-slate-300 hover:bg-surface-2 hover:text-white">
        <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
          <path d="M6 8a6 6 0 1 1 12 0c0 7 3 8 3 8H3s3-1 3-8M10.3 20a2 2 0 0 0 3.4 0" />
        </svg>
        {unread > 0 && (
          <span className="absolute top-1 right-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-rose-500 px-1 text-[10px] font-bold text-white">
            {unread > 9 ? "9+" : unread}
          </span>
        )}
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="fixed inset-x-3 top-16 z-50 max-h-[70dvh] overflow-y-auto rounded-2xl border border-line bg-surface shadow-2xl sm:absolute sm:inset-x-auto sm:top-11 sm:right-0 sm:w-96">
            <div className="border-b border-line px-4 py-3 text-sm font-medium">Bildirimler</div>
            {!data?.items.length ? (
              <p className="px-4 py-6 text-center text-sm text-slate-500">Bildirim yok.</p>
            ) : (
              <ul className="divide-y divide-line/70">
                {data.items.map((n) => (
                  <li key={n.id} className={`px-4 py-3 ${n.readAt ? "" : "bg-sky-500/5"}`}>
                    <div className={`text-sm font-medium ${n.kind === "order_failed" ? "text-rose-300" : n.kind === "news_alert" ? "text-amber-200" : ""}`}>
                      {n.kind === "news_alert" ? (
                        <Link href="/analizler" onClick={() => setOpen(false)} className="hover:underline">
                          {n.title}
                        </Link>
                      ) : (
                        n.title
                      )}
                    </div>
                    <div className="text-sm text-slate-400">{n.body}</div>
                    <div className="mt-0.5 text-xs text-slate-500">
                      {new Date(n.createdAt.replace(" ", "T") + "Z").toLocaleString("tr-TR", { dateStyle: "short", timeStyle: "short" })}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </>
      )}
    </div>
  );
}
