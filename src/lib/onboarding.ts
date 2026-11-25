import "server-only";
import { getDb } from "./db";
import { getCurrentUserId } from "./userContext";

// "İlk adımlar" kartının durumu: maddeler gerçek veriden işaretlenir. Yalnızca okur; şema
// değişikliği yoktur (SQLite ve Postgres'te aynı sorgular).

export interface OnboardingStatus {
  /** Sanal portföyde en az bir işlem (gerçeğe dönüştürülmüş olsa da) */
  sanal: boolean;
  izleme: boolean;
  /** En az bir emir (her durumda) ya da alarm */
  emirAlarm: boolean;
  /** Anlık bildirime abone en az bir cihaz */
  bildirim: boolean;
}

export async function getOnboardingStatus(): Promise<OnboardingStatus> {
  const db = await getDb();
  const uid = await getCurrentUserId();
  const any = async (sql: string) => (await db.get(sql, [uid])) != null;
  const [sanal, izleme, emir, alarm, bildirim] = await Promise.all([
    any("SELECT 1 AS x FROM transactions WHERE user_id = ? AND mode = 'virtual' LIMIT 1"),
    any("SELECT 1 AS x FROM watchlist WHERE user_id = ? LIMIT 1"),
    any("SELECT 1 AS x FROM orders WHERE user_id = ? LIMIT 1"),
    any("SELECT 1 AS x FROM alarms WHERE user_id = ? LIMIT 1"),
    any("SELECT 1 AS x FROM push_subscriptions WHERE user_id = ? LIMIT 1"),
  ]);
  return { sanal, izleme, emirAlarm: emir || alarm, bildirim };
}
