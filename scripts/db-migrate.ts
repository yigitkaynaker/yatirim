// Postgres (Neon) şema geçişlerini uygular: npm run db:migrate
// Bağlantı: DATABASE_URL_UNPOOLED (doğrudan; Neon'un "-pooler" olmayan adresi), yoksa DATABASE_URL.
// Değişkenler ortamdan ya da proje klasöründeki .env.bulut dosyasından okunur (BULUT.md).
import { openPostgres } from "../src/lib/db/postgres";
import { dbFromDriver } from "../src/lib/db/core";
import { migratePg } from "../src/lib/db/migratePg";
import { PG_SCHEMA_VERSION } from "../src/lib/db/migrationsPg";

const url = process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL;
if (!url) {
  if (process.env.VERCEL) {
    console.log("[db:migrate] DATABASE_URL tanımlı değil; geçiş atlandı.");
    process.exit(0);
  }
  console.error("DATABASE_URL_UNPOOLED (ya da DATABASE_URL) tanımlı değil. .env.bulut dosyasına ekleyin (BULUT.md).");
  process.exit(1);
}
const driver = openPostgres(url, { max: 1 });
try {
  const applied = await migratePg(dbFromDriver(driver), (m) => console.log(`[db:migrate] ${m}`));
  console.log(applied.length ? `[db:migrate] tamam (${applied.length} geçiş, şema ${PG_SCHEMA_VERSION})` : `[db:migrate] şema güncel (sürüm ${PG_SCHEMA_VERSION})`);
} catch (err) {
  console.error("[db:migrate] HATA:", (err as Error).message);
  process.exitCode = 1;
} finally {
  await driver.close();
}
