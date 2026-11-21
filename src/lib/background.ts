import "server-only";
import { detached } from "./db";

// Arka plan işleri (anlık bildirim gönderme, kur tamamlama…): yanıtı bekletmeden çalışır.
// Yerel modda sunucu hep açık olduğu için "ateşle ve unut" yeterlidir. Bulut modunda
// (sunucusuz) yanıt dönünce işlev dondurulabilir; bu yüzden işler burada izlenir ve
// api.ts / nöbet uçları yanıttan sonra drainBackground() ile bitmelerini bekler (after()).
// İş açık bir veritabanı işleminin dışında başlatılır (detached).

const g = globalThis as unknown as { __yatirimBg?: Set<Promise<unknown>> };
const pending = () => (g.__yatirimBg ??= new Set());

/** Bir işi arka planda çalıştırır; hata fırlatmaz. */
export function background(work: Promise<unknown> | (() => Promise<unknown>)): void {
  const p = detached(() => (typeof work === "function" ? work() : work));
  const tracked: Promise<unknown> = p
    .catch((err: unknown) => console.warn("[arka plan] hata", (err as Error)?.message ?? err))
    .finally(() => pending().delete(tracked));
  pending().add(tracked);
}

export function hasBackgroundWork(): boolean {
  return pending().size > 0;
}

/** Bekleyen arka plan işlerinin bitmesini en fazla timeoutMs bekler. */
export async function drainBackground(timeoutMs = 20_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (pending().size > 0 && Date.now() < deadline) {
    let timer: ReturnType<typeof setTimeout> | undefined;
    await Promise.race([
      Promise.allSettled([...pending()]),
      new Promise((r) => {
        timer = setTimeout(r, Math.max(0, deadline - Date.now()));
      }),
    ]);
    clearTimeout(timer);
  }
}
