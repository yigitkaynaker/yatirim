"use client";

import { useCallback, useEffect, useState } from "react";

export const REFRESH_MS = 30_000;

export class UnauthorizedError extends Error {}

/** JSON çeker; 401 olursa UnauthorizedError fırlatır. */
export async function fetchJson<T>(url: string): Promise<T> {
  const res = await fetch(url, { cache: "no-store" });
  if (res.status === 401) throw new UnauthorizedError();
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return (await res.json()) as T;
}

/** Oturum düştüyse giriş sayfasına tam sayfa yönlendirme (çerez durumu sıfırlansın). */
export function goToLogin() {
  const url = new URL("/login", window.location.origin);
  url.searchParams.set("next", window.location.pathname);
  window.location.assign(url);
}

/**
 * JSON uç noktasını belirli aralıklarla çeker. Sekme gizliyken durur,
 * görünür olunca hemen yeniler. Hata olursa son başarılı veri korunur.
 */
export function usePolling<T>(url: string, intervalMs = REFRESH_MS) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [lastSuccess, setLastSuccess] = useState<number | null>(null);

  const run = useCallback(
    (force: boolean) =>
      fetchJson<T>(force ? `${url}${url.includes("?") ? "&" : "?"}force=1` : url)
        .then((d) => {
          setData(d);
          setError(null);
          setLastSuccess(Date.now());
        })
        .catch((err: unknown) => {
          if (err instanceof UnauthorizedError) return goToLogin();
          setError("Veriler güncellenemedi; son bilinen değerler gösteriliyor.");
        })
        .finally(() => setLoading(false)),
    [url],
  );

  useEffect(() => {
    void run(false);
    const timer = setInterval(() => {
      if (document.visibilityState === "visible") void run(false);
    }, intervalMs);
    const onVisible = () => {
      if (document.visibilityState === "visible") void run(false);
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [run, intervalMs]);

  /** Elle yenileme (olay işleyicilerinden çağrılır). force: önbelleği atla */
  const reload = useCallback(
    (force = false) => {
      setLoading(true);
      return run(force);
    },
    [run],
  );

  return { data, error, loading, lastSuccess, reload };
}
