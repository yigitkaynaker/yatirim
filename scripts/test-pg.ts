// Bulut modu testleri (Postgres; npm run test:pg içinden çalışır, DATABASE_URL yerel PGlite'ı gösterir):
// - Postgres şeması son SQLite şemasıyla aynı tablo / sütunlara sahip
// - "?" → $n çevirisi dizgelere / yorumlara dokunmaz
// - görev kilidi: eşzamanlı iki alımdan yalnızca biri kazanır; eşzamanlı iki nöbet turu görevleri bir kez çalıştırır
// - emir eşzamanlı iki kontrolde TAM BİR KEZ gerçekleşir
// - nöbet kapısı: pencere dışında veritabanına dokunmadan döner
// Ağ kullanmaz (fiyatlar önbelleğe yazılır).
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";

if (!process.env.DATABASE_URL) {
  console.error("Bu test Postgres modunda çalışır: npm run test:pg");
  process.exit(1);
}

const { resetDatabase } = await import("./test-db");
const db = await import("../src/lib/db");
const { MIGRATIONS } = await import("../src/lib/db/migrationsSqlite");
const { toPgPlaceholders } = await import("../src/lib/db/placeholders");
const { tickGate } = await import("../src/lib/cron/schedule");
// Çok kullanıcılı mod: betik sahibin (kullanıcı 1) bağlamında çalışır.
(await import("../src/lib/userContext")).enterUserForScripts(1);

let passed = 0;
async function test(name: string, fn: () => void | Promise<void>) {
  await fn();
  passed++;
  console.log(`  ✓ ${name}`);
}

await resetDatabase();
const pg = await db.getDb();
assert.equal(pg.dialect, "pg");

console.log("Şema");
await test("Postgres şeması son SQLite şemasıyla aynı tablo ve sütunlara sahip", async () => {
  const mem = new DatabaseSync(":memory:");
  for (const sql of MIGRATIONS) mem.exec(sql);
  const sqliteTables = (mem.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'").all() as { name: string }[]).map((r) => r.name);
  const lite = new Map<string, string[]>();
  for (const t of sqliteTables) lite.set(t, (mem.prepare(`SELECT name FROM pragma_table_info('${t}')`).all() as { name: string }[]).map((r) => r.name).sort());
  mem.close();
  const rows = await pg.all<{ table_name: string; column_name: string }>(
    "SELECT table_name, column_name FROM information_schema.columns WHERE table_schema = current_schema() AND table_name <> 'schema_migrations'",
  );
  const pgCols = new Map<string, string[]>();
  for (const r of rows) pgCols.set(r.table_name, [...(pgCols.get(r.table_name) ?? []), r.column_name]);
  for (const v of pgCols.values()) v.sort();
  assert.deepEqual([...pgCols.keys()].sort(), [...lite.keys()].sort(), "tablolar");
  for (const [t, cols] of lite) assert.deepEqual(pgCols.get(t), cols, `${t} sütunları`);
});

await test("varsayılan 'Ana hesap' ve kimlik sayacı: yeni hesap 2 numara alır", async () => {
  const accounts = await import("../src/lib/accounts");
  const a = await accounts.createAccount({ name: "İkinci" });
  assert.equal(a.id, 2);
  await assert.rejects(async () => accounts.createAccount({ name: "ikinci" }), /zaten var/);
});

await test("? → $n çevirisi dizge, ad ve yorumların içine dokunmaz", () => {
  assert.equal(toPgPlaceholders("SELECT * FROM t WHERE a = ? AND b = '?' AND c = ?"), "SELECT * FROM t WHERE a = $1 AND b = '?' AND c = $2");
  assert.equal(toPgPlaceholders(`SELECT "a?" FROM t -- ne?\nWHERE x = ? /* ? */ AND y = 'it''s ?'`), `SELECT "a?" FROM t -- ne?\nWHERE x = $1 /* ? */ AND y = 'it''s ?'`);
});

await test("sayısal türler sayı olarak döner (COUNT, SUM, BIGINT ms)", async () => {
  await pg.run("INSERT INTO ext_cache (key, value, fetched_at) VALUES (?, ?, ?)", ["t", "x", 1_790_000_000_123]);
  const r = await pg.get<{ c: number; s: number; f: number }>("SELECT COUNT(*) AS c, SUM(fetched_at) AS s, MAX(fetched_at) AS f FROM ext_cache");
  assert.deepEqual(r, { c: 1, s: 1_790_000_000_123, f: 1_790_000_000_123 });
});

await test("işlem: hata olursa geri alınır; iç içe getDb() aynı işleme katılır", async () => {
  await assert.rejects(
    pg.tx(async () => {
      await (await db.getDb()).run("INSERT INTO settings (key, value) VALUES ('tx-deneme', '1')");
      assert.ok(await pg.get("SELECT 1 AS x FROM settings WHERE key = 'tx-deneme'"), "işlem içinde görünür");
      throw new Error("geri al");
    }),
    /geri al/,
  );
  assert.equal(await pg.get("SELECT 1 AS x FROM settings WHERE key = 'tx-deneme'"), undefined);
});

console.log("Nöbet");
const runner = await import("../src/lib/cron/runner");

await test("görev kilidi: eşzamanlı iki alımdan yalnızca biri kazanır; en az aralık korunur", async () => {
  const t = { ...runner.TASKS[0], name: "deneme_kilit", minIntervalSec: 600 };
  await pg.run("INSERT INTO task_leases (name, locked_until) VALUES (?, 0) ON CONFLICT DO NOTHING", [t.name]);
  const now = Date.now();
  const got = await Promise.all([runner.claimTask(pg, t, now), runner.claimTask(pg, t, now), runner.claimTask(pg, t, now)]);
  assert.equal(got.filter(Boolean).length, 1);
  await pg.run("UPDATE task_leases SET locked_until = 0 WHERE name = ?", [t.name]);
  assert.equal(await runner.claimTask(pg, t, now + 60_000), false, "aralık dolmadan yeniden alınamaz");
  assert.equal(await runner.claimTask(pg, t, now + 601_000), true);
});

/** Ağ olmadan: fiyatları önbelleğe taze olarak yaz */
async function seedPrices() {
  const now = Date.now();
  for (const [key, price, cur] of [
    ["binance:BTCUSDT", 50_000, "USD"],
    ["yahoo:USDTRY=X", 40, "TRY"],
    ["yahoo:EURTRY=X", 45, "TRY"],
  ] as const) {
    await pg.run(
      `INSERT INTO price_cache (key, price, currency, change_pct, source_time, fetched_at) VALUES (?, ?, ?, 0, ?, ?)
       ON CONFLICT(key) DO UPDATE SET price = excluded.price, fetched_at = excluded.fetched_at`,
      [key, price, cur, now, now + 60 * 60_000],
    );
  }
}

await test("emir: eşzamanlı iki kontrolde TAM BİR KEZ gerçekleşir", async () => {
  await seedPrices();
  const orders = await import("../src/lib/orders");
  const o = await orders.createOrder({ mode: "virtual", assetType: "crypto", symbol: "BTC", side: "buy", condition: "lte", triggerPrice: "60000", entryBy: "quantity", quantity: "0,1" });
  const [a, b] = await Promise.all([orders.checkPendingOrders(), orders.checkPendingOrders()]);
  assert.equal(a.executed + b.executed, 1, JSON.stringify([a, b]));
  const txs = await pg.all<{ id: number }>("SELECT id FROM transactions WHERE order_id = ?", [o.id]);
  assert.equal(txs.length, 1);
  assert.equal((await orders.getOrder(o.id))!.status, "executed");
  assert.equal((await pg.get<{ c: number }>("SELECT COUNT(*) AS c FROM notifications WHERE order_id = ? AND kind = 'order_executed'", [o.id]))!.c, 1);
});

await test("nöbet: eşzamanlı iki tur görevleri bir kez çalıştırır, tick_runs kaydı tutulur", async () => {
  await pg.run("DELETE FROM task_leases");
  (globalThis as { __yatirimLeasesSeeded?: boolean }).__yatirimLeasesSeeded = false;
  const [r1, r2] = await Promise.all([runner.runTick({ source: "test-1" }), runner.runTick({ source: "test-2" })]);
  const ran = (r: typeof r1, n: string) => r.tasks[n] !== undefined && r.tasks[n] !== "kilitli/atlandı";
  for (const n of ["emirler", "alarm", "anlik_goruntu"]) {
    assert.equal(Number(ran(r1, n)) + Number(ran(r2, n)), 1, `${n}: ${JSON.stringify([r1.tasks, r2.tasks])}`);
  }
  const runs = await pg.all<{ source: string; finished_at: number | null }>("SELECT source, finished_at FROM tick_runs ORDER BY id");
  assert.ok(runs.length >= 2 && runs.every((r) => r.finished_at != null));
  // Hemen ardından üçüncü tur: aralık dolmadığı için hızlı görevler çalışmaz
  const r3 = await runner.runTick({ source: "test-3" });
  assert.equal(Object.keys(r3.tasks).length, 0, JSON.stringify(r3.tasks));
  const st = await runner.nobetStatus();
  assert.equal(st.mode, "bulut");
  assert.ok(st.lastTickAt != null && !st.late, JSON.stringify(st));
});

await test("nöbet kapısı: pencere içi her dakika, dışı yalnızca :00/:30 dilimlerinde (bellek korumalı)", () => {
  const ist = (s: string) => Date.parse(`${s}+03:00`);
  assert.deepEqual(tickGate(ist("2026-11-18T10:07:00")), { run: true, window: "fast" }); // Çarşamba
  assert.deepEqual(tickGate(ist("2026-11-18T18:30:00")), { run: true, window: "fast" });
  assert.equal(tickGate(ist("2026-11-18T20:07:00")).run, false);
  assert.equal(tickGate(ist("2026-11-18T20:31:00")).run, true);
  assert.equal(tickGate(ist("2026-11-18T20:32:00"), { lastSlowRunAt: ist("2026-11-18T20:31:00") }).run, false);
  assert.equal(tickGate(ist("2026-11-21T11:00:00")).run, true); // Cumartesi :00
  assert.equal(tickGate(ist("2026-11-21T11:15:00")).run, false);
  assert.equal(tickGate(ist("2026-11-21T11:15:00"), { force: true }).run, true);
});

await db.closeDb();
console.log(`\n${passed} test geçti.`);
