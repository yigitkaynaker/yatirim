// "Tüm verilerimi indir" ile alınan JSON dosyasını komut satırından Neon'a (Postgres) geri yükler.
// Bulutta tarayıcıdan yükleme ~4 MB ile sınırlıdır (Vercel istek boyutu); büyük dosyalar için:
//   npm run geri-yukle:json -- --dosya yatirim-veri-2026-11-21.json [--deneme] [--uzerine-yaz]
// --deneme: her şeyi yapar, sayıları doğrular, sonra GERİ ALIR (Neon değişmez).
// --uzerine-yaz: hedefte veri varsa yine de sil ve dosyadakini yükle (yoksa durur).
// Hedef: DATABASE_URL_UNPOOLED (yoksa DATABASE_URL); ortamdan ya da .env.bulut dosyasından.
// Dosyada gizli anahtarlar yoksa hedefteki mevcut anahtarlar korunur.
import fs from "node:fs";
import { openPostgres } from "../src/lib/db/postgres";
import { dbFromDriver } from "../src/lib/db/core";
import { migratePg } from "../src/lib/db/migratePg";
import { MIGRATIONS } from "../src/lib/db/migrationsSqlite";
import { loadAll, parseDump, rowCounts, type DataDump } from "../src/lib/db/transfer";

const args = process.argv.slice(2);
const arg = (n: string) => {
  const i = args.indexOf(n);
  return i >= 0 ? args[i + 1] : undefined;
};
const dry = args.includes("--deneme") || args.includes("--dry-run");
const overwrite = args.includes("--uzerine-yaz");
const file = arg("--dosya");
const target = process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL;

if (!file || !fs.existsSync(file)) {
  console.error("JSON dosyası bulunamadı. Örnek: npm run geri-yukle:json -- --dosya yatirim-veri-2026-11-21.json");
  process.exit(1);
}
if (!target) {
  console.error("DATABASE_URL_UNPOOLED tanımlı değil. .env.bulut dosyasına ekleyin (BULUT.md).");
  process.exit(1);
}

let dump: DataDump;
try {
  dump = parseDump(JSON.parse(fs.readFileSync(file, "utf8")));
} catch (err) {
  console.error("Dosya okunamadı:", err instanceof SyntaxError ? "geçerli bir JSON değil." : (err as Error).message);
  process.exit(1);
}
if (dump.schemaVersion > MIGRATIONS.length) {
  console.error("Bu dosya uygulamanın daha yeni bir sürümünden; önce kodu güncelleyin (git pull).");
  process.exit(1);
}

class DryRun extends Error {}

const driver = openPostgres(target, { max: 1 });
let failed = false;
try {
  const pg = dbFromDriver(driver);
  console.log(`Dosya: ${file} (${dump.exportedAt}, gizli anahtarlar ${dump.includesSecrets === false ? "yok" : "dahil"})`);
  await migratePg(pg, (m) => console.log(`[şema] ${m}`));
  const existing = await rowCounts(pg, ["transactions", "orders", "alarms"]);
  if (Object.values(existing).some((n) => n > 0) && !overwrite && !dry) {
    console.error(`Hedefte zaten veri var (${JSON.stringify(existing)}). Dosyadakiyle DEĞİŞTİRMEK için --uzerine-yaz ekleyin.`);
    process.exit(1);
  }
  const tables = Object.keys(dump.tables);
  const verify = async () => {
    const got = await rowCounts(pg, tables);
    let ok = true;
    console.log("\nTablo                  dosya   hedef");
    for (const t of tables) {
      const want = dump.tables[t].length;
      // settings: dosyada olmayan gizli anahtarlar korunduğu için hedefte fazlası olabilir
      const same = t === "settings" ? got[t] >= want : got[t] === want;
      if (!same) ok = false;
      console.log(`${t.padEnd(22)}${String(want).padStart(6)}  ${String(got[t]).padStart(6)}${same ? "" : "  ← FARKLI"}`);
    }
    return ok;
  };
  try {
    await pg.tx(async () => {
      await loadAll(pg, dump, { replace: true });
      if (!(await verify())) throw new Error("Satır sayıları tutmuyor; hiçbir şey kaydedilmedi.");
      if (dry) throw new DryRun();
    });
    console.log("\nGeri yükleme tamamlandı; satır sayıları doğrulandı.");
  } catch (err) {
    if (err instanceof DryRun) console.log("\nDENEME: sayılar doğrulandı, değişiklikler geri alındı (Neon değişmedi).");
    else throw err;
  }
} catch (err) {
  failed = true;
  console.error("\nHATA:", (err as Error).message);
} finally {
  await driver.close();
}
process.exit(failed ? 1 : 0);
