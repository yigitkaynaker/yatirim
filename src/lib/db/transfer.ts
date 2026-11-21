import type { Db, Row, SqlValue } from "./types";

// Veri taşıma / JSON yedek: tüm tabloların satırlarını okur ve başka bir veritabanına
// (aynı ya da farklı lehçe) tek işlem içinde yazar. Hem "tasi:neon" betiği hem de bulut
// modundaki "Tüm verilerimi indir / JSON'dan geri yükle" bunu kullanır.

/** Tablolar, yabancı anahtar sırasına göre (önce bağımsızlar). */
export const DATA_TABLES = [
  "accounts",
  "settings",
  "transactions",
  "orders",
  "notifications",
  "watchlist",
  "portfolio_snapshots",
  "ai_usage",
  "chat_conversations",
  "chat_messages",
  "news_reports",
  "scheduled_runs",
  "push_subscriptions",
  "technical_signals",
  "funds",
  "dividends",
  "kap_disclosures",
  "alarms",
  "alarm_events",
  "daily_summaries",
  "position_notes",
  // önbellekler (yeniden oluşur; JSON yedeğinde isteğe bağlı)
  "price_cache",
  "dividend_history",
  "ext_cache",
] as const;

/** Yeniden oluşan önbellek tabloları (JSON yedeğe varsayılan olarak girmez) */
export const CACHE_TABLES = new Set<string>(["price_cache", "dividend_history", "ext_cache"]);

/** Kimlik (id) sütunu otomatik artan tablolar: yükleme sonrası sayaç ayarlanır */
export const ID_TABLES = new Set<string>([
  "accounts",
  "transactions",
  "orders",
  "notifications",
  "watchlist",
  "ai_usage",
  "chat_conversations",
  "chat_messages",
  "news_reports",
  "push_subscriptions",
  "dividends",
  "alarms",
  "alarm_events",
]);

export const DUMP_FORMAT = "yatirim-veri";

export interface DataDump {
  format: typeof DUMP_FORMAT;
  /** Dökümü oluşturan uygulamanın şema sürümü (SQLite numarası) */
  schemaVersion: number;
  exportedAt: string;
  source: "sqlite" | "pg";
  tables: Record<string, Row[]>;
}

/** Bir tablonun sütun adları (veritabanından) */
export async function tableColumns(db: Db, table: string): Promise<string[]> {
  if (db.dialect === "sqlite") {
    const rows = await db.all<{ name: string }>(`SELECT name FROM pragma_table_info(?)`, [table]);
    return rows.map((r) => r.name);
  }
  const rows = await db.all<{ column_name: string }>(
    "SELECT column_name FROM information_schema.columns WHERE table_schema = current_schema() AND table_name = ? ORDER BY ordinal_position",
    [table],
  );
  return rows.map((r) => r.column_name);
}

export async function dumpAll(db: Db, opts: { includeCaches?: boolean; schemaVersion: number }): Promise<DataDump> {
  const tables: Record<string, Row[]> = {};
  for (const t of DATA_TABLES) {
    if (!opts.includeCaches && CACHE_TABLES.has(t)) continue;
    const order = (await tableColumns(db, t)).includes("id") ? " ORDER BY id" : "";
    tables[t] = await db.all<Row>(`SELECT * FROM ${t}${order}`);
  }
  return { format: DUMP_FORMAT, schemaVersion: opts.schemaVersion, exportedAt: new Date().toISOString(), source: db.dialect, tables };
}

export interface LoadResult {
  counts: Record<string, number>;
}

/** Postgres sütun türleri (BIGINT sütuna SQLite'tan gelen ondalık değer yuvarlanır) */
async function pgTypes(db: Db, table: string): Promise<Map<string, string>> {
  if (db.dialect !== "pg") return new Map();
  const rows = await db.all<{ column_name: string; data_type: string }>(
    "SELECT column_name, data_type FROM information_schema.columns WHERE table_schema = current_schema() AND table_name = ?",
    [table],
  );
  return new Map(rows.map((r) => [r.column_name, r.data_type]));
}

function toValue(v: unknown, type?: string): SqlValue {
  if (v == null) return null;
  if (type === "bigint" && typeof v === "number" && !Number.isInteger(v)) return Math.round(v);
  if (typeof v === "number" || typeof v === "string" || typeof v === "bigint") return v;
  if (typeof v === "boolean") return v ? 1 : 0;
  if (v instanceof Uint8Array) return v;
  return JSON.stringify(v);
}

/**
 * Dökümü hedef veritabanına yazar. replace: önce tüm veri tablolarını boşaltır.
 * Hepsi tek işlemde; hata olursa hiçbir şey değişmez. Bilinmeyen tablo / sütunlar atlanır.
 * Yabancı anahtarlar işlem sonuna ertelenir (işlem ↔ emir döngüsel bağları için).
 */
export async function loadAll(db: Db, dump: DataDump, opts: { replace?: boolean; batch?: number } = {}): Promise<LoadResult> {
  const counts: Record<string, number> = {};
  const batch = opts.batch ?? 200;
  await db.tx(async () => {
    if (db.dialect === "pg") await db.exec("SET CONSTRAINTS ALL DEFERRED");
    else await db.exec("PRAGMA defer_foreign_keys = ON");
    if (opts.replace) {
      for (const t of [...DATA_TABLES].reverse()) {
        if (dump.tables[t] === undefined && CACHE_TABLES.has(t)) continue; // dökümde yoksa önbelleğe dokunma
        await db.run(`DELETE FROM ${t}`);
      }
    }
    for (const t of DATA_TABLES) {
      const rows = dump.tables[t];
      if (!rows) continue;
      const have = new Set(await tableColumns(db, t));
      const types = await pgTypes(db, t);
      counts[t] = 0;
      if (rows.length === 0) continue;
      const cols = Object.keys(rows[0]).filter((c) => have.has(c));
      if (cols.length === 0) continue;
      for (let i = 0; i < rows.length; i += batch) {
        const part = rows.slice(i, i + batch);
        const values = part.map(() => `(${cols.map(() => "?").join(", ")})`).join(", ");
        const params = part.flatMap((r) => cols.map((c) => toValue(r[c], types.get(c))));
        await db.run(`INSERT INTO ${t} (${cols.join(", ")}) VALUES ${values}`, params);
        counts[t] += part.length;
      }
    }
    if (db.dialect === "pg") await resetSequences(db);
  });
  return { counts };
}

/** Postgres kimlik sayaçlarını tablolardaki en büyük id'nin sonrasına ayarlar. */
export async function resetSequences(db: Db) {
  for (const t of ID_TABLES) {
    await db.get(`SELECT setval(pg_get_serial_sequence('${t}', 'id'), COALESCE((SELECT MAX(id) FROM ${t}), 0) + 1, false) AS v`);
  }
}

/** Tablo başına satır sayıları */
export async function rowCounts(db: Db, tables: readonly string[] = DATA_TABLES): Promise<Record<string, number>> {
  const out: Record<string, number> = {};
  for (const t of tables) out[t] = (await db.get<{ c: number }>(`SELECT COUNT(*) AS c FROM ${t}`))?.c ?? 0;
  return out;
}

/** Yüklenen JSON'un bir döküm olduğunu doğrular */
export function parseDump(raw: unknown): DataDump {
  const d = raw as Partial<DataDump> | null;
  if (!d || typeof d !== "object" || d.format !== DUMP_FORMAT || typeof d.tables !== "object" || d.tables === null) {
    throw new Error("Bu dosya bir yatırım uygulaması veri dosyası değil.");
  }
  for (const [t, rows] of Object.entries(d.tables)) {
    if (!(DATA_TABLES as readonly string[]).includes(t)) throw new Error(`Bilinmeyen tablo: ${t}`);
    if (!Array.isArray(rows)) throw new Error(`${t} tablosu geçersiz.`);
  }
  if (!Array.isArray(d.tables.transactions)) throw new Error("Dosyada işlemler (transactions) yok.");
  return d as DataDump;
}
