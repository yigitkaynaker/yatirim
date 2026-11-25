"use client";

import { useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { goAfterLogin, PasswordField } from "./PasswordField";

export function LoginForm() {
  const params = useSearchParams();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim(), password }),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        setError(
          res.status === 401
            ? `${email.trim() ? "E-posta ya da şifre hatalı." : "Şifre hatalı."} Büyük/küçük harf ve klavye dilini (Türkçe/İngilizce) kontrol edin.`
            : (data.error ?? "Giriş yapılamadı."),
        );
        setLoading(false);
        return;
      }
      goAfterLogin(params.get("next"));
    } catch {
      setError("Sunucuya ulaşılamadı.");
      setLoading(false);
    }
  }

  const next = params.get("next");
  return (
    <>
      <form onSubmit={onSubmit} className="space-y-4 rounded-2xl border border-line bg-surface p-5 shadow-xl">
        <div>
          <label htmlFor="login-email" className="mb-1.5 block text-sm text-slate-300">
            E-posta
          </label>
          <input
            id="login-email"
            type="email"
            inputMode="email"
            autoComplete="username"
            autoCapitalize="off"
            autoCorrect="off"
            spellCheck={false}
            autoFocus
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            aria-describedby="login-email-hint"
            className="w-full rounded-xl border border-line bg-bg px-3.5 py-2.5 outline-none focus:border-accent"
          />
          <p id="login-email-hint" className="mt-1.5 text-xs text-slate-500">
            Uygulama sahibiyseniz boş bırakıp yalnızca uygulama şifresini girebilirsiniz.
          </p>
        </div>
        <PasswordField id="login-password" label="Şifre" value={password} onChange={setPassword} autoComplete="current-password" />
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
      <p className="mt-5 text-center text-sm text-slate-400">
        Hesabın yok mu?{" "}
        <Link href={next ? `/register?next=${encodeURIComponent(next)}` : "/register"} className="font-medium text-accent hover:underline">
          Kayıt ol
        </Link>
      </p>
    </>
  );
}
