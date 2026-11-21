// Eşzamanlılık testleri (her iki modda: npm run test:concurrency → SQLite; npm run test:pg → Postgres):
// - 25 eşzamanlı tx() + işlem dışı sorgular: hata yok, sayılar doğru (SQLite kilit hatasının regresyonu)
// - tx() içindeki iç içe getDb() çağrıları işleme katılır, kilitlenmez
// - iç içe tx() kayıt noktasıdır: içteki hata yakalanırsa dış işlem (Postgres'te de) devam eder
// - eşzamanlı satışlar birlikte eldekini aşamaz (pozisyon kilidi)
// - emir gerçekleşirken eşzamanlı işlem kayıtları: hata yok, sayılar doğru
// - görev kilidi: geç biten eski çağrı yeni sahibin kilidini açamaz
// - giriş denemesi sayacı veritabanında, zamanla azalır
// Ağ kullanmaz (fiyatlar önbelleğe yazılır); geçici bir veri klasörü kullanır.
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const DIR = fs.mkdtempSync(path.join(os.tmpdir(), "yatirim-eszaman-"));
process.env.YATIRIM_DATA_DIR = DIR;

const { PG, resetDatabase } = await import("./test-db");
const db = await import("../src/lib/db");
const portfolio = await import("../src/lib/portfolio");
const accounts = await import("../src/lib/accounts");

let passed = 0;
async function test(name: string, fn: () => void | Promise<void>) {
  await fn();
  passed++;
  console.log(`  ✓ ${name}`);
}
/** Kilitlenmeyi (deadlock) hata olarak yakala */
function within<T>(ms: number, p: Promise<T>): Promise<T> {
  return Promise.race([p, new Promise<T>((_, rej) => setTimeout(() => rej(new Error(`zaman aşımı (${ms} ms): kilitlenme?`)), ms))]);
}
const tick = () => new Promise((r) => setTimeout(r, Math.random() * 5));

await resetDatabase();
const conn = await db.getDb();
console.log(`Eşzamanlılık (${PG ? "Postgres" : "SQLite"})`);

await test("25 eşzamanlı tx() ve 25 işlem dışı sorgu: hata yok, sayılar doğru", async () => {
  await conn.exec("CREATE TABLE IF NOT EXISTS eszaman_deneme (k TEXT PRIMARY KEY, n INTEGER NOT NULL)");
  await conn.run("INSERT INTO eszaman_deneme (k, n) VALUES ('sayac', 0)");
  const jobs: Promise<unknown>[] = [];
  for (let i = 0; i < 25; i++) {
    jobs.push(
      conn.tx(async (t) => {
        // Oku-değiştir-yaz: işlemler tek tek çalışmazsa sayaç kaybolur ya da hata çıkar.
        const r = await t.get<{ n: number }>("SELECT n FROM eszaman_deneme WHERE k = 'sayac'");
        await tick();
        await (await db.getDb()).run("UPDATE eszaman_deneme SET n = ? WHERE k = 'sayac'", [r!.n + 1]);
        await t.run("INSERT INTO eszaman_deneme (k, n) VALUES (?, ?)", [`tx-${i}`, i]);
      }),
    );
    jobs.push(conn.get("SELECT COUNT(*) AS c FROM eszaman_deneme"));
    if (i % 5 === 0) jobs.push(conn.run("INSERT INTO eszaman_deneme (k, n) VALUES (?, 0)", [`dis-${i}`]));
  }
  const res = await within(30_000, Promise.allSettled(jobs));
  const errors = res.filter((r) => r.status === "rejected").map((r) => String((r as PromiseRejectedResult).reason));
  assert.deepEqual(errors, []);
  if (PG) {
    // Postgres READ COMMITTED: oku-değiştir-yaz sayaç kilitsiz yarışabilir; burada yalnızca hata olmaması önemli.
    assert.ok((await conn.get<{ n: number }>("SELECT n FROM eszaman_deneme WHERE k = 'sayac'"))!.n >= 1);
  } else {
    assert.equal((await conn.get<{ n: number }>("SELECT n FROM eszaman_deneme WHERE k = 'sayac'"))!.n, 25);
  }
  assert.equal((await conn.get<{ c: number }>("SELECT COUNT(*) AS c FROM eszaman_deneme WHERE k LIKE 'tx-%'"))!.c, 25);
  assert.equal((await conn.get<{ c: number }>("SELECT COUNT(*) AS c FROM eszaman_deneme WHERE k LIKE 'dis-%'"))!.c, 5);
});

await test("lockKey ile oku-değiştir-yaz: 20 eşzamanlı işlem sayacı kaybetmez", async () => {
  await conn.run("UPDATE eszaman_deneme SET n = 0 WHERE k = 'sayac'");
  await within(
    30_000,
    Promise.all(
      Array.from({ length: 20 }, () =>
        conn.tx(async (t) => {
          await t.lockKey("deneme:sayac");
          const r = await t.get<{ n: number }>("SELECT n FROM eszaman_deneme WHERE k = 'sayac'");
          await tick();
          await t.run("UPDATE eszaman_deneme SET n = ? WHERE k = 'sayac'", [r!.n + 1]);
        }),
      ),
    ),
  );
  assert.equal((await conn.get<{ n: number }>("SELECT n FROM eszaman_deneme WHERE k = 'sayac'"))!.n, 20);
});

await test("tx() içinde iç içe getDb() ve iç içe tx() aynı işleme katılır, kilitlenmez; hata hepsini geri alır", async () => {
  await assert.rejects(
    within(
      5_000,
      conn.tx(async () => {
        await (await db.getDb()).run("INSERT INTO eszaman_deneme (k, n) VALUES ('ic-1', 1)");
        await (await db.getDb()).tx(async (t) => {
          await t.run("INSERT INTO eszaman_deneme (k, n) VALUES ('ic-2', 2)");
          assert.ok(await (await db.getDb()).get("SELECT 1 AS x FROM eszaman_deneme WHERE k = 'ic-1'"));
        });
        throw new Error("geri al");
      }),
    ),
    /geri al/,
  );
  assert.equal((await conn.get<{ c: number }>("SELECT COUNT(*) AS c FROM eszaman_deneme WHERE k LIKE 'ic-%'"))!.c, 0);
});

await test("iç içe tx() kayıt noktasıdır: içteki hata yakalanırsa dış işlem devam eder ve kaydedilir", async () => {
  await conn.tx(async () => {
    await conn.run("INSERT INTO eszaman_deneme (k, n) VALUES ('sp-dis', 1)");
    await assert.rejects(
      conn.tx(async () => {
        await conn.run("INSERT INTO eszaman_deneme (k, n) VALUES ('sp-ic', 1)");
        // Postgres'te bu hata kayıt noktası olmadan tüm işlemi bozardı.
        await conn.run("INSERT INTO eszaman_deneme (k, n) VALUES ('sp-dis', 2)");
      }),
    );
    // Kardeş kayıt noktaları eşzamanlı çağrılsa da sırayla çalışır
    await Promise.all([1, 2, 3].map((i) => conn.tx(async () => void (await conn.run("INSERT INTO eszaman_deneme (k, n) VALUES (?, ?)", [`sp-k${i}`, i])))));
    await conn.run("UPDATE eszaman_deneme SET n = 5 WHERE k = 'sp-dis'");
  });
  const rows = await conn.all<{ k: string; n: number }>("SELECT k, n FROM eszaman_deneme WHERE k LIKE 'sp-%' ORDER BY k");
  assert.deepEqual(rows.map((r) => `${r.k}=${r.n}`), ["sp-dis=5", "sp-k1=1", "sp-k2=2", "sp-k3=3"]);
});

const main = await accounts.defaultAccount();
const add = async (o: Record<string, unknown>) =>
  portfolio.recordTransaction(await portfolio.parseTransactionInput({ mode: "real", currency: "TRY", accountId: main.id, assetType: "bist", symbol: "THYAO", date: "2026-01-05", price: "100", ...o }));

await test("eşzamanlı 8 satış (3'er adet, eldeki 10): yalnızca 3'ü kaydedilir, eldeki eksiye düşmez", async () => {
  await add({ side: "buy", quantity: "10" });
  const res = await within(30_000, Promise.allSettled(Array.from({ length: 8 }, () => add({ side: "sell", quantity: "3", date: "2026-01-06" }))));
  const ok = res.filter((r) => r.status === "fulfilled").length;
  const bad = res.filter((r) => r.status === "rejected").map((r) => (r as PromiseRejectedResult).reason as Error);
  assert.equal(ok, 3, bad.map((e) => e.message).join("; "));
  for (const e of bad) assert.ok(e instanceof portfolio.ValidationError && /fazla satış/.test(e.message), e.message);
  const txs = (await portfolio.activeTransactions("real")).filter((t) => t.symbol === "THYAO");
  const qty = txs.reduce((s, t) => s + (t.side === "buy" ? t.quantity : -t.quantity), 0);
  assert.equal(qty, 1);
});

await test("eşzamanlı silme / düzenleme eldekini eksiye düşüremez", async () => {
  const buys = (await portfolio.activeTransactions("real")).filter((t) => t.symbol === "THYAO" && t.side === "buy");
  assert.equal(buys.length, 1);
  // Alışı silmek ya da 5'e düşürmek satışlarla çelişir; biri bile geçmemeli.
  const input = await portfolio.parseTransactionInput({ mode: "real", currency: "TRY", accountId: main.id, assetType: "bist", symbol: "THYAO", date: "2026-01-05", price: "100", side: "buy", quantity: "5" });
  const res = await Promise.allSettled([portfolio.deleteTransaction(buys[0].id), portfolio.updateTransaction(buys[0].id, input), portfolio.deleteTransaction(buys[0].id)]);
  assert.ok(res.every((r) => r.status === "rejected"), JSON.stringify(res.map((r) => r.status)));
  assert.equal((await portfolio.getTransaction(buys[0].id))!.quantity, 10);
});

/** Ağ olmadan: fiyatları önbelleğe taze olarak yaz */
async function seedPrices() {
  const now = Date.now();
  for (const [key, price, cur] of [
    ["binance:BTCUSDT", 50_000, "USD"],
    ["yahoo:USDTRY=X", 40, "TRY"],
    ["yahoo:EURTRY=X", 45, "TRY"],
  ] as const) {
    await conn.run(
      `INSERT INTO price_cache (key, price, currency, change_pct, source_time, fetched_at) VALUES (?, ?, ?, 0, ?, ?)
       ON CONFLICT(key) DO UPDATE SET price = excluded.price, fetched_at = excluded.fetched_at`,
      [key, price, cur, now, now + 60 * 60_000],
    );
  }
}

await test("emir gerçekleşirken 12 eşzamanlı işlem kaydı ve okuma: hata yok, sayılar doğru", async () => {
  await seedPrices();
  const orders = await import("../src/lib/orders");
  const o = await orders.createOrder({ mode: "virtual", assetType: "crypto", symbol: "BTC", side: "buy", condition: "lte", triggerPrice: "60000", entryBy: "quantity", quantity: "0,1" });
  const before = (await portfolio.listTransactions()).length;
  const jobs: Promise<unknown>[] = [orders.checkPendingOrders(), orders.checkPendingOrders()];
  for (let i = 0; i < 12; i++) {
    jobs.push(add({ symbol: "ASELS", side: "buy", quantity: "1", date: "2026-02-01" }));
    jobs.push(portfolio.listTransactions());
  }
  const res = await within(30_000, Promise.allSettled(jobs));
  const errors = res.filter((r) => r.status === "rejected").map((r) => String((r as PromiseRejectedResult).reason));
  assert.deepEqual(errors, []);
  const [a, b] = res.slice(0, 2).map((r) => (r as PromiseFulfilledResult<{ executed: number }>).value);
  assert.equal(a.executed + b.executed, 1);
  assert.equal((await orders.getOrder(o.id))!.status, "executed");
  assert.equal((await portfolio.listTransactions()).length, before + 13);
  assert.equal((await conn.all("SELECT id FROM transactions WHERE order_id = ?", [o.id])).length, 1);
});

await test("emir kaydı başarısız olursa (eldekinden fazla satış) emir 'başarısız' kapanır, dış işlem bozulmaz", async () => {
  const orders = await import("../src/lib/orders");
  const o = await orders.createOrder({ mode: "virtual", assetType: "crypto", symbol: "BTC", side: "sell", condition: "lte", triggerPrice: "60000", entryBy: "quantity", quantity: "5" });
  const r = await orders.checkPendingOrders();
  assert.equal(r.executed, 0);
  const got = (await orders.getOrder(o.id))!;
  assert.equal(got.status, "failed");
  assert.match(got.error ?? "", /fazla satış/);
  assert.equal((await conn.get<{ c: number }>("SELECT COUNT(*) AS c FROM notifications WHERE order_id = ? AND kind = 'order_failed'", [o.id]))!.c, 1);
});

console.log("Nöbet ve giriş");
const runner = await import("../src/lib/cron/runner");

await test("görev kilidi: geç biten eski çağrı yeni sahibin kilidini açamaz", async () => {
  const t = { ...runner.TASKS[0], name: "deneme_sahip", minIntervalSec: 60, leaseSec: 120 };
  await conn.run("INSERT INTO task_leases (name, locked_until) VALUES (?, 0) ON CONFLICT DO NOTHING", [t.name]);
  const t1 = Date.now() - 10 * 60_000;
  assert.equal(await runner.claimTask(conn, t, t1), true);
  // Kilit süresi doldu, başka bir çağrı görevi aldı
  const t2 = t1 + 200_000;
  assert.equal(await runner.claimTask(conn, t, t2), true);
  // Eski çağrı şimdi bitiyor: yeni sahibin kilidine dokunamaz
  assert.equal(await runner.releaseTask(conn, t, t1, true, null, 5), false);
  const row = (await conn.get<{ locked_until: number; last_run_at: number }>("SELECT locked_until, last_run_at FROM task_leases WHERE name = ?", [t.name]))!;
  assert.equal(row.locked_until, t2 + 120_000);
  assert.equal(row.last_run_at, t2);
  // Sahibi bırakabilir
  assert.equal(await runner.releaseTask(conn, t, t2, true, null, 5), true);
  assert.equal((await conn.get<{ locked_until: number }>("SELECT locked_until FROM task_leases WHERE name = ?", [t.name]))!.locked_until, 0);
});

await test("giriş denemeleri veritabanında sayılır (eşzamanlı da), zamanla azalır, başarıda sıfırlanır", async () => {
  const lt = await import("../src/lib/loginThrottle");
  const now = Date.now();
  const counts = await Promise.all(Array.from({ length: 5 }, () => lt.recordLoginFailure("10.0.0.1", now)));
  assert.deepEqual([...counts].sort(), [1, 2, 3, 4, 5]);
  assert.equal(await lt.recordLoginFailure("10.0.0.2", now), 1, "başka IP etkilenmez");
  // 3 dakika sonra: 5 − 3 = 2, bu denemeyle 3
  assert.equal(await lt.recordLoginFailure("10.0.0.1", now + 3 * lt.DECAY_MS), 3);
  assert.equal(await lt.recordLoginFailure("10.0.0.1", now + 30 * lt.DECAY_MS), 1, "uzun aradan sonra sıfırdan");
  assert.equal(lt.failureDelayMs(4), 2000);
  assert.equal(lt.failureDelayMs(40), 5000);
  await lt.clearLoginFailures("10.0.0.1");
  assert.equal(await lt.recordLoginFailure("10.0.0.1", now + 31 * lt.DECAY_MS), 1);
});

await db.closeDb();
fs.rmSync(DIR, { recursive: true, force: true });
console.log(`\n${passed} test geçti.`);
