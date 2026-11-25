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
  `
  -- Giriş kaba kuvvet koruması: istemci adresi (IP) başına hatalı deneme sayısı (zamanla azalır).
  -- Veritabanında tutulur ki bulutta (her istek ayrı örnekte çalışabilir) da geçerli olsun.
  CREATE TABLE login_failures (
    ip       TEXT PRIMARY KEY,
    count    INTEGER NOT NULL,
    last_at  INTEGER NOT NULL
  );
  CREATE INDEX idx_login_failures_last ON login_failures (last_at);
  `,
  `
  -- Yapay zeka kullanımının sağlayıcısı (anthropic / openai)
  ALTER TABLE ai_usage ADD COLUMN provider TEXT NOT NULL DEFAULT 'anthropic';

  -- ChatGPT / Claude.ai bağlayıcısı (MCP) için tek kullanıcılı OAuth 2.1 sunucusu.
  -- İstemciler dinamik kayıtla (DCR) eklenir; gizli anahtar varsa yalnızca SHA-256 özeti tutulur.
  CREATE TABLE oauth_clients (
    id                  TEXT PRIMARY KEY,
    name                TEXT,
    redirect_uris       TEXT    NOT NULL,
    secret_hash         TEXT,
    created_at          INTEGER NOT NULL
  );
  -- Yetki kodları: kısa ömürlü, tek kullanımlık (used_at), PKCE S256 meydan okumasıyla.
  CREATE TABLE oauth_codes (
    code_hash           TEXT PRIMARY KEY,
    client_id           TEXT    NOT NULL,
    redirect_uri        TEXT    NOT NULL,
    code_challenge      TEXT    NOT NULL,
    resource            TEXT    NOT NULL,
    scope               TEXT,
    expires_at          INTEGER NOT NULL,
    used_at             INTEGER
  );
  -- Erişim / yenileme / statik belirteçler: yalnızca SHA-256 özeti saklanır.
  -- resource: belirtecin geçerli olduğu MCP adresi (statikte '*').
  CREATE TABLE oauth_tokens (
    token_hash          TEXT PRIMARY KEY,
    kind                TEXT    NOT NULL CHECK (kind IN ('access','refresh','static')),
    client_id           TEXT,
    resource            TEXT    NOT NULL,
    scope               TEXT,
    expires_at          INTEGER,
    created_at          INTEGER NOT NULL,
    last_used_at        INTEGER,
    revoked_at          INTEGER
  );
  CREATE INDEX idx_oauth_tokens_client ON oauth_tokens (client_id);
  -- MCP araç çağrıları günlüğü ("Son ChatGPT işlemleri")
  CREATE TABLE mcp_calls (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    client      TEXT,
    tool        TEXT    NOT NULL,
    input       TEXT,
    ok          INTEGER NOT NULL,
    is_write    INTEGER NOT NULL,
    summary     TEXT,
    created_at  INTEGER NOT NULL
  );
  CREATE INDEX idx_mcp_calls_created ON mcp_calls (created_at);
  `,
  `
  -- Çok kullanıcılı mod: kullanıcılar ve kullanıcıya ait tüm tablolarda user_id.
  -- Mevcut tüm veri sahibe (id 1) atanır. Sahip e-postasızdır; APP_PASSWORD ile girer ve
  -- isterse Ayarlar'dan e-posta + şifre tanımlar. user_id varsayılanı 0'dır (hiçbir kullanıcı):
  -- kimliksiz eklenen satır kimseye görünmez. Ayarlarda user_id 0 sunucu geneli anahtarlardır (VAPID, KAP).
  -- Paylaşılan önbellekler (fiyat, fon, temettü geçmişi, KAP, dış kaynak) ve nöbet tabloları kullanıcısızdır.
  CREATE TABLE users (
    id             INTEGER PRIMARY KEY AUTOINCREMENT,
    email          TEXT UNIQUE,
    password_hash  TEXT,
    created_at     TEXT NOT NULL DEFAULT (datetime('now'))
  );
  INSERT INTO users (id, email) VALUES (1, NULL);
  ALTER TABLE transactions ADD COLUMN user_id INTEGER NOT NULL DEFAULT 0;
  UPDATE transactions SET user_id = 1;
  ALTER TABLE orders ADD COLUMN user_id INTEGER NOT NULL DEFAULT 0;
  UPDATE orders SET user_id = 1;
  ALTER TABLE notifications ADD COLUMN user_id INTEGER NOT NULL DEFAULT 0;
  UPDATE notifications SET user_id = 1;
  ALTER TABLE ai_usage ADD COLUMN user_id INTEGER NOT NULL DEFAULT 0;
  UPDATE ai_usage SET user_id = 1;
  ALTER TABLE chat_conversations ADD COLUMN user_id INTEGER NOT NULL DEFAULT 0;
  UPDATE chat_conversations SET user_id = 1;
  ALTER TABLE chat_messages ADD COLUMN user_id INTEGER NOT NULL DEFAULT 0;
  UPDATE chat_messages SET user_id = 1;
  ALTER TABLE news_reports ADD COLUMN user_id INTEGER NOT NULL DEFAULT 0;
  UPDATE news_reports SET user_id = 1;
  ALTER TABLE push_subscriptions ADD COLUMN user_id INTEGER NOT NULL DEFAULT 0;
  UPDATE push_subscriptions SET user_id = 1;
  ALTER TABLE alarms ADD COLUMN user_id INTEGER NOT NULL DEFAULT 0;
  UPDATE alarms SET user_id = 1;
  ALTER TABLE alarm_events ADD COLUMN user_id INTEGER NOT NULL DEFAULT 0;
  UPDATE alarm_events SET user_id = 1;
  ALTER TABLE accounts ADD COLUMN user_id INTEGER NOT NULL DEFAULT 0;
  UPDATE accounts SET user_id = 1;
  ALTER TABLE oauth_codes ADD COLUMN user_id INTEGER NOT NULL DEFAULT 0;
  UPDATE oauth_codes SET user_id = 1;
  ALTER TABLE oauth_tokens ADD COLUMN user_id INTEGER NOT NULL DEFAULT 0;
  UPDATE oauth_tokens SET user_id = 1;
  ALTER TABLE mcp_calls ADD COLUMN user_id INTEGER NOT NULL DEFAULT 0;
  UPDATE mcp_calls SET user_id = 1;
  CREATE INDEX idx_transactions_user ON transactions (user_id, mode);
  CREATE INDEX idx_orders_user ON orders (user_id, status);
  CREATE INDEX idx_notifications_user ON notifications (user_id, id);
  CREATE INDEX idx_ai_usage_user ON ai_usage (user_id, created_at);
  CREATE INDEX idx_chat_conversations_user ON chat_conversations (user_id);
  CREATE INDEX idx_news_reports_user ON news_reports (user_id, id);
  CREATE INDEX idx_push_subscriptions_user ON push_subscriptions (user_id);
  CREATE INDEX idx_alarms_user ON alarms (user_id);
  CREATE INDEX idx_alarm_events_user ON alarm_events (user_id, fired_at);
  CREATE INDEX idx_oauth_tokens_user ON oauth_tokens (user_id);
  CREATE INDEX idx_mcp_calls_user ON mcp_calls (user_id, created_at);
  DROP INDEX idx_accounts_name;
  CREATE UNIQUE INDEX idx_accounts_name ON accounts (user_id, name COLLATE NOCASE);

  -- Birincil anahtarı / tekilliği kullanıcıyı içermesi gereken tablolar yeniden kurulur.
  CREATE TABLE settings_u (
    user_id     INTEGER NOT NULL DEFAULT 0,
    key         TEXT NOT NULL,
    value       TEXT NOT NULL,
    updated_at  TEXT NOT NULL DEFAULT (datetime('now')),
    PRIMARY KEY (user_id, key)
  );
  INSERT INTO settings_u (user_id, key, value, updated_at)
    SELECT CASE WHEN key IN ('vapid_public_key', 'vapid_private_key', 'kap_last_ok') THEN 0 ELSE 1 END, key, value, updated_at FROM settings;
  DROP TABLE settings;
  ALTER TABLE settings_u RENAME TO settings;

  CREATE TABLE watchlist_u (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id     INTEGER NOT NULL DEFAULT 0,
    asset_type  TEXT    NOT NULL,
    symbol      TEXT    NOT NULL,
    name        TEXT,
    created_at  TEXT    NOT NULL DEFAULT (datetime('now')),
    UNIQUE (user_id, asset_type, symbol)
  );
  INSERT INTO watchlist_u (id, user_id, asset_type, symbol, name, created_at) SELECT id, 1, asset_type, symbol, name, created_at FROM watchlist;
  DROP TABLE watchlist;
  ALTER TABLE watchlist_u RENAME TO watchlist;

  CREATE TABLE portfolio_snapshots_u (
    user_id     INTEGER NOT NULL DEFAULT 0,
    date        TEXT    NOT NULL,
    mode        TEXT    NOT NULL CHECK (mode IN ('real','virtual')),
    value_try   REAL    NOT NULL,
    cost_try    REAL    NOT NULL,
    updated_at  INTEGER NOT NULL,
    PRIMARY KEY (user_id, date, mode)
  );
  INSERT INTO portfolio_snapshots_u SELECT 1, date, mode, value_try, cost_try, updated_at FROM portfolio_snapshots;
  DROP TABLE portfolio_snapshots;
  ALTER TABLE portfolio_snapshots_u RENAME TO portfolio_snapshots;

  CREATE TABLE technical_signals_u (
    user_id       INTEGER NOT NULL DEFAULT 0,
    instrument    TEXT    NOT NULL,
    label         TEXT    NOT NULL,
    score         INTEGER NOT NULL,
    checked_date  TEXT    NOT NULL,
    updated_at    TEXT    NOT NULL DEFAULT (datetime('now')),
    PRIMARY KEY (user_id, instrument)
  );
  INSERT INTO technical_signals_u SELECT 1, instrument, label, score, checked_date, updated_at FROM technical_signals;
  DROP TABLE technical_signals;
  ALTER TABLE technical_signals_u RENAME TO technical_signals;

  CREATE TABLE daily_summaries_u (
    user_id     INTEGER NOT NULL DEFAULT 0,
    date        TEXT    NOT NULL,
    text        TEXT    NOT NULL,
    ai          INTEGER NOT NULL DEFAULT 0,
    model       TEXT,
    cost_usd    REAL    NOT NULL DEFAULT 0,
    data        TEXT,
    created_at  TEXT    NOT NULL DEFAULT (datetime('now')),
    PRIMARY KEY (user_id, date)
  );
  INSERT INTO daily_summaries_u SELECT 1, date, text, ai, model, cost_usd, data, created_at FROM daily_summaries;
  DROP TABLE daily_summaries;
  ALTER TABLE daily_summaries_u RENAME TO daily_summaries;

  CREATE TABLE position_notes_u (
    user_id       INTEGER NOT NULL DEFAULT 0,
    mode          TEXT NOT NULL CHECK (mode IN ('real','virtual')),
    asset_type    TEXT NOT NULL,
    symbol        TEXT NOT NULL,
    why           TEXT,
    exit_plan     TEXT,
    target_price  REAL CHECK (target_price IS NULL OR target_price > 0),
    stop_price    REAL CHECK (stop_price IS NULL OR stop_price > 0),
    updated_at    TEXT NOT NULL DEFAULT (datetime('now')),
    PRIMARY KEY (user_id, mode, asset_type, symbol)
  );
  INSERT INTO position_notes_u SELECT 1, mode, asset_type, symbol, why, exit_plan, target_price, stop_price, updated_at FROM position_notes;
  DROP TABLE position_notes;
  ALTER TABLE position_notes_u RENAME TO position_notes;

  CREATE TABLE dividends_u (
    id               INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id          INTEGER NOT NULL DEFAULT 0,
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
    UNIQUE (user_id, mode, account_id, asset_type, symbol, ex_date)
  );
  INSERT INTO dividends_u (id, user_id, mode, account_id, asset_type, symbol, ex_date, per_share, quantity, amount, currency, fx_try,
      status, source, note, created_at, gross_amount, withholding_pct)
    SELECT id, 1, mode, account_id, asset_type, symbol, ex_date, per_share, quantity, amount, currency, fx_try,
      status, source, note, created_at, gross_amount, withholding_pct FROM dividends;
  DROP TABLE dividends;
  ALTER TABLE dividends_u RENAME TO dividends;
  CREATE INDEX idx_dividends_user ON dividends (user_id);
  `,
];
