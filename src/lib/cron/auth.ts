import "server-only";
import { createHash, timingSafeEqual } from "node:crypto";

// Nöbet uçları oturum çerezi yerine "Authorization: Bearer <CRON_SECRET>" başlığı ister
// (cron-job.org ve GitHub Actions bu başlığı gönderir). Karşılaştırma sabit sürelidir.

export function cronAuthorized(req: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret || secret.length < 16) return false;
  const header = req.headers.get("authorization") ?? "";
  const m = /^Bearer\s+(.+)$/i.exec(header.trim());
  if (!m) return false;
  // Uzunluk farkını da gizlemek için iki tarafın özeti karşılaştırılır.
  const a = createHash("sha256").update(m[1]).digest();
  const b = createHash("sha256").update(secret).digest();
  return timingSafeEqual(a, b);
}

/** Çağıranı kısaca etiketler (tick_runs.source) */
export function cronSource(req: Request): string {
  const explicit = new URL(req.url).searchParams.get("kaynak");
  if (explicit) return explicit.slice(0, 30);
  const ua = req.headers.get("user-agent") ?? "";
  if (/cron-job\.org/i.test(ua)) return "cron-job.org";
  if (/github/i.test(ua)) return "github";
  return ua ? ua.slice(0, 30) : "bilinmiyor";
}
