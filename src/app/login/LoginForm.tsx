"use client";

import { useState } from "react";
import { useSearchParams } from "next/navigation";

export function LoginForm() {
  const params = useSearchParams();
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
        body: JSON.stringify({ password }),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        setError(data.error ?? "Giriş yapılamadı.");
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
      <label className="block">
        <span className="mb-1.5 block text-sm text-slate-300">Şifre</span>
        <input
          type="password"
          autoComplete="current-password"
          autoFocus
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="w-full rounded-xl border border-line bg-bg px-3.5 py-2.5 outline-none focus:border-accent"
        />
      </label>
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
