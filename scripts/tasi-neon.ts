// Yerel SQLite veritabanını Neon'a (Postgres) taşır.
//   npm run tasi:neon -- --kaynak data/yatirim.db [--deneme] [--uzerine-yaz]
// --deneme (ya da --dry-run): her şeyi yapar, sayıları doğrular, sonra GERİ ALIR (Neon değişmez).
// --uzerine-yaz: hedefte veri varsa yine de sil ve yeniden yükle (yoksa durur).
// Hedef: DATABASE_URL_UNPOOLED (yoksa DATABASE_URL); ortamdan ya da .env.bulut dosyasından.
// Kaynak dosya değişmez: geçici bir kopyası açılır (gerekirse kopyada şema güncellenir).
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { openSqlite } from "../src/lib/db/sqlite";
import { openPostgres } from "../src/lib/db/postgres";
import { dbFromDriver } from "../src/lib/db/core";
import { migratePg } from "../src/lib/db/migratePg";
import { MIGRATIONS } from "../src/lib/db/migrationsSqlite";
import { DATA_TABLES, dumpAll, loadAll, rowCounts } from "../src/lib/db/transfer";

const args = process.argv.slice(2);
const arg = (n: string) => {
  const i = args.indexOf(n);
  return i >= 0 ? args[i + 1] : undefined;
};
const dry = args.includes("--deneme") || args.includes("--dry-run");
const overwrite = args.includes("--uzerine-yaz");
const source = arg("--kaynak");
const target = process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL;

if (!source || !fs.existsSync(source)) {
  console.error("Kaynak SQLite dosyası bulunamadı. Örnek: npm run tasi:neon -- --kaynak data/yatirim.db");
  process.exit(1);
}
if (!target) {
  console.error("DATABASE_URL_UNPOOLED tanımlı değil. .env.bulut dosyasına ekleyin (BULUT.md).");
  process.exit(1);
}

class DryRun extends Error {}

// Kaynağın tutarlı bir kopyası (WAL dosyaları dahil), kopyada şema güncellenir.
const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "yatirim-tasi-"));
const copy = path.join(tmpDir, "kaynak.db");
for (const ext of ["", "-wal", "-shm"]) if (fs.existsSync(source + ext)) fs.copyFileSync(source + ext, copy + ext);

const src = await openSqlite(copy, path.join(tmpDir, "yedek"));
const pgDriver = openPostgres(target, { max: 1 });
let failed = false;
try {
  const srcDb = dbFromDriver(src);
  const pg = dbFromDriver(pgDriver);
  console.log(`Kaynak: ${source} (SQLite şema ${MIGRATIONS.length})`);
  await migratePg(pg, (m) => console.log(`[şema] ${m}`));

  const dump = await dumpAll(srcDb, { includeCaches: true, includeSecrets: true, schemaVersion: MIGRATIONS.length });
  const expected = await rowCounts(srcDb);
  const existing = await rowCounts(pg, ["transactions", "orders", "alarms"]);
  const hasData = Object.values(existing).some((n) => n > 0);
  if (hasData && !overwrite && !dry) {
    console.error(`Hedefte zaten veri var (${JSON.stringify(existing)}). Silip yeniden yüklemek için --uzerine-yaz ekleyin.`);
    process.exit(1);
  }

  const verify = async () => {
    const got = await rowCounts(pg);
    let ok = true;
    console.log("\nTablo                 kaynak   hedef");
    for (const t of DATA_TABLES) {
      const mark = got[t] === expected[t] ? "" : "  ← FARKLI";
      if (mark) ok = false;
      console.log(`${t.padEnd(22)}${String(expected[t]).padStart(6)}  ${String(got[t]).padStart(6)}${mark}`);
    }
    return ok;
  };

  try {
    await pg.tx(async () => {
      await loadAll(pg, dump, { replace: true });
      if (!(await verify())) throw new Error("Satır sayıları tutmuyor; hiçbir şey kaydedilmedi.");
      if (dry) throw new DryRun();
    });
    console.log("\nTaşıma tamamlandı; satır sayıları doğrulandı.");
    // İşlem sonrası (kalıcı) yeniden doğrula
    if (!(await verify())) throw new Error("Kayıttan sonra sayılar tutmuyor!");
  } catch (err) {
    if (err instanceof DryRun) console.log("\nDENEME: sayılar doğrulandı, değişiklikler geri alındı (Neon değişmedi).");
    else throw err;
  }
} catch (err) {
  failed = true;
  console.error("\nHATA:", (err as Error).message);
} finally {
  await pgDriver.close();
  await src.close();
  fs.rmSync(tmpDir, { recursive: true, force: true });
}
process.exit(failed ? 1 : 0);
