import { AsyncLocalStorage } from "node:async_hooks";
import type { Db, Driver, Executor, SqlParams } from "./types";

// Bağdaştırıcıdan (Driver) Db nesnesi: işlem bağlamı AsyncLocalStorage ile taşınır; böylece
// tx() içindeki iç içe fonksiyonların getDb() çağrıları da aynı işleme (aynı bağlantıya) gider.
// İç içe tx() bir kayıt noktasıdır (SAVEPOINT): iç fonksiyon hata fırlatırsa yalnızca onun
// yaptıkları geri alınır; dış kod hatayı yakalarsa dış işlem (Postgres'te de) devam edebilir.

interface TxContext {
  driver: Driver;
  ex: Executor;
  done: boolean;
  /** Dış işlem bağlamı (kayıt noktasında); kök işlemde null */
  parent: TxContext | null;
  depth: number;
  /** Bu bağlamdaki iç içe tx'ler (kayıt noktaları) sırayla çalışır (FIFO) */
  tail: Promise<void>;
}
const als = new AsyncLocalStorage<TxContext>();

/**
 * fn'i açık işlem bağlamının DIŞINDA çalıştırır. İşlem içinden başlatılan arka plan işleri
 * (bildirim gönderme, kur tamamlama) işleme karışmasın diye kullanılır.
 */
export function detached<T>(fn: () => T): T {
  return als.exit(fn);
}

/** Sıra: önceki sahip bırakınca çözülür; dönen fonksiyon sırayı bırakır. */
function enqueue(ctx: TxContext): Promise<() => void> {
  let release!: () => void;
  const mine = new Promise<void>((r) => (release = r));
  const prev = ctx.tail;
  ctx.tail = prev.then(() => mine);
  return prev.then(() => release);
}

export function dbFromDriver(driver: Driver): Db {
  /** Bu sürücünün hâlâ açık en içteki işlem bağlamı */
  const active = (): TxContext | null => {
    let c = als.getStore() ?? null;
    if (c && c.driver !== driver) return null;
    while (c && c.done) c = c.parent;
    return c;
  };
  const current = (): Executor => active()?.ex ?? driver.root;
  const db: Db = {
    dialect: driver.dialect,
    all: <T>(sql: string, params: SqlParams = []) => current().all<T>(sql, params),
    get: async <T>(sql: string, params: SqlParams = []) => (await current().all<T>(sql, params))[0],
    run: (sql: string, params: SqlParams = []) => current().run(sql, params),
    exec: (sql: string) => current().exec(sql),
    async lockKey(key: string) {
      // SQLite: işlemler zaten tek tek çalışır (BEGIN IMMEDIATE + sürücü kilidi).
      if (driver.dialect !== "pg") return;
      await current().all("SELECT pg_advisory_xact_lock(hashtext(?::text))::text AS x", [key]);
    },
    async tx<T>(fn: (t: Db) => Promise<T>): Promise<T> {
      const c = active();
      if (!c) {
        return driver.transaction(async (ex) => {
          const ctx: TxContext = { driver, ex, done: false, parent: null, depth: 0, tail: Promise.resolve() };
          try {
            return await als.run(ctx, () => fn(db));
          } finally {
            ctx.done = true;
          }
        });
      }
      // İç içe: kayıt noktası. Aynı bağlamdaki kardeş kayıt noktaları sıraya girer.
      const release = await enqueue(c);
      const ctx: TxContext = { driver, ex: c.ex, done: false, parent: c, depth: c.depth + 1, tail: Promise.resolve() };
      const sp = `yatirim_sp${ctx.depth}`;
      try {
        await c.ex.exec(`SAVEPOINT ${sp}`);
        try {
          const out = await als.run(ctx, () => fn(db));
          ctx.done = true;
          await c.ex.exec(`RELEASE SAVEPOINT ${sp}`);
          return out;
        } catch (err) {
          ctx.done = true;
          try {
            await c.ex.exec(`ROLLBACK TO SAVEPOINT ${sp}`);
            await c.ex.exec(`RELEASE SAVEPOINT ${sp}`);
          } catch {}
          throw err;
        }
      } finally {
        ctx.done = true;
        release();
      }
    },
  };
  return db;
}
