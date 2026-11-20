import "server-only";
import { getDb } from "./db";
import { MODES, type Mode } from "./assets";
import { getPortfolio, todayIstanbul } from "./portfolio";

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

const g = globalThis as unknown as { __yatirimSnapshotAt?: number };

/** Gerekirse bugünün anlık görüntüsünü kaydeder. Hata fırlatmaz. */
export async function maybeRecordSnapshots(force = false) {
  const now = Date.now();
  if (!force && g.__yatirimSnapshotAt && now - g.__yatirimSnapshotAt < SNAPSHOT_EVERY_MS) return;
  g.__yatirimSnapshotAt = now;
  const date = todayIstanbul();
  const db = getDb();
  for (const mode of MODES) {
    try {
      const s = await getPortfolio(mode);
      // Fiyatı alınamayan varlık varsa yanlış bir değer yazmayalım.
      if (s.totals.incomplete) continue;
      // Portföy hiç kullanılmadıysa kayıt başlatma (grafik ilk gerçek kayıttan başlar).
      if (s.holdings.length === 0) {
        const any = db.prepare("SELECT 1 FROM portfolio_snapshots WHERE mode = ? LIMIT 1").get(mode);
        if (!any) continue;
      }
      db.prepare(
        `INSERT INTO portfolio_snapshots (date, mode, value_try, cost_try, updated_at) VALUES (?, ?, ?, ?, ?)
         ON CONFLICT(date, mode) DO UPDATE SET value_try=excluded.value_try, cost_try=excluded.cost_try, updated_at=excluded.updated_at`,
      ).run(date, mode, s.totals.valueTry, s.totals.costTry, now);
    } catch (err) {
      console.error(`[anlık görüntü] ${mode} kaydedilemedi`, err);
    }
  }
}

/** Bir modun günlük değer geçmişi (ilk kayıttan itibaren, tarihe göre artan). */
export function listSnapshots(mode: Mode): SnapshotPoint[] {
  const rows = getDb()
    .prepare("SELECT date, value_try, cost_try FROM portfolio_snapshots WHERE mode = ? ORDER BY date")
    .all(mode) as { date: string; value_try: number; cost_try: number }[];
  return rows.map((r) => ({ date: r.date, valueTry: r.value_try, costTry: r.cost_try }));
}
