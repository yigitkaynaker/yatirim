import pg from "pg";
import { toPgPlaceholders } from "./placeholders";
import type { Driver, Executor, RunResult, SqlParams } from "./types";

// Bulut modu: Neon Postgres, pg (node-postgres) havuzu, havuzlu (PgBouncer, transaction
// modu) DATABASE_URL ile. Bu yüzden: oturum durumu yok (SET, advisory lock, PREPARE yok);
// işlemler tek istemcide açık BEGIN/COMMIT ile; yarışlar atomik UPDATE … WHERE … RETURNING ile.

// BIGINT (COUNT, SUM, kimlikler, ms zaman damgaları) ve NUMERIC (SUM/AVG) sayı olarak gelsin.
pg.types.setTypeParser(20, (v) => Number(v));
pg.types.setTypeParser(1700, (v) => Number(v));

const RETURNING = /\bRETURNING\b/i;

type Queryable = Pick<pg.PoolClient, "query">;

function params(p: SqlParams): unknown[] {
  return p.map((v) => (typeof v === "bigint" ? v.toString() : v instanceof Uint8Array ? Buffer.from(v) : v));
}

function executor(q: Queryable): Executor {
  return {
    async all<T>(sql: string, p: SqlParams) {
      const r = await q.query(toPgPlaceholders(sql), params(p));
      return r.rows as T[];
    },
    async run(sql: string, p: SqlParams): Promise<RunResult> {
      const r = await q.query(toPgPlaceholders(sql), params(p));
      const id = RETURNING.test(sql) ? (r.rows[0] as { id?: unknown } | undefined)?.id : undefined;
      return { changes: r.rowCount ?? 0, lastId: id != null ? Number(id) : undefined };
    },
    async exec(sql: string) {
      await q.query(sql);
    },
  };
}

export function openPostgres(connectionString: string, opts: { max?: number } = {}): Driver & { pool: pg.Pool } {
  const pool = new pg.Pool({
    connectionString,
    max: opts.max ?? 3,
    // Sunucusuz ortamda boşta bağlantı tutmayalım (Neon 5 dk sonra uykuya geçebilsin).
    idleTimeoutMillis: 5_000,
    connectionTimeoutMillis: 15_000,
    // Neon uykudan uyanırken ilk bağlantı birkaç saniye sürebilir.
    query_timeout: 30_000,
  });
  pool.on("error", (err) => console.warn("[veritabanı] havuz hatası", err.message));
  return {
    dialect: "pg",
    pool,
    root: executor(pool),
    async transaction<T>(fn: (ex: Executor) => Promise<T>): Promise<T> {
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        try {
          const out = await fn(executor(client));
          await client.query("COMMIT");
          return out;
        } catch (err) {
          try {
            await client.query("ROLLBACK");
          } catch {}
          throw err;
        }
      } finally {
        client.release();
      }
    },
    async close() {
      await pool.end();
    },
  };
}
