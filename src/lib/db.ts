import "server-only";
import { DatabaseSync } from "node:sqlite";
import fs from "node:fs";
import path from "node:path";

// Node'un yerleşik SQLite modülü: yerel derleme gerektirmez.
// Veritabanı dosyası: data/yatirim.db (git'e eklenmez).

// YATIRIM_DATA_DIR: test sunucusu gibi durumlarda farklı bir veri klasörü kullanmak için.
const DATA_DIR = process.env.YATIRIM_DATA_DIR || path.join(process.cwd(), "data");
const DB_PATH = path.join(DATA_DIR, "yatirim.db");

/**
 * Şema sürümleri. Yeni tablo / sütun eklemek için listeye yeni bir adım ekleyin;
 * mevcut adımları asla değiştirmeyin.
 */
const MIGRATIONS: string[] = [
  `
  CREATE TABLE transactions (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    asset_type  TEXT    NOT NULL,
    symbol      TEXT    NOT NULL,
    side        TEXT    NOT NULL CHECK (side IN ('buy','sell')),
    quantity    REAL    NOT NULL CHECK (quantity > 0),
    price       REAL    NOT NULL CHECK (price >= 0),
    currency    TEXT    NOT NULL,
    date        TEXT    NOT NULL,
    note        TEXT,
    -- real: gerçek işlem, virtual: sanal (ne olurdu) işlem
    mode        TEXT    NOT NULL DEFAULT 'real' CHECK (mode IN ('real','virtual')),
    -- sanal girişte kullanıcının yatırdığı tutar ve para birimi (adet girildiyse NULL)
    amount           REAL,
    amount_currency  TEXT,
    -- sanal giriş anındaki canlı fiyatın kaynağı / zamanı (ms)
    price_time       INTEGER,
    -- gerçek işlem bir sanal pozisyondan dönüştürüldüyse kaynak sanal işlem
    source_id        INTEGER REFERENCES transactions(id) ON DELETE SET NULL,
    -- sanal işlem gerçeğe dönüştürüldüyse: zaman ve oluşan gerçek işlem
    converted_at     TEXT,
    converted_to_id  INTEGER REFERENCES transactions(id) ON DELETE SET NULL,
    created_at  TEXT    NOT NULL DEFAULT (datetime('now')),
    updated_at  TEXT    NOT NULL DEFAULT (datetime('now'))
  );
  CREATE INDEX idx_transactions_asset ON transactions (mode, asset_type, symbol, date);

  CREATE TABLE price_cache (
    key          TEXT PRIMARY KEY,
    price        REAL NOT NULL,
    currency     TEXT NOT NULL,
    change_pct   REAL,
    source_time  INTEGER,
    fetched_at   INTEGER NOT NULL
  );
  `,
  `
  -- Koşullu al/sat emirleri. Yalnızca uygulama içinde gerçekleşir; aracı kurum bağlantısı yoktur.
  CREATE TABLE orders (
    id               INTEGER PRIMARY KEY AUTOINCREMENT,
    mode             TEXT    NOT NULL CHECK (mode IN ('real','virtual')),
    asset_type       TEXT    NOT NULL,
    symbol           TEXT    NOT NULL,
    side             TEXT    NOT NULL CHECK (side IN ('buy','sell')),
    -- lte: fiyat <= tetik, gte: fiyat >= tetik
    condition        TEXT    NOT NULL CHECK (condition IN ('lte','gte')),
    trigger_price    REAL    NOT NULL CHECK (trigger_price > 0),
    -- tetik fiyatının para birimi (varlığın fiyat birimi)
    trigger_currency TEXT    NOT NULL,
    -- adet ya da tutar (biri dolu)
    quantity         REAL,
    amount           REAL,
    amount_currency  TEXT,
    status           TEXT    NOT NULL DEFAULT 'pending'
                     CHECK (status IN ('pending','executed','cancelled','failed')),
    source           TEXT    NOT NULL DEFAULT 'manuel' CHECK (source IN ('manuel','yapay_zeka')),
    note             TEXT,
    created_at       TEXT    NOT NULL DEFAULT (datetime('now')),
    executed_at      TEXT,
    executed_price   REAL,
    executed_tx_id   INTEGER REFERENCES transactions(id) ON DELETE SET NULL,
    cancelled_at     TEXT,
    error            TEXT
  );
  CREATE INDEX idx_orders_status ON orders (status);

  -- İşlem bir emirle otomatik oluştuysa
  ALTER TABLE transactions ADD COLUMN order_id INTEGER REFERENCES orders(id) ON DELETE SET NULL;

  -- Uygulama içi bildirimler (ileride push bildirimleri de buradan beslenebilir)
  CREATE TABLE notifications (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    kind        TEXT    NOT NULL,
    title       TEXT    NOT NULL,
    body        TEXT    NOT NULL,
    order_id    INTEGER REFERENCES orders(id) ON DELETE SET NULL,
    -- ek yapılandırılmış veri (JSON)
    data        TEXT,
    created_at  TEXT    NOT NULL DEFAULT (datetime('now')),
    read_at     TEXT
  );
  CREATE INDEX idx_notifications_unread ON notifications (read_at, id);
  `,
  `
  -- Piyasa sayfasındaki kullanıcı izleme listesi
  CREATE TABLE watchlist (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    asset_type  TEXT    NOT NULL,
    symbol      TEXT    NOT NULL,
    -- aramadan gelen görünen ad (isteğe bağlı)
    name        TEXT,
    created_at  TEXT    NOT NULL DEFAULT (datetime('now')),
    UNIQUE (asset_type, symbol)
  );

  -- Günlük portföy değeri (gerçek ve sanal ayrı). Gün başına mod başına tek satır;
  -- gün içinde izleyici tarafından güncellenir, gün bitince son değer kalır.
  CREATE TABLE portfolio_snapshots (
    date        TEXT    NOT NULL,
    mode        TEXT    NOT NULL CHECK (mode IN ('real','virtual')),
    value_try   REAL    NOT NULL,
    cost_try    REAL    NOT NULL,
    updated_at  INTEGER NOT NULL,
    PRIMARY KEY (date, mode)
  );
  `,
  `
  -- Uygulama ayarları (anahtar/değer). API anahtarı, model, tarama takvimi, bütçe, VAPID anahtarları.
  CREATE TABLE settings (
    key         TEXT PRIMARY KEY,
    value       TEXT NOT NULL,
    updated_at  TEXT NOT NULL DEFAULT (datetime('now'))
  );

  -- Her Claude API çağrısı: token, web araması ve tahmini maliyet (USD)
  CREATE TABLE ai_usage (
    id                  INTEGER PRIMARY KEY AUTOINCREMENT,
    kind                TEXT    NOT NULL,             -- sohbet | haber | test
    model               TEXT    NOT NULL,
    input_tokens        INTEGER NOT NULL DEFAULT 0,
    output_tokens       INTEGER NOT NULL DEFAULT 0,
    cache_read_tokens   INTEGER NOT NULL DEFAULT 0,
    cache_write_tokens  INTEGER NOT NULL DEFAULT 0,
    web_searches        INTEGER NOT NULL DEFAULT 0,
    cost_usd            REAL    NOT NULL DEFAULT 0,
    created_at          TEXT    NOT NULL DEFAULT (datetime('now'))
  );
  CREATE INDEX idx_ai_usage_created ON ai_usage (created_at);

  -- Sohbetler ve mesajlar. content: API'ye geri gönderilen içerik blokları (JSON).
  -- cards: o mesajdaki araç çağrılarının kullanıcıya gösterilen özet kartları (JSON).
  CREATE TABLE chat_conversations (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    title       TEXT    NOT NULL,
    created_at  TEXT    NOT NULL DEFAULT (datetime('now')),
    updated_at  TEXT    NOT NULL DEFAULT (datetime('now'))
  );
  CREATE TABLE chat_messages (
    id               INTEGER PRIMARY KEY AUTOINCREMENT,
    conversation_id  INTEGER NOT NULL REFERENCES chat_conversations(id) ON DELETE CASCADE,
    role             TEXT    NOT NULL CHECK (role IN ('user','assistant')),
    content          TEXT    NOT NULL,
    cards            TEXT,
    created_at       TEXT    NOT NULL DEFAULT (datetime('now'))
  );
  CREATE INDEX idx_chat_messages_conv ON chat_messages (conversation_id, id);

  -- Haber analizi raporları. items: varlık başına yapılandırılmış sonuç (JSON).
  CREATE TABLE news_reports (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    trigger         TEXT    NOT NULL,                 -- otomatik | manuel | varlik
    scope           TEXT,                             -- tek varlık analizinde enstrüman kimliği
    status          TEXT    NOT NULL DEFAULT 'running' CHECK (status IN ('running','ok','error')),
    model           TEXT,
    market_summary  TEXT,
    items           TEXT,
    sources         TEXT,
    error           TEXT,
    web_searches    INTEGER NOT NULL DEFAULT 0,
    cost_usd        REAL    NOT NULL DEFAULT 0,
    created_at      TEXT    NOT NULL DEFAULT (datetime('now')),
    finished_at     TEXT
  );

  -- Otomatik taramanın her zaman dilimi yalnızca bir kez çalışsın diye (örn. "2026-11-20 09:45")
  CREATE TABLE scheduled_runs (
    slot        TEXT PRIMARY KEY,
    created_at  TEXT NOT NULL DEFAULT (datetime('now'))
  );

  -- Web Push abonelikleri (cihaz başına bir satır)
  CREATE TABLE push_subscriptions (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    endpoint    TEXT    NOT NULL UNIQUE,
    p256dh      TEXT    NOT NULL,
    auth        TEXT    NOT NULL,
    user_agent  TEXT,
    created_at  TEXT    NOT NULL DEFAULT (datetime('now')),
    last_ok_at  TEXT,
    fail_count  INTEGER NOT NULL DEFAULT 0
  );
  `,
  `
  -- Günlük teknik sinyal kontrolünün son sonucu (varlık başına). Sinyal değişince bildirim üretilir.
  CREATE TABLE technical_signals (
    instrument    TEXT PRIMARY KEY,
    label         TEXT    NOT NULL,
    score         INTEGER NOT NULL,
    checked_date  TEXT    NOT NULL,
    updated_at    TEXT    NOT NULL DEFAULT (datetime('now'))
  );
  `,
  `
  -- İşlem para biriminin işlem tarihindeki TRY kuru (örn. USD işlemde o günün USDTRY'si).
  -- TL maliyet ve gerçekleşen TL K/Z bu kurla hesaplanır. TRY işlemlerde 1.
  -- Eski USD/EUR kayıtlarında NULL kalır; ilk portföy okumasında Yahoo geçmiş kurlarıyla
  -- doldurulur (fxRates.ts), o zamana kadar güncel kur kullanılır.
  ALTER TABLE transactions ADD COLUMN fx_try REAL;
  UPDATE transactions SET fx_try = 1 WHERE currency = 'TRY';
  `,
];

function open(): DatabaseSync {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  const db = new DatabaseSync(DB_PATH);
  db.exec("PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000;");
  migrate(db);
  return db;
}

function migrate(db: DatabaseSync) {
  const row = db.prepare("PRAGMA user_version").get() as { user_version: number };
  let version = row.user_version;
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

const g = globalThis as unknown as { __yatirimDb?: DatabaseSync };

/** Tekil bağlantı (dev modda HMR sırasında yeniden açılmaz). */
export function getDb(): DatabaseSync {
  if (!g.__yatirimDb) g.__yatirimDb = open();
  return g.__yatirimDb;
}
