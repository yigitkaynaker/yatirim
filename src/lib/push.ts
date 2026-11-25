import "server-only";
import * as webpush from "web-push";
import { getDb, sqlNow } from "./db";
import { getGlobalSetting, setGlobalSetting } from "./settings";
import { ValidationError } from "./portfolio";
import { getCurrentUserId } from "./userContext";

// Web Push bildirimleri. VAPID anahtarları ilk kullanımda üretilir ve settings
// tablosunda sunucu geneli olarak saklanır (.env düzenlemek gerekmez). Abonelikler kullanıcı
// başınadır: bildirim yalnızca geçerli kullanıcının cihazlarına gider.

const SUBJECT = "mailto:yatirim@example.com";

export async function getVapidKeys(): Promise<{ publicKey: string; privateKey: string }> {
  const pub = await getGlobalSetting("vapid_public_key");
  const priv = await getGlobalSetting("vapid_private_key");
  if (pub && priv) return { publicKey: pub, privateKey: priv };
  const keys = webpush.generateVAPIDKeys();
  await setGlobalSetting("vapid_public_key", keys.publicKey);
  await setGlobalSetting("vapid_private_key", keys.privateKey);
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

export async function listSubscriptions(): Promise<PushSubscriptionInfo[]> {
  const rows = await (await getDb()).all("SELECT * FROM push_subscriptions WHERE user_id = ? ORDER BY id", [await getCurrentUserId()]) as unknown as SubRow[];
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
export async function saveSubscription(body: unknown, userAgent: string | null): Promise<{ id: number }> {
  const b = (body ?? {}) as { endpoint?: unknown; keys?: { p256dh?: unknown; auth?: unknown } };
  const endpoint = typeof b.endpoint === "string" ? b.endpoint : "";
  const p256dh = typeof b.keys?.p256dh === "string" ? b.keys.p256dh : "";
  const auth = typeof b.keys?.auth === "string" ? b.keys.auth : "";
  if (!/^https:\/\//.test(endpoint) || !p256dh || !auth) throw new ValidationError("Abonelik bilgisi geçersiz.");
  const uid = await getCurrentUserId();
  // Aynı cihaz (endpoint) başka bir kullanıcıyla girildiyse abonelik yeni kullanıcıya geçer.
  await (await getDb()).run(`INSERT INTO push_subscriptions (user_id, endpoint, p256dh, auth, user_agent) VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(endpoint) DO UPDATE SET user_id = excluded.user_id, p256dh = excluded.p256dh, auth = excluded.auth,
         user_agent = excluded.user_agent, fail_count = 0`, [uid, endpoint, p256dh, auth, userAgent?.slice(0, 300) ?? null]);
  const row = await (await getDb()).get("SELECT id FROM push_subscriptions WHERE endpoint = ? AND user_id = ?", [endpoint, uid]) as { id: number };
  return { id: row.id };
}

export async function removeSubscription(opts: { endpoint?: unknown; id?: unknown }): Promise<boolean> {
  const db = await getDb();
  const uid = await getCurrentUserId();
  const r =
    typeof opts.endpoint === "string"
      ? await db.run("DELETE FROM push_subscriptions WHERE endpoint = ? AND user_id = ?", [opts.endpoint, uid])
      : await db.run("DELETE FROM push_subscriptions WHERE id = ? AND user_id = ?", [Number(opts.id), uid]);
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
 * Geçerli kullanıcının tüm abone cihazlarına gönderir. Hata fırlatmaz. 404/410 dönen
 * (süresi dolmuş) abonelikler silinir.
 */
export async function sendPushToAll(payload: PushPayload): Promise<{ sent: number; failed: number }> {
  let rows: SubRow[];
  try {
    rows = await (await getDb()).all("SELECT * FROM push_subscriptions WHERE user_id = ?", [await getCurrentUserId()]) as unknown as SubRow[];
  } catch {
    return { sent: 0, failed: 0 };
  }
  if (rows.length === 0) return { sent: 0, failed: 0 };
  const { publicKey, privateKey } = await getVapidKeys();
  const db = await getDb();
  const uid = await getCurrentUserId();
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
        await db.run("UPDATE push_subscriptions SET last_ok_at = ?, fail_count = 0 WHERE id = ? AND user_id = ?", [sqlNow(), r.id, uid]);
        sent++;
      } catch (err) {
        failed++;
        const status = (err as { statusCode?: number }).statusCode;
        if (status === 404 || status === 410 || r.fail_count >= 9) {
          await db.run("DELETE FROM push_subscriptions WHERE id = ? AND user_id = ?", [r.id, uid]);
        } else {
          await db.run("UPDATE push_subscriptions SET fail_count = fail_count + 1 WHERE id = ? AND user_id = ?", [r.id, uid]);
        }
        console.warn(`[push] gönderilemedi (${status ?? "ağ"})`, safeHost(r.endpoint));
      }
    }),
  );
  return { sent, failed };
}
