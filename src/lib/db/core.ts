import { AsyncLocalStorage } from "node:async_hooks";
import type { Db, Driver, Executor, SqlParams } from "./types";

// Bağdaştırıcıdan (Driver) Db nesnesi: işlem bağlamı AsyncLocalStorage ile taşınır; böylece
// tx() içindeki iç içe fonksiyonların getDb() çağrıları da aynı işleme (aynı bağlantıya) gider.

interface TxContext {
  driver: Driver;
  ex: Executor;
  done: boolean;
}
const als = new AsyncLocalStorage<TxContext>();

/**
 * fn'i açık işlem bağlamının DIŞINDA çalıştırır. İşlem içinden başlatılan arka plan işleri
 * (bildirim gönderme, kur tamamlama) işleme karışmasın diye kullanılır.
 */
export function detached<T>(fn: () => T): T {
  return als.exit(fn);
}

export function dbFromDriver(driver: Driver): Db {
  const current = (): Executor => {
    const c = als.getStore();
    return c && !c.done && c.driver === driver ? c.ex : driver.root;
  };
  const db: Db = {
    dialect: driver.dialect,
    all: <T>(sql: string, params: SqlParams = []) => current().all<T>(sql, params),
    get: async <T>(sql: string, params: SqlParams = []) => (await current().all<T>(sql, params))[0],
    run: (sql: string, params: SqlParams = []) => current().run(sql, params),
    exec: (sql: string) => current().exec(sql),
    async tx<T>(fn: (t: Db) => Promise<T>): Promise<T> {
      const c = als.getStore();
      if (c && !c.done && c.driver === driver) return fn(db);
      return driver.transaction(async (ex) => {
        const ctx: TxContext = { driver, ex, done: false };
        try {
          return await als.run(ctx, () => fn(db));
        } finally {
          ctx.done = true;
        }
      });
    },
  };
  return db;
}
