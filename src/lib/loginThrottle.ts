import "server-only";
import { getDb } from "./db";

// Giriş kaba kuvvet koruması: art arda hatalı denemelerde gecikme. Sayaç istemci adresi (IP)
// başınadır; böylece bir başkasının hatalı denemeleri kullanıcının girişini yavaşlatmaz. Sayaç
// zamanla azalır (her DECAY_MS'de bir). Veritabanında tutulur (login_failures): bulutta her istek
// ayrı bir sunucusuz örnekte çalışabildiği için bellekteki sayaç yetmez. Her iki modda aynıdır.

export const DECAY_MS = 60_000;
/** Bu süreden eski kayıtlar silinir (sayaç zaten sıfıra inmiştir) */
const KEEP_MS = 24 * 60 * 60_000;

/** İstemci adresi: proxy başlıkları (Vercel, tailscale serve vb.), yoksa "yerel". */
export function clientKey(req: Request): string {
  const xff = req.headers.get("x-forwarded-for");
  const first = xff?.split(",")[0]?.trim();
  return (first || req.headers.get("x-real-ip")?.trim() || "yerel").slice(0, 100);
}

/** Hatalı denemeyi kaydeder; zamanla azalmış güncel sayı (bu deneme dahil). Atomik (tek ifade). */
export async function recordLoginFailure(key: string, now = Date.now()): Promise<number> {
  const db = await getDb();
  const row = await db.get<{ count: number }>(
    `INSERT INTO login_failures (ip, count, last_at) VALUES (?, 1, ?)
     ON CONFLICT (ip) DO UPDATE SET
       count = CASE WHEN login_failures.count - (excluded.last_at - login_failures.last_at) / ${DECAY_MS} > 0
                    THEN login_failures.count - (excluded.last_at - login_failures.last_at) / ${DECAY_MS} + 1
                    ELSE 1 END,
       last_at = excluded.last_at
     RETURNING count`,
    [key, now],
  );
  await db.run("DELETE FROM login_failures WHERE last_at < ?", [now - KEEP_MS]);
  return row?.count ?? 1;
}

/** Başarılı girişte sayaç sıfırlanır. */
export async function clearLoginFailures(key: string): Promise<void> {
  await (await getDb()).run("DELETE FROM login_failures WHERE ip = ?", [key]);
}

/** Hatalı denemeden sonra beklenecek süre (ms) */
export function failureDelayMs(count: number): number {
  return Math.min(500 * count, 5000);
}
