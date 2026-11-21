// Testler için veritabanı yardımcıları: her iki modda (SQLite / Postgres) boş bir veritabanı.
// Postgres modu (npm run test:pg): DATABASE_URL yerel PGlite sunucusunu gösterir; sıfırlama
// şemayı silip geçişleri yeniden uygular.
import fs from "node:fs";

export const PG = !!process.env.DATABASE_URL;

/** Veritabanını tamamen sıfırlar (SQLite: dosyalar silinir; Postgres: şema yeniden kurulur). */
export async function resetDatabase() {
  const db = await import("../src/lib/db");
  await db.closeDb();
  (globalThis as { __yatirimLeasesSeeded?: boolean }).__yatirimLeasesSeeded = false;
  if (!PG) {
    for (const ext of ["", "-wal", "-shm"]) fs.rmSync(db.dbPath() + ext, { force: true });
    fs.rmSync(db.backupDir(), { recursive: true, force: true });
    return;
  }
  const { openPostgres } = await import("../src/lib/db/postgres");
  const { dbFromDriver } = await import("../src/lib/db/core");
  const { migratePg } = await import("../src/lib/db/migratePg");
  const driver = openPostgres(process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL!, { max: 1 });
  try {
    const pg = dbFromDriver(driver);
    await pg.exec("DROP SCHEMA IF EXISTS public CASCADE; CREATE SCHEMA public;");
    await migratePg(pg);
  } finally {
    await driver.close();
  }
}
