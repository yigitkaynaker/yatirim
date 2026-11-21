import { PG_MIGRATIONS } from "./migrationsPg";
import type { Db } from "./types";

// Postgres şema geçişlerini uygular (npm run db:migrate; testler). Doğrudan (havuzsuz)
// bağlantıyla çalıştırılmalıdır: DATABASE_URL_UNPOOLED. Her geçiş kendi işleminde;
// eşzamanlı iki çalıştırma schema_migrations tablosu kilitlenerek sıraya sokulur.

export async function migratePg(db: Db, log: (m: string) => void = () => {}): Promise<number[]> {
  await db.exec(`CREATE TABLE IF NOT EXISTS schema_migrations (
    id          BIGINT PRIMARY KEY,
    name        TEXT NOT NULL,
    applied_at  TEXT NOT NULL
  )`);
  const applied: number[] = [];
  for (const m of PG_MIGRATIONS) {
    const done = await db.tx(async () => {
      await db.exec("LOCK TABLE schema_migrations IN EXCLUSIVE MODE");
      if (await db.get("SELECT 1 AS x FROM schema_migrations WHERE id = ?", [m.id])) return false;
      await db.exec(m.sql);
      await db.run("INSERT INTO schema_migrations (id, name, applied_at) VALUES (?, ?, ?)", [m.id, m.name, new Date().toISOString()]);
      return true;
    });
    if (done) {
      applied.push(m.id);
      log(`geçiş ${m.id} uygulandı: ${m.name}`);
    }
  }
  return applied;
}
