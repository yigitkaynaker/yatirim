// SQLite şema geçişleri (yerel mod). Sürüm PRAGMA user_version ile izlenir.
// Yeni tablo / sütun eklemek için listeye yeni bir adım ekleyin; mevcut adımları asla değiştirmeyin.
// Bulut (Postgres) karşılığı: migrationsPg.ts. İkisi aynı tablo/sütunları üretmelidir (test:pg şema testi).

export const MIGRATIONS: string[] = [
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
  `
  -- Fiyat önbelleği: önceki kapanış ("bugün" K/Z için) ve kaynağa özel ek bilgi (JSON: alış fiyatı, fon adı, yaklaşık mı).
  ALTER TABLE price_cache ADD COLUMN prev_close REAL;
  ALTER TABLE price_cache ADD COLUMN extra TEXT;

  -- TEFAS fonları: doğrulanmış fon kodları ve adları (arama ve görünen ad için)
  CREATE TABLE funds (
    code        TEXT PRIMARY KEY,
    name        TEXT,
    last_price  REAL,
    last_date   TEXT,
    updated_at  TEXT NOT NULL DEFAULT (datetime('now'))
  );

  -- Temettü (kâr payı) kayıtları. confirmed: gelir olarak kaydedildi (gerçekleşen K/Z'ye eklenir),
  -- dismissed: öneri kullanıcı tarafından gizlendi. Hak kullanım tarihi başına tek satır.
  CREATE TABLE dividends (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    mode        TEXT    NOT NULL CHECK (mode IN ('real','virtual')),
    asset_type  TEXT    NOT NULL,
    symbol      TEXT    NOT NULL,
    ex_date     TEXT    NOT NULL,
    per_share   REAL    NOT NULL CHECK (per_share >= 0),
    quantity    REAL    NOT NULL CHECK (quantity >= 0),
    amount      REAL    NOT NULL CHECK (amount >= 0),
    currency    TEXT    NOT NULL,
    -- para biriminin hak kullanım tarihindeki TRY kuru (TRY için 1)
    fx_try      REAL,
    status      TEXT    NOT NULL DEFAULT 'confirmed' CHECK (status IN ('confirmed','dismissed')),
    source      TEXT    NOT NULL DEFAULT 'otomatik',
    note        TEXT,
    created_at  TEXT    NOT NULL DEFAULT (datetime('now')),
    UNIQUE (mode, asset_type, symbol, ex_date)
  );

  -- Kaynaktan alınan temettü geçmişi önbelleği (varlık başına JSON)
  CREATE TABLE dividend_history (
    instrument  TEXT PRIMARY KEY,
    currency    TEXT,
    events      TEXT    NOT NULL,
    fetched_at  INTEGER NOT NULL
  );

  -- KAP bildirimleri (yalnızca portföy / izleme listesi hisseleriyle ilgili olanlar saklanır)
  CREATE TABLE kap_disclosures (
    disclosure_index  INTEGER PRIMARY KEY,
    publish_at        INTEGER NOT NULL,
    -- ",THYAO,PGSUS," biçiminde (LIKE '%,THYAO,%' ile aranır)
    stock_codes       TEXT    NOT NULL,
    kap_title         TEXT,
    subject           TEXT,
    summary           TEXT,
    disclosure_class  TEXT,
    disclosure_type   TEXT,
    is_dividend       INTEGER NOT NULL DEFAULT 0,
    created_at        TEXT    NOT NULL DEFAULT (datetime('now'))
  );
  CREATE INDEX idx_kap_publish ON kap_disclosures (publish_at);
  `,
  `
  -- İşlem yapmayan alarmlar (yalnızca bildirim + push). Süresi dolmaz.
  -- kind: price (fiyat eşiği), day_change (günlük % değişim), cost_change (maliyete göre %),
  --       volume_spike (bugünkü hacim / 20 günlük ortalama), signal_change (teknik sinyal değişimi)
  -- scope: asset (tek varlık) | watchlist (izleme listesindeki herhangi biri)
  -- direction: up (üstüne çıkınca / yükselince), down (altına inince / düşünce), both
  -- state: tetiklenme durumu (JSON; varlık başına "kurulu mu", son tetiklenme, son sinyal)
  CREATE TABLE alarms (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    kind          TEXT    NOT NULL CHECK (kind IN ('price','day_change','cost_change','volume_spike','signal_change')),
    scope         TEXT    NOT NULL DEFAULT 'asset' CHECK (scope IN ('asset','watchlist')),
    asset_type    TEXT,
    symbol        TEXT,
    mode          TEXT    CHECK (mode IS NULL OR mode IN ('real','virtual')),
    direction     TEXT    NOT NULL DEFAULT 'both' CHECK (direction IN ('up','down','both')),
    threshold     REAL,
    repeat        TEXT    NOT NULL DEFAULT 'once' CHECK (repeat IN ('once','every')),
    cooldown_min  INTEGER NOT NULL DEFAULT 60 CHECK (cooldown_min >= 0),
    active        INTEGER NOT NULL DEFAULT 1,
    note          TEXT,
    source        TEXT    NOT NULL DEFAULT 'manuel',
    state         TEXT,
    fire_count    INTEGER NOT NULL DEFAULT 0,
    last_fired_at INTEGER,
    created_at    TEXT    NOT NULL DEFAULT (datetime('now'))
  );
  CREATE TABLE alarm_events (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    alarm_id    INTEGER REFERENCES alarms(id) ON DELETE CASCADE,
    instrument  TEXT    NOT NULL,
    message     TEXT    NOT NULL,
    value       REAL,
    fired_at    INTEGER NOT NULL
  );
  CREATE INDEX idx_alarm_events_time ON alarm_events (fired_at);

  -- Dış kaynak önbelleği (RSS başlıkları, piyasa duygusu…): yeniden başlatmada kaybolmasın.
  CREATE TABLE ext_cache (
    key         TEXT PRIMARY KEY,
    value       TEXT    NOT NULL,
    fetched_at  INTEGER NOT NULL
  );

  -- Haber taramasında ücretsiz kaynaklar (RSS + KAP) sayesinde yapılmayan ücretli aramalar (tahmini)
  ALTER TABLE news_reports ADD COLUMN free_headlines INTEGER NOT NULL DEFAULT 0;
  ALTER TABLE news_reports ADD COLUMN searches_saved INTEGER NOT NULL DEFAULT 0;

  -- Temettü: brüt tutar ve uygulanan stopaj (amount = net, hesaba geçen)
  ALTER TABLE dividends ADD COLUMN gross_amount REAL;
  ALTER TABLE dividends ADD COLUMN withholding_pct REAL;

  -- Günlük özet (hafta içi akşam; yapay zekalı ya da anahtar yoksa kurallı)
  CREATE TABLE daily_summaries (
    date        TEXT PRIMARY KEY,
    text        TEXT    NOT NULL,
    ai          INTEGER NOT NULL DEFAULT 0,
    model       TEXT,
    cost_usd    REAL    NOT NULL DEFAULT 0,
    data        TEXT,
    created_at  TEXT    NOT NULL DEFAULT (datetime('now'))
  );
  `,
  `
  -- Geliştirme paketi C: birden çok hesap (aracı kurum / banka / kasa), komisyon, pozisyon notu.
  -- Hesaplar: gerçek işlemler, emirler, temettüler ve alarmlar bir hesaba aittir.
  -- include_in_total: toplam portföy değerine dahil mi; fee_pct: varsayılan komisyon oranı (%).
  CREATE TABLE accounts (
    id                INTEGER PRIMARY KEY AUTOINCREMENT,
    name              TEXT    NOT NULL,
    include_in_total  INTEGER NOT NULL DEFAULT 1,
    archived          INTEGER NOT NULL DEFAULT 0,
    fee_pct           REAL    NOT NULL DEFAULT 0 CHECK (fee_pct >= 0 AND fee_pct <= 10),
    sort_order        INTEGER NOT NULL DEFAULT 0,
    created_at        TEXT    NOT NULL DEFAULT (datetime('now'))
  );
  CREATE UNIQUE INDEX idx_accounts_name ON accounts (name COLLATE NOCASE);
  -- Mevcut tüm gerçek kayıtlar varsayılan hesaba taşınır.
  INSERT INTO accounts (id, name) VALUES (1, 'Ana hesap');

  -- Sanal işlemlerde account_id NULL kalır (sanal portföy tek hesaptır).
  -- fee: işlemin komisyonu / ücreti, işlem para biriminde (maliyete ve gerçekleşen K/Z'ye girer).
  ALTER TABLE transactions ADD COLUMN account_id INTEGER REFERENCES accounts(id);
  ALTER TABLE transactions ADD COLUMN fee REAL NOT NULL DEFAULT 0 CHECK (fee >= 0);
  UPDATE transactions SET account_id = 1 WHERE mode = 'real';
  CREATE INDEX idx_transactions_account ON transactions (account_id);

  ALTER TABLE orders ADD COLUMN account_id INTEGER REFERENCES accounts(id);
  UPDATE orders SET account_id = 1 WHERE mode = 'real';

  -- Alarm hesabı: maliyet alarmında hangi hesabın pozisyonu (NULL: tüm hesaplar), diğerlerinde etiket.
  ALTER TABLE alarms ADD COLUMN account_id INTEGER REFERENCES accounts(id);
  UPDATE alarms SET account_id = 1 WHERE mode IS NULL OR mode = 'real';

  -- Temettü: tekillik artık hesap bazında. SQLite kısıt değiştiremediği için tablo yeniden kurulur.
  -- account_id: gerçekte hesap, sanalda 0.
  CREATE TABLE dividends_c (
    id               INTEGER PRIMARY KEY AUTOINCREMENT,
    mode             TEXT    NOT NULL CHECK (mode IN ('real','virtual')),
    account_id       INTEGER NOT NULL DEFAULT 0,
    asset_type       TEXT    NOT NULL,
    symbol           TEXT    NOT NULL,
    ex_date          TEXT    NOT NULL,
    per_share        REAL    NOT NULL CHECK (per_share >= 0),
    quantity         REAL    NOT NULL CHECK (quantity >= 0),
    amount           REAL    NOT NULL CHECK (amount >= 0),
    currency         TEXT    NOT NULL,
    fx_try           REAL,
    status           TEXT    NOT NULL DEFAULT 'confirmed' CHECK (status IN ('confirmed','dismissed')),
    source           TEXT    NOT NULL DEFAULT 'otomatik',
    note             TEXT,
    created_at       TEXT    NOT NULL DEFAULT (datetime('now')),
    gross_amount     REAL,
    withholding_pct  REAL,
    UNIQUE (mode, account_id, asset_type, symbol, ex_date)
  );
  INSERT INTO dividends_c (id, mode, account_id, asset_type, symbol, ex_date, per_share, quantity, amount, currency, fx_try,
      status, source, note, created_at, gross_amount, withholding_pct)
    SELECT id, mode, CASE WHEN mode = 'real' THEN 1 ELSE 0 END, asset_type, symbol, ex_date, per_share, quantity, amount, currency, fx_try,
      status, source, note, created_at, gross_amount, withholding_pct FROM dividends;
  DROP TABLE dividends;
  ALTER TABLE dividends_c RENAME TO dividends;

  -- Pozisyon notu: neden aldım, ne olursa satarım, hedef ve stop fiyatı (varlığın fiyat biriminde).
  CREATE TABLE position_notes (
    mode          TEXT NOT NULL CHECK (mode IN ('real','virtual')),
    asset_type    TEXT NOT NULL,
    symbol        TEXT NOT NULL,
    why           TEXT,
    exit_plan     TEXT,
    target_price  REAL CHECK (target_price IS NULL OR target_price > 0),
    stop_price    REAL CHECK (stop_price IS NULL OR stop_price > 0),
    updated_at    TEXT NOT NULL DEFAULT (datetime('now')),
    PRIMARY KEY (mode, asset_type, symbol)
  );
  `,
  `
  -- Bulut modu nöbeti (dış zamanlayıcı /api/cron/tick): görev kilitleri ve son çalışma zamanları (ms).
  -- locked_until: görev bu zamana kadar başka bir çağrıda çalıştırılmaz (atomik UPDATE … RETURNING ile alınır).
  CREATE TABLE task_leases (
    name              TEXT PRIMARY KEY,
    locked_until      INTEGER NOT NULL DEFAULT 0,
    last_run_at       INTEGER,
    last_ok_at        INTEGER,
    last_error        TEXT,
    last_duration_ms  INTEGER
  );
  -- Her nöbet çağrısı (son 500 tutulur): ne zaman, kim çağırdı, hangi görevler çalıştı.
  CREATE TABLE tick_runs (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    started_at   INTEGER NOT NULL,
    finished_at  INTEGER,
    source       TEXT,
    tasks        TEXT,
    error        TEXT
  );
  CREATE INDEX idx_tick_runs_started ON tick_runs (started_at);
  `,
];
