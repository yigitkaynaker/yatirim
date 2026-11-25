"use client";

import { useState } from "react";

// Şifre alanı: göster/gizle (göz) düğmesi ve Caps Lock uyarısı. Giriş ve kayıt formları kullanır.

export function PasswordField(props: {
  id: string;
  label: string;
  value: string;
  onChange: (v: string) => void;
  autoComplete: "current-password" | "new-password";
  autoFocus?: boolean;
  minLength?: number;
  hint?: string;
}) {
  const [show, setShow] = useState(false);
  const [capsLock, setCapsLock] = useState(false);

  // Caps Lock durumunu tuş olaylarından okur (yalnızca alan odaktayken).
  function updateCapsLock(e: React.KeyboardEvent<HTMLInputElement>) {
    setCapsLock(e.getModifierState("CapsLock"));
  }

  const capsId = `${props.id}-capslock`;
  const hintId = `${props.id}-hint`;
  const described = [capsLock ? capsId : null, props.hint ? hintId : null].filter(Boolean).join(" ") || undefined;

  return (
    <div>
      <label htmlFor={props.id} className="mb-1.5 block text-sm text-slate-300">
        {props.label}
      </label>
      <div className="relative">
        <input
          id={props.id}
          type={show ? "text" : "password"}
          autoComplete={props.autoComplete}
          autoCapitalize="off"
          autoCorrect="off"
          spellCheck={false}
          autoFocus={props.autoFocus}
          required
          minLength={props.minLength}
          value={props.value}
          onChange={(e) => props.onChange(e.target.value)}
          onKeyDown={updateCapsLock}
          onKeyUp={updateCapsLock}
          onBlur={() => setCapsLock(false)}
          aria-describedby={described}
          className="w-full rounded-xl border border-line bg-bg py-2.5 pl-3.5 pr-12 outline-none focus:border-accent"
        />
        <button
          type="button"
          onClick={() => setShow((v) => !v)}
          aria-label={show ? "Şifreyi gizle" : "Şifreyi göster"}
          aria-pressed={show}
          className="absolute inset-y-0 right-0 flex w-11 items-center justify-center rounded-r-xl text-slate-400 outline-none hover:text-slate-200 focus-visible:text-slate-100 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent"
        >
          {show ? (
            <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94" />
              <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19" />
              <path d="M14.12 14.12a3 3 0 1 1-4.24-4.24" />
              <line x1="1" y1="1" x2="23" y2="23" />
            </svg>
          ) : (
            <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
              <circle cx="12" cy="12" r="3" />
            </svg>
          )}
        </button>
      </div>
      {props.hint && (
        <p id={hintId} className="mt-1.5 text-xs text-slate-500">
          {props.hint}
        </p>
      )}
      {capsLock && (
        <p id={capsId} className="mt-1.5 text-xs text-amber-400">
          Caps Lock açık
        </p>
      )}
    </div>
  );
}

/** Başarılı girişten sonra: yalnızca site içi "next" adresine, tam sayfa yüklemeyle (yeni çerezle temiz başlangıç). */
export function goAfterLogin(next: string | null) {
  window.location.assign(new URL(next && next.startsWith("/") && !next.startsWith("//") ? next : "/", window.location.origin));
}
