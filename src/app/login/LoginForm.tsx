"use client";

import { useState } from "react";
import { useSearchParams } from "next/navigation";

export function LoginForm() {
  const params = useSearchParams();
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [capsLock, setCapsLock] = useState(false);

  // Caps Lock durumunu tuş olaylarından okur (yalnızca alan odaktayken).
  function updateCapsLock(e: React.KeyboardEvent<HTMLInputElement>) {
    setCapsLock(e.getModifierState("CapsLock"));
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        setError(
          res.status === 401
            ? "Şifre hatalı. Büyük/küçük harf ve klavye dilini (Türkçe/İngilizce) kontrol edin."
            : (data.error ?? "Giriş yapılamadı."),
        );
        setLoading(false);
        return;
      }
      const next = params.get("next");
      // Yalnızca site içi yönlendirmeye izin ver.
      // Tam sayfa yükleme: yeni çerezle tüm uygulama temiz başlasın.
      window.location.assign(new URL(next && next.startsWith("/") && !next.startsWith("//") ? next : "/", window.location.origin));
    } catch {
      setError("Sunucuya ulaşılamadı.");
      setLoading(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4 rounded-2xl border border-line bg-surface p-5 shadow-xl">
      <div>
        <label htmlFor="login-password" className="mb-1.5 block text-sm text-slate-300">
          Şifre
        </label>
        <div className="relative">
          <input
            id="login-password"
            type={showPassword ? "text" : "password"}
            autoComplete="current-password"
            autoCapitalize="off"
            autoCorrect="off"
            spellCheck={false}
            autoFocus
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            onKeyDown={updateCapsLock}
            onKeyUp={updateCapsLock}
            onBlur={() => setCapsLock(false)}
            aria-describedby={capsLock ? "login-capslock" : undefined}
            className="w-full rounded-xl border border-line bg-bg py-2.5 pl-3.5 pr-12 outline-none focus:border-accent"
          />
          <button
            type="button"
            onClick={() => setShowPassword((v) => !v)}
            aria-label={showPassword ? "Şifreyi gizle" : "Şifreyi göster"}
            aria-pressed={showPassword}
            className="absolute inset-y-0 right-0 flex w-11 items-center justify-center rounded-r-xl text-slate-400 outline-none hover:text-slate-200 focus-visible:text-slate-100 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent"
          >
            {showPassword ? (
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
        {capsLock && (
          <p id="login-capslock" className="mt-1.5 text-xs text-amber-400">
            Caps Lock açık
          </p>
        )}
      </div>
      {error && (
        <p role="alert" className="text-sm text-rose-400">
          {error}
        </p>
      )}
      <button
        type="submit"
        disabled={loading || !password}
        className="w-full rounded-xl bg-accent py-2.5 font-semibold text-emerald-950 transition hover:brightness-110 disabled:opacity-50"
      >
        {loading ? "Giriş yapılıyor…" : "Giriş yap"}
      </button>
    </form>
  );
}
