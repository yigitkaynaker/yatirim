import "server-only";
import { checkPendingOrders } from "./orders";
import { maybeRecordSnapshots } from "./snapshots";
import { markLocalTick } from "./cron/runner";
import { forEachUser } from "./users";

// Sunucu çalıştığı sürece bekleyen emirleri ~30 sn'de bir kontrol eder,
// günlük portföy değeri anlık görüntüsünü (gerçek / sanal) kaydeder ve
// zamanı gelen otomatik haber taramasını ve günlük teknik sinyal kontrolünü başlatır.
// Kullanıcıya ait görevler her kullanıcı için ayrı, o kullanıcının bağlamında çalışır (forEachUser).
// instrumentation.ts'den bir kez başlatılır; dev modda çift başlatmaya karşı
// globalThis üzerinde korunur. YALNIZCA yerel mod: bulut modunda (DATABASE_URL) aynı görevleri
// dış zamanlayıcının çağırdığı /api/cron/tick çalıştırır (cron/runner.ts).

export const ORDER_CHECK_MS = 30_000;

interface WatcherState {
  timer: ReturnType<typeof setInterval>;
  running: boolean;
}

const g = globalThis as unknown as { __yatirimOrderWatcher?: WatcherState };

/** Tek bir kontrol turu; çakışan turlar atlanır. */
export async function runOrderCheck() {
  const s = g.__yatirimOrderWatcher;
  if (s?.running) return;
  if (s) s.running = true;
  try {
    const r = await forEachUser("emirler", () => checkPendingOrders());
    const executed = r.reduce((a, b) => a + b.executed, 0);
    if (executed > 0) console.log(`[emirler] ${executed} emir gerçekleşti`);
  } catch (err) {
    console.error("[emirler] kontrol hatası", err);
  }
  try {
    await forEachUser("anlık görüntü", () => maybeRecordSnapshots());
  } catch (err) {
    console.error("[anlık görüntü] hata", err);
  } finally {
    if (s) s.running = false;
  }
}

export function startOrderWatcher() {
  if (g.__yatirimOrderWatcher) return;
  const timer = setInterval(() => {
    markLocalTick();
    void runOrderCheck();
    void runScheduledNews();
    void runSignalAlerts();
    void runKapPoll();
    void runAlarms();
    void runDailySummary();
    void runDailyBackup();
    void runCatalogRefresh();
  }, ORDER_CHECK_MS);
  timer.unref?.();
  g.__yatirimOrderWatcher = { timer, running: false };
  setTimeout(() => {
    markLocalTick();
    void runOrderCheck();
  }, 5_000).unref?.();
  console.log("[emirler] izleyici başlatıldı");
}

/** Zamanlanmış haber taraması (uzun sürer; emir kontrolünü bekletmesin diye ayrı). */
async function runScheduledNews() {
  try {
    const { maybeRunScheduledScan } = await import("./news");
    await forEachUser("haber", () => maybeRunScheduledScan());
  } catch (err) {
    console.error("[haber] zamanlayıcı hatası", err);
  }
}

/** Günlük teknik sinyal kontrolü (günde bir kez; çift çalışma technical.ts içinde engellenir). */
async function runSignalAlerts() {
  try {
    const { maybeRunSignalAlerts } = await import("./technical");
    await forEachUser("teknik", () => maybeRunSignalAlerts());
  } catch (err) {
    console.error("[teknik] zamanlayıcı hatası", err);
  }
}

/** Alarmlar: fiyat/değişim/maliyet her turda, hacim/sinyal 15 dk'da bir (alarms.ts). */
async function runAlarms() {
  try {
    const { checkAlarms } = await import("./alarms");
    const r = await forEachUser("alarm", () => checkAlarms());
    const fired = r.reduce((a, b) => a + b.fired, 0);
    if (fired > 0) console.log(`[alarm] ${fired} alarm çaldı`);
  } catch (err) {
    console.error("[alarm] kontrol hatası", err);
  }
}

/** Günlük veritabanı yedeği (günde bir, son 14 tutulur; backup.ts). Gün içinde bir kez dizin okunur. */
const gb = globalThis as unknown as { __yatirimBackupDay?: string };
async function runDailyBackup() {
  const day = new Date().toLocaleDateString("en-CA", { timeZone: "Europe/Istanbul" });
  if (gb.__yatirimBackupDay === day) return;
  try {
    const { maybeDailyBackup } = await import("./backup");
    await maybeDailyBackup();
    gb.__yatirimBackupDay = day;
  } catch (err) {
    console.error("[yedek] zamanlayıcı hatası", err);
  }
}

/** Sembol kataloğu (kripto pariteleri, hisse listeleri): günde bir; saatte bir kontrol edilir (catalog.ts). */
const gk = globalThis as unknown as { __yatirimCatalogCheck?: number };
async function runCatalogRefresh() {
  if (Date.now() - (gk.__yatirimCatalogCheck ?? 0) < 3600_000) return;
  gk.__yatirimCatalogCheck = Date.now();
  try {
    const { maybeRefreshCatalog } = await import("./catalog");
    const r = await maybeRefreshCatalog();
    if (r) console.log(`[katalog] yenilendi: Binance ${r.binance}, BtcTurk ${r.btcturk}, toplam ${r.total}`);
  } catch (err) {
    console.error("[katalog] zamanlayıcı hatası", err);
  }
}

/** Günlük özet: hafta içi 18:45 (İstanbul) sonrasında bir kez (dailySummary.ts). */
async function runDailySummary() {
  try {
    const { maybeRunDailySummary } = await import("./dailySummary");
    await forEachUser("özet", () => maybeRunDailySummary());
  } catch (err) {
    console.error("[özet] zamanlayıcı hatası", err);
  }
}

/** KAP bildirimleri: hafta içi 08–22 (İstanbul), en fazla 10 dk'da bir (zamanlama kap.ts içinde). */
async function runKapPoll() {
  try {
    const { maybePollKap } = await import("./kap");
    await maybePollKap();
  } catch (err) {
    console.error("[kap] zamanlayıcı hatası", err);
  }
}
