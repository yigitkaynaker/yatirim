import fs from "node:fs";
import path from "node:path";
import type { DatabaseSync, StatementSync } from "node:sqlite";
import { MIGRATIONS } from "./migrationsSqlite";
import type { Driver, Executor, RunResult, SqlParams } from "./types";

// Yerel mod: Node'un yerleşik SQLite modülü (yerel derleme gerektirmez).
// node:sqlite yalnızca burada ve yalnızca dinamik olarak yüklenir; bulut modunda hiç yüklenmez.
// Tek bağlantı vardır; işlem (BEGIN IMMEDIATE) sürerken işlem dışı sorgular işlemin
// bitmesini bekler (eşzamansız kodda başka bir isteğin sorgusu işleme karışmasın diye).

/** SQLite dize sabiti (VACUUM INTO gibi parametre alamayan komutlar için) */
export function sqlString(s: string): string {
  return `'${s.replace(/'/g, "''")}'`;
}

export async function loadSqlite(): Promise<typeof import("node:sqlite")> {
  return await import("node:sqlite");
}

/**
 * Şema geçişinden önce mevcut veritabanının tutarlı bir kopyasını alır
 * (VACUUM INTO: çalışırken de güvenli). Boş / yeni veritabanında yapılmaz.
 */
function backupBeforeMigrate(db: DatabaseSync, from: number, backupDir: string) {
  if (from === 0) return;
  fs.mkdirSync(backupDir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[-:]/g, "").replace("T", "-").slice(0, 15);
  const file = path.join(backupDir, `yatirim-gecis-oncesi-v${from}-${stamp}.db`);
  if (fs.existsSync(file)) return;
  db.exec(`VACUUM INTO ${sqlString(file)}`);
  console.log(`[veritabanı] geçiş öncesi yedek: ${file}`);
}

export function migrateSqlite(db: DatabaseSync, backupDir?: string) {
  const row = db.prepare("PRAGMA user_version").get() as { user_version: number };
  let version = row.user_version;
  if (version > MIGRATIONS.length) {
    throw new Error(`Veritabanı bu uygulama sürümünden yeni (şema ${version} > ${MIGRATIONS.length}). Uygulamayı güncelleyin.`);
  }
  if (version < MIGRATIONS.length && backupDir) backupBeforeMigrate(db, version, backupDir);
  while (version < MIGRATIONS.length) {
    db.exec("BEGIN");
    try {
      db.exec(MIGRATIONS[version]);
      version += 1;
      db.exec(`PRAGMA user_version = ${version}`);
      db.exec("COMMIT");
    } catch (err) {
      db.exec("ROLLBACK");
      throw err;
    }
  }
}

const RETURNING = /\bRETURNING\b/i;

export async function openSqlite(file: string, backupDir: string): Promise<Driver & { raw: DatabaseSync }> {
  const { DatabaseSync } = await loadSqlite();
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const db = new DatabaseSync(file);
  db.exec("PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000;");
  migrateSqlite(db, backupDir);

  const stmts = new Map<string, StatementSync>();
  const prep = (sql: string) => {
    let s = stmts.get(sql);
    if (!s) {
      if (stmts.size > 500) stmts.clear();
      s = db.prepare(sql);
      stmts.set(sql, s);
    }
    return s;
  };

  const direct: Executor = {
    async all<T>(sql: string, params: SqlParams) {
      return prep(sql).all(...params) as unknown as T[];
    },
    async run(sql: string, params: SqlParams): Promise<RunResult> {
      const s = prep(sql);
      if (RETURNING.test(sql)) {
        const rows = s.all(...params) as { id?: unknown }[];
        const id = rows[0]?.id;
        return { changes: rows.length, lastId: id != null ? Number(id) : undefined };
      }
      const r = s.run(...params);
      return { changes: Number(r.changes), lastId: Number(r.lastInsertRowid) };
    },
    async exec(sql: string) {
      db.exec(sql);
    },
  };

  // İşlem kilidi: aynı anda tek işlem; işlem sürerken dışarıdaki sorgular bekler.
  let lock: Promise<void> | null = null;
  const waitLock = async () => {
    while (lock) await lock;
  };

  const root: Executor = {
    async all<T>(sql: string, params: SqlParams) {
      if (lock) await waitLock();
      return direct.all<T>(sql, params);
    },
    async run(sql: string, params: SqlParams) {
      if (lock) await waitLock();
      return direct.run(sql, params);
    },
    async exec(sql: string) {
      if (lock) await waitLock();
      return direct.exec(sql);
    },
  };

  return {
    dialect: "sqlite",
    raw: db,
    root,
    async transaction<T>(fn: (ex: Executor) => Promise<T>): Promise<T> {
      await waitLock();
      let release!: () => void;
      lock = new Promise<void>((r) => (release = r));
      try {
        db.exec("BEGIN IMMEDIATE");
        try {
          const out = await fn(direct);
          db.exec("COMMIT");
          return out;
        } catch (err) {
          try {
            db.exec("ROLLBACK");
          } catch {}
          throw err;
        }
      } finally {
        lock = null;
        release();
      }
    },
    async close() {
      try {
        db.exec("PRAGMA wal_checkpoint(TRUNCATE)");
      } catch {}
      db.close();
    },
  };
}
