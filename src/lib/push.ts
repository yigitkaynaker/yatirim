import "server-only";
import * as webpush from "web-push";
import { getDb } from "./db";
import { getSetting, setSetting } from "./settings";
import { ValidationError } from "./portfolio";

// Web Push bildirimleri. VAPID anahtarları ilk kullanımda üretilir ve settings
// tablosunda saklanır (.env düzenlemek gerekmez). Birden fazla cihaz abone olabilir.

const SUBJECT = "mailto:yatirim@example.com";

export function getVapidKeys(): { publicKey: string; privateKey: string } {
  const pub = getSetting("vapid_public_key");
  const priv = getSetting("vapid_private_key");
  if (pub && priv) return { publicKey: pub, privateKey: priv };
  const keys = webpush.generateVAPIDKeys();
  setSetting("vapid_public_key", keys.publicKey);
  setSetting("vapid_private_key", keys.privateKey);
  return keys;
}

export interface PushSubscriptionInfo {
  id: number;
  endpointHost: string;
  userAgent: string | null;
  createdAt: string;
  lastOkAt: string | null;
}

interface SubRow {
  id: number;
  endpoint: string;
  p256dh: string;
  auth: string;
  user_agent: string | null;
  created_at: string;
  last_ok_at: string | null;
  fail_count: number;
}

export function listSubscriptions(): PushSubscriptionInfo[] {
  const rows = getDb().prepare("SELECT * FROM push_subscriptions ORDER BY id").all() as unknown as SubRow[];
  return rows.map((r) => ({
    id: r.id,
    endpointHost: safeHost(r.endpoint),
    userAgent: r.user_agent,
    createdAt: r.created_at,
    lastOkAt: r.last_ok_at,
  }));
}

function safeHost(url: string) {
  try {
    return new URL(url).host;
  } catch {
    return "?";
  }
}

/** Tarayıcının PushSubscription.toJSON() çıktısını kaydeder (aynı endpoint varsa günceller). */
export function saveSubscription(body: unknown, userAgent: string | null): { id: number } {
  const b = (body ?? {}) as { endpoint?: unknown; keys?: { p256dh?: unknown; auth?: unknown } };
  const endpoint = typeof b.endpoint === "string" ? b.endpoint : "";
  const p256dh = typeof b.keys?.p256dh === "string" ? b.keys.p256dh : "";
  const auth = typeof b.keys?.auth === "string" ? b.keys.auth : "";
  if (!/^https:\/\//.test(endpoint) || !p256dh || !auth) throw new ValidationError("Abonelik bilgisi geçersiz.");
  getDb()
    .prepare(
      `INSERT INTO push_subscriptions (endpoint, p256dh, auth, user_agent) VALUES (?, ?, ?, ?)
       ON CONFLICT(endpoint) DO UPDATE SET p256dh = excluded.p256dh, auth = excluded.auth,
         user_agent = excluded.user_agent, fail_count = 0`,
    )
    .run(endpoint, p256dh, auth, userAgent?.slice(0, 300) ?? null);
  const row = getDb().prepare("SELECT id FROM push_subscriptions WHERE endpoint = ?").get(endpoint) as { id: number };
  return { id: row.id };
}

export function removeSubscription(opts: { endpoint?: unknown; id?: unknown }): boolean {
  const db = getDb();
  const r =
    typeof opts.endpoint === "string"
      ? db.prepare("DELETE FROM push_subscriptions WHERE endpoint = ?").run(opts.endpoint)
      : db.prepare("DELETE FROM push_subscriptions WHERE id = ?").run(Number(opts.id));
  return Number(r.changes) > 0;
}

export interface PushPayload {
  title: string;
  body: string;
  /** Bildirime dokununca açılacak sayfa */
  url?: string;
  tag?: string;
}

/**
 * Tüm abone cihazlara gönderir. Hata fırlatmaz. 404/410 dönen (süresi dolmuş)
 * abonelikler silinir.
 */
export async function sendPushToAll(payload: PushPayload): Promise<{ sent: number; failed: number }> {
  let rows: SubRow[];
  try {
    rows = getDb().prepare("SELECT * FROM push_subscriptions").all() as unknown as SubRow[];
  } catch {
    return { sent: 0, failed: 0 };
  }
  if (rows.length === 0) return { sent: 0, failed: 0 };
  const { publicKey, privateKey } = getVapidKeys();
  const db = getDb();
  let sent = 0;
  let failed = 0;
  await Promise.all(
    rows.map(async (r) => {
      try {
        await webpush.sendNotification(
          { endpoint: r.endpoint, keys: { p256dh: r.p256dh, auth: r.auth } },
          JSON.stringify(payload),
          { vapidDetails: { subject: SUBJECT, publicKey, privateKey }, TTL: 60 * 60 * 12, timeout: 10_000 },
        );
        db.prepare("UPDATE push_subscriptions SET last_ok_at = datetime('now'), fail_count = 0 WHERE id = ?").run(r.id);
        sent++;
      } catch (err) {
        failed++;
        const status = (err as { statusCode?: number }).statusCode;
        if (status === 404 || status === 410 || r.fail_count >= 9) {
          db.prepare("DELETE FROM push_subscriptions WHERE id = ?").run(r.id);
        } else {
          db.prepare("UPDATE push_subscriptions SET fail_count = fail_count + 1 WHERE id = ?").run(r.id);
        }
        console.warn(`[push] gönderilemedi (${status ?? "ağ"})`, safeHost(r.endpoint));
      }
    }),
  );
  return { sent, failed };
}
