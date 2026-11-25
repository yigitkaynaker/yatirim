import type { Db, Row, SqlValue } from "./types";

// Veri taşıma / JSON yedek: tüm tabloların satırlarını okur ve başka bir veritabanına
// (aynı ya da farklı lehçe) tek işlem içinde yazar. Hem "tasi:neon" betiği hem de bulut
// modundaki "Tüm verilerimi indir / JSON'dan geri yükle" bunu kullanır.
// İki kapsam: tam (taşıma betiği; users dahil tüm tablolar) ve kullanıcı (userId verilir: yalnızca o
// kullanıcının satırları okunur / silinir / yazılır; yazılan her satırın user_id'si o kullanıcıya zorlanır
// ve satırların başka kullanıcının kaydına bağlanmadığı denetlenir).

/** Tablolar, yabancı anahtar sırasına göre (önce bağımsızlar). */
export const DATA_TABLES = [
  "users",
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
  "mcp_calls",
  // önbellekler (yeniden oluşur; JSON yedeğinde isteğe bağlı)
  "price_cache",
  "dividend_history",
  "ext_cache",
] as const;

/** Yeniden oluşan önbellek tabloları (JSON yedeğe varsayılan olarak girmez) */
export const CACHE_TABLES = new Set<string>(["price_cache", "dividend_history", "ext_cache"]);

/** Kimlik (id) sütunu otomatik artan tablolar: yükleme sonrası sayaç ayarlanır */
export const ID_TABLES = new Set<string>([
  "users",
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
  "mcp_calls",
]);

/**
 * Gizli ayarlar (settings anahtarları): JSON dökümüne varsayılan olarak girmez. Bildirim anahtar
 * çifti birlikte ele alınır (açık anahtar tek başına geri yüklenirse gizli anahtarla uyuşmaz).
 */
export const SECRET_SETTINGS: readonly string[] = ["anthropic_api_key", "openai_api_key", "vapid_private_key", "vapid_public_key"];
// Not: OAuth / MCP bağlantı tabloları (oauth_clients, oauth_codes, oauth_tokens) dökümlere hiç girmez;
// geri yüklemeden sonra ChatGPT / Claude.ai bağlantısı gerekirse yeniden kurulur.

/**
 * Kullanıcıya ait tablolar (user_id sütunlu). Kullanıcı dökümüne yalnızca bunlar girer. Cihaza bağlı
 * push abonelikleri ve paylaşılan tablolar (fonlar, KAP, zamanlama kayıtları, önbellekler) girmez.
 */
export const USER_TABLES = new Set<string>([
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
  "technical_signals",
  "dividends",
  "alarms",
  "alarm_events",
  "daily_summaries",
  "position_notes",
  "mcp_calls",
]);

/** Kullanıcı yüklemesinde denetlenen bağlar: [tablo, sütun, hedef tablo] — hedef aynı kullanıcının olmalı */
const USER_REFS: [string, string, string][] = [
  ["transactions", "account_id", "accounts"],
  ["transactions", "source_id", "transactions"],
  ["transactions", "converted_to_id", "transactions"],
  ["transactions", "order_id", "orders"],
  ["orders", "account_id", "accounts"],
  ["orders", "executed_tx_id", "transactions"],
  ["notifications", "order_id", "orders"],
  ["chat_messages", "conversation_id", "chat_conversations"],
  ["alarms", "account_id", "accounts"],
  ["alarm_events", "alarm_id", "alarms"],
];

export const DUMP_FORMAT = "yatirim-veri";

export interface DataDump {
  format: typeof DUMP_FORMAT;
  /** Dökümü oluşturan uygulamanın şema sürümü (SQLite numarası) */
  schemaVersion: number;
  exportedAt: string;
  source: "sqlite" | "pg";
  /** Gizli ayarlar (API anahtarı, bildirim anahtarları) dahil mi; eski dökümlerde yok (dahildir) */
  includesSecrets?: boolean;
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

function isSecretRow(r: Row): boolean {
  return SECRET_SETTINGS.includes(String(r.key));
}

/**
 * Tüm tablolar (userId verilirse yalnızca o kullanıcının tabloları ve satırları). includeSecrets
 * verilmezse gizli ayarlar (SECRET_SETTINGS) dökümden çıkarılır.
 */
export async function dumpAll(
  db: Db,
  opts: { includeCaches?: boolean; includeSecrets?: boolean; schemaVersion: number; userId?: number },
): Promise<DataDump> {
  const tables: Record<string, Row[]> = {};
  const uid = opts.userId;
  for (const t of DATA_TABLES) {
    if (uid != null && !USER_TABLES.has(t)) continue;
    if (!opts.includeCaches && CACHE_TABLES.has(t)) continue;
    const order = (await tableColumns(db, t)).includes("id") ? " ORDER BY id" : "";
    let rows = uid != null ? await db.all<Row>(`SELECT * FROM ${t} WHERE user_id = ?${order}`, [uid]) : await db.all<Row>(`SELECT * FROM ${t}${order}`);
    if (uid != null) rows = rows.map((r) => Object.fromEntries(Object.entries(r).filter(([k]) => k !== "user_id")));
    if (t === "settings" && !opts.includeSecrets) rows = rows.filter((r) => !isSecretRow(r));
    tables[t] = rows;
  }
  return {
    format: DUMP_FORMAT,
    schemaVersion: opts.schemaVersion,
    exportedAt: new Date().toISOString(),
    source: db.dialect,
    includesSecrets: !!opts.includeSecrets,
    tables,
  };
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
 * Dökümde olmayan gizli ayarlar (gizli anahtarlar hariç indirilmiş dosya) hedefteki değerleriyle korunur.
 */
export async function loadAll(
  db: Db,
  dump: DataDump,
  opts: {
    replace?: boolean;
    batch?: number;
    userId?: number;
    /** Bu tablolara hiç dokunulmaz (silinmez, yazılmaz) */
    skipTables?: ReadonlySet<string>;
    /** Verilirse settings'te yalnızca bu anahtarlar silinir / yazılır (diğerleri olduğu gibi kalır) */
    allowedSettings?: readonly string[];
  } = {},
): Promise<LoadResult> {
  const counts: Record<string, number> = {};
  const batch = opts.batch ?? 200;
  const uid = opts.userId;
  const scoped = (t: string) => uid == null || USER_TABLES.has(t);
  const where = uid != null ? " WHERE user_id = ?" : "";
  const whereArgs = uid != null ? [uid] : [];
  const allowed = opts.allowedSettings ? new Set(opts.allowedSettings) : null;
  const skip = (t: string) => !scoped(t) || !!opts.skipTables?.has(t);
  await db.tx(async () => {
    if (db.dialect === "pg") await db.exec("SET CONSTRAINTS ALL DEFERRED");
    else await db.exec("PRAGMA defer_foreign_keys = ON");
    // Dökümde olmayan gizli ayarlar silinmesin: önce mevcut değerleri al, yüklemeden sonra geri yaz.
    const dumpKeys = new Set((dump.tables.settings ?? []).map((r) => String(r.key)));
    const keep =
      opts.replace && dump.tables.settings
        ? (await db.all<Row>(`SELECT * FROM settings${where}`, whereArgs)).filter(
            (r) => isSecretRow(r) && !dumpKeys.has(String(r.key)) && (!allowed || allowed.has(String(r.key))),
          )
        : [];
    if (opts.replace) {
      for (const t of [...DATA_TABLES].reverse()) {
        if (skip(t)) continue;
        if (t === "settings" && allowed) {
          // Yalnızca izinli anahtarlar değişir (kota sayaçları vb. korunur)
          const list = [...allowed];
          await db.run(`DELETE FROM settings${where}${where ? " AND" : " WHERE"} key IN (${list.map(() => "?").join(", ")})`, [...whereArgs, ...list]);
          continue;
        }
        // Kullanıcısız eski döküm: kullanıcılar (sahip) korunur
        if (t === "users" && dump.tables.users === undefined) continue;
        if (dump.tables[t] === undefined && CACHE_TABLES.has(t)) continue; // dökümde yoksa önbelleğe dokunma
        await db.run(`DELETE FROM ${t}${where}`, whereArgs);
      }
    }
    for (const t of DATA_TABLES) {
      let raw = dump.tables[t];
      if (!raw || skip(t)) continue;
      if (t === "settings" && allowed) raw = raw.filter((r) => allowed.has(String(r.key)));
      // Kullanıcı yüklemesi: dosyadaki user_id yok sayılır, satır bu kullanıcıya yazılır.
      const rows: Row[] = uid != null ? raw.map((r) => ({ ...r, user_id: uid })) : raw;
      const have = new Set(await tableColumns(db, t));
      const types = await pgTypes(db, t);
      counts[t] = 0;
      if (rows.length === 0) continue;
      const cols = [...new Set(rows.flatMap((r) => Object.keys(r)))].filter((c) => have.has(c));
      if (cols.length === 0) continue;
      for (let i = 0; i < rows.length; i += batch) {
        const part = rows.slice(i, i + batch);
        const values = part.map(() => `(${cols.map(() => "?").join(", ")})`).join(", ");
        const params = part.flatMap((r) => cols.map((c) => toValue(r[c], types.get(c))));
        await db.run(`INSERT INTO ${t} (${cols.join(", ")}) VALUES ${values}`, params);
        counts[t] += part.length;
      }
    }
    for (const r of keep) {
      const cols = Object.keys(r);
      await db.run(`INSERT INTO settings (${cols.join(", ")}) VALUES (${cols.map(() => "?").join(", ")})`, cols.map((c) => toValue(r[c])));
    }
    if (uid != null) await assertOwnRefs(db, uid);
    if (db.dialect === "pg") await resetSequences(db);
  });
  return { counts };
}

/** Kullanıcı yüklemesinden sonra: kullanıcının satırları yalnızca kendi kayıtlarına bağlanabilir. */
async function assertOwnRefs(db: Db, uid: number) {
  for (const [t, col, target] of USER_REFS) {
    const bad = await db.get(
      `SELECT 1 AS x FROM ${t} c WHERE c.user_id = ? AND c.${col} IS NOT NULL AND NOT EXISTS (SELECT 1 FROM ${target} p WHERE p.id = c.${col} AND p.user_id = ?) LIMIT 1`,
      [uid, uid],
    );
    if (bad) throw new Error(`Dosyadaki ${t}.${col} kaydı bu hesaba ait olmayan bir kayda bağlı; dosya yüklenemedi.`);
  }
}

/** Postgres kimlik sayaçlarını tablolardaki en büyük id'nin sonrasına ayarlar. */
export async function resetSequences(db: Db) {
  for (const t of ID_TABLES) {
    await db.get(`SELECT setval(pg_get_serial_sequence('${t}', 'id'), COALESCE((SELECT MAX(id) FROM ${t}), 0) + 1, false) AS v`);
  }
}

/** Tablo başına satır sayıları */
export async function rowCounts(db: Db, tables: readonly string[] = DATA_TABLES, userId?: number): Promise<Record<string, number>> {
  const out: Record<string, number> = {};
  for (const t of tables) {
    out[t] =
      (userId != null && USER_TABLES.has(t)
        ? await db.get<{ c: number }>(`SELECT COUNT(*) AS c FROM ${t} WHERE user_id = ?`, [userId])
        : await db.get<{ c: number }>(`SELECT COUNT(*) AS c FROM ${t}`))?.c ?? 0;
  }
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
