import "server-only";
import path from "node:path";
import { MIGRATIONS } from "./migrationsSqlite";
import { PG_SCHEMA_VERSION } from "./migrationsPg";
import { dbFromDriver } from "./core";
import type { Db, Driver } from "./types";

export { detached } from "./core";

export type { Db, Row, RunResult, SqlParams, SqlValue } from "./types";
export { sqlString } from "./sqlite";

// Uygulamanın veritabanı girişi. İki mod:
// - Yerel (varsayılan): data/yatirim.db (SQLite, git'e eklenmez).
// - Bulut: DATABASE_URL tanımlıysa Neon Postgres (Vercel). Bkz. BULUT.md.

// YATIRIM_DATA_DIR: test sunucusu gibi durumlarda farklı bir veri klasörü kullanmak için.
const DATA_DIR = process.env.YATIRIM_DATA_DIR || path.join(process.cwd(), "data");
const DB_PATH = path.join(DATA_DIR, "yatirim.db");

/** Şema sürümü (SQLite user_version; testler ve geri yükleme doğrulaması için) */
export const SCHEMA_VERSION = MIGRATIONS.length;
/** Testler için: belirli bir sürüme kadar olan geçişler */
export const MIGRATION_SQL: readonly string[] = MIGRATIONS;

/** Bulut modu mu (DATABASE_URL tanımlı → Postgres, dış zamanlayıcı) */
export function isCloud(): boolean {
  return !!process.env.DATABASE_URL;
}

export function dataDir(): string {
  return DATA_DIR;
}
export function dbPath(): string {
  return DB_PATH;
}
export function backupDir(): string {
  return path.join(DATA_DIR, "yedekler");
}

/** Şu anki UTC zamanı, SQLite datetime('now') biçiminde ("YYYY-MM-DD HH:MM:SS") */
export function sqlNow(ms = Date.now()): string {
  return new Date(ms).toISOString().replace("T", " ").slice(0, 19);
}

// ---- Bağlantı -------------------------------------------------------------------

interface DbState {
  db: Promise<{ db: Db; driver: Driver }>;
}
const g = globalThis as unknown as { __yatirimDb?: DbState };

async function open(): Promise<{ db: Db; driver: Driver }> {
  const url = process.env.DATABASE_URL;
  if (url) {
    const { openPostgres } = await import("./postgres");
    const driver = openPostgres(url);
    const db = dbFromDriver(driver);
    await assertPgSchema(db);
    return { db, driver };
  }
  const { openSqlite } = await import("./sqlite");
  const driver = await openSqlite(DB_PATH, backupDir());
  return { db: dbFromDriver(driver), driver };
}

async function assertPgSchema(db: Db) {
  let v = 0;
  try {
    v = (await db.get<{ v: number | null }>("SELECT MAX(id) AS v FROM schema_migrations"))?.v ?? 0;
  } catch {
    v = 0;
  }
  if (v < PG_SCHEMA_VERSION) {
    throw new Error(`Veritabanı şeması eksik (sürüm ${v} < ${PG_SCHEMA_VERSION}). "npm run db:migrate" çalıştırın (BULUT.md).`);
  }
}

/** Tekil bağlantı (dev modda HMR sırasında yeniden açılmaz). */
export async function getDb(): Promise<Db> {
  if (!g.__yatirimDb) {
    const p = open();
    g.__yatirimDb = { db: p };
    p.catch(() => {
      if (g.__yatirimDb?.db === p) g.__yatirimDb = undefined;
    });
  }
  return (await g.__yatirimDb.db).db;
}

/** Yerel modda ham SQLite bağlantısı (yedekleme: VACUUM INTO, PRAGMA). Bulut modunda hata. */
export async function rawSqlite(): Promise<import("node:sqlite").DatabaseSync> {
  if (isCloud()) throw new Error("Bulut modunda SQLite yok.");
  await getDb();
  const d = (await g.__yatirimDb!.db).driver as Driver & { raw?: import("node:sqlite").DatabaseSync };
  return d.raw!;
}

/** Bağlantıyı kapatır (geri yüklemede dosya değiştirilmeden önce). Sonraki getDb() yeniden açar. */
export async function closeDb() {
  const s = g.__yatirimDb;
  g.__yatirimDb = undefined;
  if (!s) return;
  try {
    const { driver } = await s.db;
    await driver.close();
  } catch {}
}
