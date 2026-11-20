import "server-only";

// Kibar dış istekler: tarayıcı User-Agent'ı, zaman aşımı ve kaynak başına geri
// çekilme (hata alınca bir süre o kaynağa hiç istek atılmaz; süre her hatada
// ikiye katlanır, başarıda sıfırlanır). TEFAS, Truncgil, Genelpara, KAP ve Yahoo
// temettü uç noktaları bunu kullanır.

export const BROWSER_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36";

const DEFAULT_TIMEOUT_MS = 12_000;

interface Backoff {
  failures: number;
  until: number;
}

const g = globalThis as unknown as { __yatirimBackoff?: Map<string, Backoff> };
function backoffs() {
  return (g.__yatirimBackoff ??= new Map());
}

export class BackoffError extends Error {
  constructor(provider: string, until: number) {
    super(`${provider} geçici olarak denenmiyor (${Math.ceil((until - Date.now()) / 1000)} sn)`);
  }
}

/** Kaynak şu an geri çekilme süresinde mi */
export function inBackoff(provider: string): boolean {
  const b = backoffs().get(provider);
  return !!b && Date.now() < b.until;
}

export function markFailure(provider: string, baseMs = 30_000, maxMs = 30 * 60_000) {
  const b = backoffs().get(provider) ?? { failures: 0, until: 0 };
  b.failures += 1;
  b.until = Date.now() + Math.min(maxMs, baseMs * 2 ** (b.failures - 1));
  backoffs().set(provider, b);
}

export function markSuccess(provider: string) {
  backoffs().delete(provider);
}

/**
 * Dış kaynağa istek. Geri çekilme süresindeyse BackoffError fırlatır; HTTP hatası,
 * zaman aşımı ya da ağ hatasında geri çekilmeyi başlatıp hatayı fırlatır.
 * Yanıt metin olarak döner (JSON ayrıştırmayı çağıran yapar).
 */
export async function politeFetch(
  provider: string,
  url: string,
  init: { method?: "GET" | "POST"; json?: unknown; timeoutMs?: number; backoffBaseMs?: number; backoffMaxMs?: number; xml?: boolean } = {},
): Promise<string> {
  const b = backoffs().get(provider);
  if (b && Date.now() < b.until) throw new BackoffError(provider, b.until);
  try {
    const res = await fetch(url, {
      method: init.method ?? (init.json !== undefined ? "POST" : "GET"),
      headers: {
        "User-Agent": BROWSER_UA,
        Accept: init.xml ? "application/rss+xml, application/xml, text/xml, */*" : "application/json, text/plain, */*",
        "Accept-Language": "tr-TR,tr;q=0.9,en;q=0.8",
        ...(init.json !== undefined ? { "Content-Type": "application/json" } : {}),
      },
      body: init.json !== undefined ? JSON.stringify(init.json) : undefined,
      signal: AbortSignal.timeout(init.timeoutMs ?? DEFAULT_TIMEOUT_MS),
      cache: "no-store",
    });
    const text = await res.text();
    if (!res.ok) throw new Error(`${provider} HTTP ${res.status}`);
    // Bot koruması / yanlış istek: JSON yerine HTML sayfası
    // (xml: RSS beslemesi beklenir; içinde <rss>/<feed> yoksa hata sayılır)
    if (init.xml ? !/<rss[\s>]|<feed[\s>]/.test(text.slice(0, 3000)) : /^\s*</.test(text)) throw new Error(`${provider} beklenmeyen yanıt (HTML)`);
    markSuccess(provider);
    return text;
  } catch (err) {
    markFailure(provider, init.backoffBaseMs, init.backoffMaxMs);
    throw err;
  }
}
