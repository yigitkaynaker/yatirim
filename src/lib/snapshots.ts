import "server-only";
import { getDb } from "./db";
import { MODES, type Mode } from "./assets";
import { getPortfolio, todayIstanbul } from "./portfolio";
import { getCurrentUserId } from "./userContext";

// Günlük portföy değeri anlık görüntüleri (gerçek ve sanal ayrı).
// Emir izleyici döngüsünden çağrılır. Gün başına mod başına tek satır tutulur;
// gün içinde en fazla SNAPSHOT_EVERY_MS'de bir güncellenir, böylece günün son
// değeri (kapanışa yakın) kalır.

export const SNAPSHOT_EVERY_MS = 10 * 60_000;

export interface SnapshotPoint {
  date: string;
  valueTry: number;
  costTry: number;
}

/** Kullanıcı başına son kayıt zamanı */
const g = globalThis as unknown as { __yatirimSnapshotAt?: Map<number, number> };
const lastAt = () => (g.__yatirimSnapshotAt ??= new Map());

/**
 * Gerekirse bugünün anlık görüntüsünü kaydeder. Hata fırlatmaz.
 * 10 dakikalık aralık yalnızca en az bir kayıt yazılınca başlar; böylece boş
 * portföyde ilk işlem eklenince ilk kayıt bir sonraki turda (~30 sn) oluşur,
 * fiyatlar bayatken atlanan kayıt da bir sonraki turda yeniden denenir.
 */
export async function maybeRecordSnapshots(force = false) {
  const now = Date.now();
  const uid = await getCurrentUserId();
  const prev = lastAt().get(uid);
  if (!force && prev && now - prev < SNAPSHOT_EVERY_MS) return;
  const date = todayIstanbul();
  const db = await getDb();
  for (const mode of MODES) {
    try {
      const started = !!(await db.get("SELECT 1 FROM portfolio_snapshots WHERE user_id = ? AND mode = ? LIMIT 1", [uid, mode]));
      // Portföy hiç kullanılmadıysa fiyat çekmeden geç (aralık başlamadığı için her turda bakılır).
      if (!started && !(await db.get("SELECT 1 FROM transactions WHERE user_id = ? AND mode = ? AND converted_at IS NULL LIMIT 1", [uid, mode]))) continue;
      const s = await getPortfolio(mode);
      // Fiyatı alınamayan varlık varsa yanlış bir değer yazmayalım.
      if (s.totals.incomplete) continue;
      // Bayat (son bilinen) fiyatlarla hesaplanan değeri de yazma: çizgi grafikte
      // sahte düzlük/sıçrama oluşturur. Kaynak düzelince sonraki turda yazılır.
      if (s.totals.anyStale) continue;
      // Portföy hiç kullanılmadıysa kayıt başlatma (grafik ilk gerçek kayıttan başlar).
      if (s.holdings.length === 0 && !started) continue;
      await db.run(`INSERT INTO portfolio_snapshots (user_id, date, mode, value_try, cost_try, updated_at) VALUES (?, ?, ?, ?, ?, ?)
         ON CONFLICT(user_id, date, mode) DO UPDATE SET value_try=excluded.value_try, cost_try=excluded.cost_try, updated_at=excluded.updated_at`, [uid, date, mode, s.totals.valueTry, s.totals.costTry, now]);
      lastAt().set(uid, now);
    } catch (err) {
      console.error(`[anlık görüntü] ${mode} kaydedilemedi`, err);
    }
  }
}

/** Bir modun günlük değer geçmişi (ilk kayıttan itibaren, tarihe göre artan). */
export async function listSnapshots(mode: Mode): Promise<SnapshotPoint[]> {
  const rows = await (await getDb()).all("SELECT date, value_try, cost_try FROM portfolio_snapshots WHERE user_id = ? AND mode = ? ORDER BY date", [await getCurrentUserId(), mode]) as { date: string; value_try: number; cost_try: number }[];
  return rows.map((r) => ({ date: r.date, valueTry: r.value_try, costTry: r.cost_try }));
}
