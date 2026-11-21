// Veritabanı soyutlaması: yerel modda SQLite (node:sqlite), bulut modunda Postgres (Neon).
// Tüm sorgular "?" yer tutucusuyla yazılır; Postgres bağdaştırıcısı bunları $1, $2…'ye çevirir.
// Taşınabilir SQL: datetime('now') yerine sqlNow() parametresi, INSERT OR IGNORE yerine
// ON CONFLICT DO NOTHING, lastInsertRowid yerine RETURNING id, mantıksal alanlar 0/1.

export type SqlValue = string | number | bigint | null | Uint8Array;
export type SqlParams = readonly SqlValue[];
export type Row = Record<string, unknown>;

export interface RunResult {
  /** Etkilenen satır sayısı */
  changes: number;
  /** INSERT … RETURNING id kullanıldıysa (ya da SQLite'ta) eklenen satırın kimliği */
  lastId?: number;
}

export interface Db {
  readonly dialect: "sqlite" | "pg";
  all<T = Row>(sql: string, params?: SqlParams): Promise<T[]>;
  get<T = Row>(sql: string, params?: SqlParams): Promise<T | undefined>;
  run(sql: string, params?: SqlParams): Promise<RunResult>;
  /** Parametresiz, birden çok ifade içerebilen SQL */
  exec(sql: string): Promise<void>;
  /**
   * İşlem (transaction). fn içindeki TÜM getDb() çağrıları (iç içe fonksiyonlar dahil) aynı
   * işleme katılır (AsyncLocalStorage). Hata fırlatılırsa geri alınır. İç içe tx bir kayıt
   * noktasıdır (SAVEPOINT): içte fırlatılan hata yalnızca iç kısmı geri alır; dış kod hatayı
   * yakalarsa dış işlem devam eder.
   */
  tx<T>(fn: (t: Db) => Promise<T>): Promise<T>;
  /**
   * İşlem sonuna kadar tutulan adlandırılmış kilit (Postgres: pg_advisory_xact_lock). Aynı
   * anahtarla kontrol-sonra-yaz yapan eşzamanlı işlemleri sıraya sokar. tx() içinde, işlemin
   * başında çağrılmalıdır. SQLite'ta işlemler zaten tek tek çalıştığı için etkisizdir.
   */
  lockKey(key: string): Promise<void>;
}

/** Bir bağlantı üzerinde ham sorgu çalıştırıcı (bağdaştırıcılar uygular) */
export interface Executor {
  all<T>(sql: string, params: SqlParams): Promise<T[]>;
  run(sql: string, params: SqlParams): Promise<RunResult>;
  exec(sql: string): Promise<void>;
}

export interface Driver {
  readonly dialect: "sqlite" | "pg";
  /** İşlem dışındaki sorgular */
  root: Executor;
  /** fn'i tek bir işlem içinde çalıştırır (BEGIN … COMMIT / ROLLBACK) */
  transaction<T>(fn: (ex: Executor) => Promise<T>): Promise<T>;
  close(): Promise<void>;
}
