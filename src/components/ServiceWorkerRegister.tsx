"use client";

import { useEffect } from "react";

/**
 * Service worker'ı kaydeder. Tarayıcılar SW'yi yalnızca güvenli bağlamda
 * (HTTPS ya da localhost) çalıştırır; Tailscale için README'ye bakın.
 */
export function ServiceWorkerRegister() {
  useEffect(() => {
    if (!("serviceWorker" in navigator) || !window.isSecureContext) return;
    navigator.serviceWorker.register("/sw.js", { scope: "/" }).catch((err) => {
      console.warn("Service worker kaydedilemedi:", err);
    });
  }, []);
  return null;
}
