"use client";

import { useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { goAfterLogin, PasswordField } from "../login/PasswordField";

const MIN_PASSWORD = 8;
const EMAIL_RE = /^[^\s@]{1,64}@[^\s@]{1,190}\.[^\s@.]{2,}$/;

/** İstemci tarafı ön denetim (sunucu yine denetler); Türkçe mesaj ya da null */
function validate(email: string, password: string, password2: string): string | null {
  if (!email) return "E-posta adresi girin.";
  if (!EMAIL_RE.test(email)) return "E-posta adresi geçersiz. Örnek: ad@ornek.com";
  if (password.length < MIN_PASSWORD) return `Şifre en az ${MIN_PASSWORD} karakter olmalı.`;
  if (password !== password2) return "Şifreler aynı değil.";
  return null;
}

export function RegisterForm() {
  const params = useSearchParams();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [password2, setPassword2] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    const em = email.trim();
    const problem = validate(em, password, password2);
    if (problem) {
      setError(problem);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: em, password, password2 }),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        setError(data.error ?? "Kayıt yapılamadı.");
        setLoading(false);
        return;
      }
      // Kayıt başarılı: oturum açıldı
      goAfterLogin(params.get("next"));
    } catch {
      setError("Sunucuya ulaşılamadı.");
      setLoading(false);
    }
  }

  const next = params.get("next");
  return (
    <>
      <form onSubmit={onSubmit} noValidate className="space-y-4 rounded-2xl border border-line bg-surface p-5 shadow-xl">
        <div>
          <label htmlFor="register-email" className="mb-1.5 block text-sm text-slate-300">
            E-posta
          </label>
          <input
            id="register-email"
            type="email"
            inputMode="email"
            autoComplete="email"
            autoCapitalize="off"
            autoCorrect="off"
            spellCheck={false}
            autoFocus
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full rounded-xl border border-line bg-bg px-3.5 py-2.5 outline-none focus:border-accent"
          />
        </div>
        <PasswordField
          id="register-password"
          label="Şifre"
          value={password}
          onChange={setPassword}
          autoComplete="new-password"
          minLength={MIN_PASSWORD}
          hint={`En az ${MIN_PASSWORD} karakter.`}
        />
        <PasswordField id="register-password2" label="Şifre (tekrar)" value={password2} onChange={setPassword2} autoComplete="new-password" minLength={MIN_PASSWORD} />
        {error && (
          <p role="alert" className="text-sm text-rose-400">
            {error}
          </p>
        )}
        <button
          type="submit"
          disabled={loading || !email || !password || !password2}
          className="w-full rounded-xl bg-accent py-2.5 font-semibold text-emerald-950 transition hover:brightness-110 disabled:opacity-50"
        >
          {loading ? "Hesap oluşturuluyor…" : "Kayıt ol"}
        </button>
      </form>
      <p className="mt-5 text-center text-sm text-slate-400">
        Zaten hesabın var mı?{" "}
        <Link href={next ? `/login?next=${encodeURIComponent(next)}` : "/login"} className="font-medium text-accent hover:underline">
          Giriş yap
        </Link>
      </p>
    </>
  );
}
