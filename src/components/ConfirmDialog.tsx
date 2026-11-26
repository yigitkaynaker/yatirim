"use client";

import { useEffect, useRef, useSyncExternalStore } from "react";

// Uygulama içi onay / bilgi penceresi (tarayıcının confirm() / alert() pencereleri yerine).
// Kullanım: `if (!(await confirmDialog("Silinsin mi?", { confirmLabel: "Sil", danger: true }))) return;`
// ve `await alertDialog("Silinemedi.")`. Pencereler sırayla gösterilir; <DialogHost /> kök
// düzende (layout.tsx) bir kez bulunur. Esc: vazgeç, Enter: odaktaki düğme (varsayılan onay),
// Tab odağı pencere içinde döndürür; kapanınca odak önceki öğeye döner.

export interface DialogOptions {
  /** Başlık (varsayılan: onayda "Onay", bilgide "Bilgi") */
  title?: string;
  /** Onay düğmesi (varsayılan "Tamam") */
  confirmLabel?: string;
  /** Vazgeç düğmesi (varsayılan "Vazgeç") */
  cancelLabel?: string;
  /** Silme gibi geri alınamaz işlem: onay düğmesi kırmızı */
  danger?: boolean;
}

interface DialogRequest extends DialogOptions {
  id: number;
  kind: "confirm" | "alert";
  message: string;
  resolve: (ok: boolean) => void;
}

let queue: DialogRequest[] = [];
let nextId = 1;
const listeners = new Set<() => void>();

function emit() {
  for (const l of listeners) l();
}

function subscribe(l: () => void) {
  listeners.add(l);
  return () => listeners.delete(l);
}

function open(kind: DialogRequest["kind"], message: string, opts: DialogOptions): Promise<boolean> {
  return new Promise<boolean>((resolve) => {
    queue = [...queue, { ...opts, id: nextId++, kind, message, resolve }];
    emit();
  });
}

/** Onay penceresi: "Tamam"a basılırsa true, vazgeçilirse (Esc, dış alan, Vazgeç) false */
export function confirmDialog(message: string, opts: DialogOptions = {}): Promise<boolean> {
  return open("confirm", message, opts);
}

/** Bilgi / hata penceresi: kapatılınca çözülür */
export async function alertDialog(message: string, opts: DialogOptions = {}): Promise<void> {
  await open("alert", message, opts);
}

function close(id: number, ok: boolean) {
  const req = queue.find((r) => r.id === id);
  if (!req) return;
  queue = queue.filter((r) => r.id !== id);
  emit();
  req.resolve(ok);
}

const FOCUSABLE = 'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

export function DialogHost() {
  const current = useSyncExternalStore(
    subscribe,
    () => queue[0] ?? null,
    () => null,
  );
  if (!current) return null;
  return <DialogView key={current.id} req={current} />;
}

function DialogView({ req }: { req: DialogRequest }) {
  const boxRef = useRef<HTMLDivElement>(null);
  const confirmRef = useRef<HTMLButtonElement>(null);
  const isConfirm = req.kind === "confirm";
  const title = req.title ?? (isConfirm ? "Onay" : "Bilgi");

  useEffect(() => {
    const prevFocus = document.activeElement as HTMLElement | null;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    confirmRef.current?.focus();
    return () => {
      document.body.style.overflow = prevOverflow;
      if (prevFocus && document.contains(prevFocus)) prevFocus.focus();
    };
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        close(req.id, false);
        return;
      }
      if (e.key === "Enter" && !(e.target instanceof HTMLButtonElement)) {
        // Odak düğmede değilse (örn. pencerenin kendisi) Enter onaylar; düğmede tarayıcı o düğmeye basar
        e.preventDefault();
        close(req.id, true);
        return;
      }
      if (e.key === "Tab" && boxRef.current) {
        const items = [...boxRef.current.querySelectorAll<HTMLElement>(FOCUSABLE)];
        if (items.length === 0) return;
        const first = items[0];
        const last = items[items.length - 1];
        const active = document.activeElement;
        if (!boxRef.current.contains(active)) {
          e.preventDefault();
          first.focus();
        } else if (e.shiftKey && active === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && active === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    // Yakalama aşaması: arkadaki Modal'ın Esc dinleyicisinden önce çalışır
    document.addEventListener("keydown", onKey, true);
    return () => document.removeEventListener("keydown", onKey, true);
  }, [req.id]);

  const titleId = `dialog-title-${req.id}`;
  const descId = `dialog-desc-${req.id}`;
  return (
    <div className="fixed inset-0 z-[60] flex items-end justify-center bg-black/60 backdrop-blur-sm sm:items-center sm:p-4" onClick={() => close(req.id, false)}>
      <div
        ref={boxRef}
        role={isConfirm ? "alertdialog" : "dialog"}
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descId}
        tabIndex={-1}
        onClick={(e) => e.stopPropagation()}
        className="pb-safe w-full rounded-t-2xl border border-line bg-surface shadow-2xl outline-none sm:max-w-md sm:rounded-2xl"
      >
        <div className="px-5 pt-5">
          <h2 id={titleId} className="font-semibold">
            {title}
          </h2>
          <p id={descId} className="mt-2 whitespace-pre-line text-sm text-slate-300">
            {req.message}
          </p>
        </div>
        <div className="flex flex-col-reverse gap-2 px-5 pb-5 pt-5 sm:flex-row sm:justify-end">
          {isConfirm && (
            <button
              type="button"
              onClick={() => close(req.id, false)}
              className="rounded-xl border border-line px-4 py-2.5 text-sm font-medium text-slate-300 transition hover:bg-surface-2"
            >
              {req.cancelLabel ?? "Vazgeç"}
            </button>
          )}
          <button
            ref={confirmRef}
            type="button"
            onClick={() => close(req.id, true)}
            className={`rounded-xl px-4 py-2.5 text-sm font-semibold transition hover:brightness-110 ${req.danger ? "bg-rose-500 text-white" : "bg-accent text-emerald-950"}`}
          >
            {req.confirmLabel ?? "Tamam"}
          </button>
        </div>
      </div>
    </div>
  );
}
