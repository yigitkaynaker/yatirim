// npm run test:pg — tüm test takımlarını Postgres modunda çalıştırır. Gömülü Postgres
// (PGlite) başlatılır, DATABASE_URL ona yönlendirilir, şema kurulur; her takım boş
// veritabanıyla başlar. Alt süreçler eşzamansız başlatılır (sunucu bu süreçte çalışıyor).
// Gerçek Neon'a ya da data/ klasörüne dokunmaz.
import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { startPgDevServer } from "./pg-dev-server.mjs";

const SUITES = [
  ["test-pg.ts", true],
  ["test-concurrency.ts", true],
  ["test-indicators.ts", false],
  ["test-fx.ts", false],
  ["test-sources.ts", false],
  ["test-batchb.ts", true],
  ["test-batchc.ts", true],
  ["test-ai.ts", true],
  ["test-help.ts", true],
  ["test-users.ts", true],
  ["test-gemini.ts", true],
];

/** Alt süreci çalıştırır; çıkış kodu */
function run(args, env) {
  return new Promise((resolve) => {
    const p = spawn(process.execPath, args, { env, stdio: "inherit" });
    p.on("exit", (code) => resolve(code ?? 1));
  });
}

const server = await startPgDevServer({ port: 0 });
console.log(`Gömülü Postgres: ${server.url}\n`);
const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "yatirim-pgtest-"));
const env = { ...process.env, DATABASE_URL: server.url, DATABASE_URL_UNPOOLED: server.url, YATIRIM_DATA_DIR: dataDir };
const only = process.argv[2];
let failed = [];
try {
  for (const [file, rsc] of SUITES) {
    if (only && !file.includes(only)) continue;
    console.log(`=== ${file} (Postgres)`);
    // Her takım boş şemayla başlar
    const reset = await run(["--conditions=react-server", "--import", "./scripts/ts-hooks.mjs", "--input-type=module", "-e", "const m = await import('./scripts/test-db.ts'); await m.resetDatabase();"], env);
    if (reset !== 0) throw new Error("şema sıfırlanamadı");
    const args = [...(rsc ? ["--conditions=react-server"] : []), "--import", "./scripts/ts-hooks.mjs", `scripts/${file}`];
    if ((await run(args, env)) !== 0) failed.push(file);
  }
} finally {
  await server.stop();
  fs.rmSync(dataDir, { recursive: true, force: true });
}
if (failed.length) {
  console.error(`\nBAŞARISIZ: ${failed.join(", ")}`);
  process.exit(1);
}
console.log("\nTüm takımlar Postgres modunda geçti.");
