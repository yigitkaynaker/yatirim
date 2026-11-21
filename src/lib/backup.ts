import "server-only";
import fs from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { backupDir, closeDb, dbPath, getDb, MIGRATION_SQL, SCHEMA_VERSION, sqlString } from "./db";
import { ValidationError } from "./portfolio";

// YEDEKLEME VE GERİ YÜKLEME
// Tüm verileriniz tek bir dosyada (data/yatirim.db). Bilgisayar arızası, yanlışlıkla silme
// ya da hatalı bir içe aktarma durumunda yedek, verilerinizi geri getirmenin tek yoludur.
// - Günde bir otomatik yedek (sunucu çalışırken), son 14 yedek tutulur.
// - Yedek SQLite'ın VACUUM INTO komutuyla alınır: uygulama çalışırken bile tutarlı bir kopya.
// - Geri yükleme: dosya doğrulanır (SQLite mi, bütünlük, şema sürümü, gerekli tablolar),
//   önce mevcut veri yedeklenir, sonra bağlantı kapatılıp dosya değiştirilir.

export const KEEP_BACKUPS = 14;
const NAME_RE = /^yatirim-[a-z0-9-]+\.db$/;
const REQUIRED_TABLES = ["transactions", "settings", "orders", "portfolio_snapshots"];

export interface BackupFile {
  name: string;
  size: number;
  /** ms */
  createdAt: number;
  kind: "gunluk" | "elle" | "geri-yukleme-oncesi" | "gecis-oncesi" | "diger";
}

function kindOf(name: string): BackupFile["kind"] {
  if (name.startsWith("yatirim-gunluk-")) return "gunluk";
  if (name.startsWith("yatirim-elle-")) return "elle";
  if (name.startsWith("yatirim-geri-yukleme-oncesi-")) return "geri-yukleme-oncesi";
  if (name.startsWith("yatirim-gecis-oncesi-")) return "gecis-oncesi";
  return "diger";
}

function stamp(d = new Date()): string {
  // İstanbul saatine göre: 2026-11-20-183005
  const p = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Istanbul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(d);
  const v = (t: string) => p.find((x) => x.type === t)?.value ?? "00";
  return `${v("year")}-${v("month")}-${v("day")}-${v("hour")}${v("minute")}${v("second")}`;
}

export function listBackups(): BackupFile[] {
  const dir = backupDir();
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir)
    .filter((n) => NAME_RE.test(n))
    .map((name) => {
      const st = fs.statSync(path.join(dir, name));
      return { name, size: st.size, createdAt: st.mtimeMs, kind: kindOf(name) };
    })
    .sort((a, b) => b.createdAt - a.createdAt || (a.name < b.name ? 1 : -1));
}

/** En yeni KEEP_BACKUPS yedeği tutar, eskileri siler. */
export function pruneBackups(keep = KEEP_BACKUPS): number {
  const list = listBackups();
  let removed = 0;
  for (const b of list.slice(keep)) {
    try {
      fs.unlinkSync(path.join(backupDir(), b.name));
      removed++;
    } catch {}
  }
  return removed;
}

/** Çalışırken güvenli yedek (VACUUM INTO). kind: dosya adındaki etiket. */
export function createBackup(kind: "gunluk" | "elle" | "geri-yukleme-oncesi" = "elle"): BackupFile {
  const dir = backupDir();
  fs.mkdirSync(dir, { recursive: true });
  let name = `yatirim-${kind}-${stamp()}.db`;
  for (let i = 2; fs.existsSync(path.join(dir, name)); i++) name = `yatirim-${kind}-${stamp()}-${i}.db`;
  const file = path.join(dir, name);
  getDb().exec(`VACUUM INTO ${sqlString(file)}`);
  if (kind !== "geri-yukleme-oncesi") pruneBackups();
  const st = fs.statSync(file);
  return { name, size: st.size, createdAt: st.mtimeMs, kind: kindOf(name) };
}

/** Bugün (İstanbul) günlük yedek alınmadıysa alır. Hata fırlatmaz. */
export function maybeDailyBackup(): BackupFile | null {
  try {
    const today = stamp().slice(0, 10);
    if (listBackups().some((b) => b.name.startsWith(`yatirim-gunluk-${today}`))) return null;
    const b = createBackup("gunluk");
    console.log(`[yedek] günlük yedek alındı: ${b.name}`);
    return b;
  } catch (err) {
    console.error("[yedek] günlük yedek alınamadı", err);
    return null;
  }
}

/** İndirme için yedek dosyasının yolu (ad doğrulanır). */
export function backupFilePath(name: string): string | null {
  if (!NAME_RE.test(name)) return null;
  const file = path.join(backupDir(), name);
  return fs.existsSync(file) ? file : null;
}

export interface BackupCheck {
  ok: true;
  schemaVersion: number;
  transactions: number;
  accounts: number | null;
  lastTransactionDate: string | null;
}

const KEY_TABLES = ["transactions", "accounts", "orders", "settings"];

function columnsOf(db: DatabaseSync, table: string): string[] {
  return (db.prepare(`PRAGMA table_info(${sqlString(table)})`).all() as { name: string }[]).map((r) => r.name);
}

let referenceColumns: Map<string, string[]> | null = null;

/** Güncel şemadaki ana tabloların sütunları (boş bir bellek veritabanına tüm geçişler uygulanarak). */
function expectedColumns(): Map<string, string[]> {
  if (referenceColumns) return referenceColumns;
  const mem = new DatabaseSync(":memory:");
  try {
    for (const sql of MIGRATION_SQL) mem.exec(sql);
    referenceColumns = new Map(KEY_TABLES.map((t) => [t, columnsOf(mem, t)]));
  } finally {
    mem.close();
  }
  return referenceColumns;
}

/**
 * Yedeğin geçici bir kopyasına eksik şema geçişlerini uygular ve ana tabloların (işlemler, hesaplar,
 * emirler, ayarlar) beklenen sütunlara sahip olduğunu denetler. Geçiş çalışmazsa ya da sütun eksikse reddedilir.
 */
function checkMigratedSchema(file: string) {
  const tmp = `${file}.dogrula-${process.pid}-${Date.now()}`;
  fs.copyFileSync(file, tmp);
  let db: DatabaseSync | null = null;
  try {
    db = new DatabaseSync(tmp);
    let { user_version: version } = db.prepare("PRAGMA user_version").get() as { user_version: number };
    try {
      for (; version < MIGRATION_SQL.length; version++) db.exec(MIGRATION_SQL[version]);
    } catch {
      throw new ValidationError("Yedek bu uygulama sürümüne yükseltilemedi (şema geçişi başarısız); geçerli bir yedek değil.");
    }
    const problems: string[] = [];
    for (const [table, cols] of expectedColumns()) {
      const have = new Set(columnsOf(db, table));
      if (have.size === 0) problems.push(`${table} tablosu yok`);
      else {
        const lack = cols.filter((c) => !have.has(c));
        if (lack.length) problems.push(`${table}: ${lack.join(", ")}`);
      }
    }
    if (problems.length) throw new ValidationError(`Yedekte beklenen sütunlar eksik (${problems.join("; ")}).`);
    db.prepare("SELECT COUNT(*) FROM transactions").get();
  } finally {
    db?.close();
    for (const ext of ["", "-wal", "-shm", "-journal"]) fs.rmSync(tmp + ext, { force: true });
  }
}

/** Yüklenen dosyanın geçerli bir yatırım veritabanı olduğunu doğrular. */
export function validateBackupFile(file: string): BackupCheck {
  const head = Buffer.alloc(16);
  const fd = fs.openSync(file, "r");
  try {
    fs.readSync(fd, head, 0, 16, 0);
  } finally {
    fs.closeSync(fd);
  }
  if (head.toString("latin1") !== "SQLite format 3\u0000") throw new ValidationError("Bu dosya bir SQLite veritabanı değil.");
  let db: DatabaseSync | null = null;
  try {
    db = new DatabaseSync(file, { readOnly: true });
    const ic = db.prepare("PRAGMA integrity_check").get() as { integrity_check: string };
    if (ic.integrity_check !== "ok") throw new ValidationError("Dosya bozuk görünüyor (bütünlük denetimi başarısız).");
    const { user_version } = db.prepare("PRAGMA user_version").get() as { user_version: number };
    if (user_version < 1) throw new ValidationError("Bu dosya bir yatırım uygulaması yedeği değil (şema sürümü yok).");
    if (user_version > SCHEMA_VERSION) throw new ValidationError("Bu yedek uygulamanın daha yeni bir sürümünden; önce uygulamayı güncelleyin.");
    const tables = new Set((db.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all() as { name: string }[]).map((r) => r.name));
    const needed = REQUIRED_TABLES.filter((t) => t !== "settings" || user_version >= 4).filter((t) => t !== "portfolio_snapshots" || user_version >= 3).filter((t) => t !== "orders" || user_version >= 2);
    const missing = needed.filter((t) => !tables.has(t));
    if (missing.length) throw new ValidationError(`Yedekte gerekli tablolar eksik: ${missing.join(", ")}.`);
    checkMigratedSchema(file);
    const { c } = db.prepare("SELECT COUNT(*) AS c FROM transactions").get() as { c: number };
    const last = db.prepare("SELECT MAX(date) AS d FROM transactions").get() as { d: string | null };
    const accounts = tables.has("accounts") ? (db.prepare("SELECT COUNT(*) AS c FROM accounts").get() as { c: number }).c : null;
    return { ok: true, schemaVersion: user_version, transactions: c, accounts, lastTransactionDate: last.d };
  } catch (err) {
    if (err instanceof ValidationError) throw err;
    throw new ValidationError("Dosya açılamadı; geçerli bir yedek değil.");
  } finally {
    db?.close();
  }
}

const TOKEN_RE = /^yukleme-\d+\.db$/;

/** Hazırlanan (yüklenmiş, doğrulanmış) dosyanın yolu; geçersiz / yoksa null */
export function stagedPath(token: string): string | null {
  if (!TOKEN_RE.test(token)) return null;
  const file = path.join(backupDir(), "yukleme", token);
  return fs.existsSync(file) ? file : null;
}

/** Yüklenen dosyayı geçici olarak kaydeder ve doğrular. token: geri yüklemeyi onaylarken gönderilir. */
export function stageUpload(bytes: Uint8Array): { token: string; check: BackupCheck } {
  if (bytes.byteLength < 512) throw new ValidationError("Dosya çok küçük; geçerli bir yedek değil.");
  if (bytes.byteLength > 500 * 1024 * 1024) throw new ValidationError("Dosya çok büyük (en fazla 500 MB).");
  const dir = path.join(backupDir(), "yukleme");
  fs.mkdirSync(dir, { recursive: true });
  // Eski (1 saatten eski) yüklemeleri temizle.
  for (const n of fs.readdirSync(dir)) {
    const m = /^yukleme-(\d+)\.db$/.exec(n);
    if (m && Date.now() - Number(m[1]) > 3_600_000) fs.rmSync(path.join(dir, n), { force: true });
  }
  const token = `yukleme-${Date.now()}.db`;
  const file = path.join(dir, token);
  fs.writeFileSync(file, bytes);
  try {
    return { token, check: validateBackupFile(file) };
  } catch (err) {
    fs.rmSync(file, { force: true });
    throw err;
  }
}

/**
 * Doğrulanmış dosyayı canlı veritabanının yerine koyar:
 * 1) mevcut veri yedeklenir, 2) bağlantı kapatılır (WAL boşaltılır), 3) dosya değiştirilir,
 * 4) bağlantı yeniden açılır (gerekirse şema geçişleri çalışır). Hata olursa eski dosya geri konur.
 */
export function restoreFromFile(file: string): { before: BackupFile; check: BackupCheck } {
  const check = validateBackupFile(file);
  const before = createBackup("geri-yukleme-oncesi");
  const live = dbPath();
  const rollback = `${live}.geri-al`;
  closeDb();
  try {
    for (const ext of ["-wal", "-shm"]) fs.rmSync(live + ext, { force: true });
    fs.copyFileSync(live, rollback);
    fs.copyFileSync(file, live);
    getDb(); // yeniden aç + şema geçişleri
    fs.rmSync(rollback, { force: true });
  } catch (err) {
    console.error("[yedek] geri yükleme başarısız, eski veri geri konuyor", err);
    closeDb();
    try {
      for (const ext of ["-wal", "-shm"]) fs.rmSync(live + ext, { force: true });
      if (fs.existsSync(rollback)) fs.copyFileSync(rollback, live);
      fs.rmSync(rollback, { force: true });
    } catch {}
    getDb();
    throw new ValidationError("Geri yükleme yapılamadı; mevcut verileriniz değişmedi.");
  } finally {
    fs.rmSync(file, { force: true });
  }
  return { before, check };
}
