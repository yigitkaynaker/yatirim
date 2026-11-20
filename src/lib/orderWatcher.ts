import "server-only";
import { checkPendingOrders } from "./orders";
import { maybeRecordSnapshots } from "./snapshots";

// Sunucu çalıştığı sürece bekleyen emirleri ~30 sn'de bir kontrol eder,
// günlük portföy değeri anlık görüntüsünü (gerçek / sanal) kaydeder ve
// zamanı gelen otomatik haber taramasını başlatır.
// instrumentation.ts'den bir kez başlatılır; dev modda çift başlatmaya karşı
// globalThis üzerinde korunur.

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
    const r = await checkPendingOrders();
    if (r.executed > 0) console.log(`[emirler] ${r.executed} emir gerçekleşti`);
  } catch (err) {
    console.error("[emirler] kontrol hatası", err);
  }
  try {
    await maybeRecordSnapshots();
  } catch (err) {
    console.error("[anlık görüntü] hata", err);
  } finally {
    if (s) s.running = false;
  }
}

export function startOrderWatcher() {
  if (g.__yatirimOrderWatcher) return;
  const timer = setInterval(() => {
    void runOrderCheck();
    void runScheduledNews();
  }, ORDER_CHECK_MS);
  timer.unref?.();
  g.__yatirimOrderWatcher = { timer, running: false };
  setTimeout(() => void runOrderCheck(), 5_000).unref?.();
  console.log("[emirler] izleyici başlatıldı");
}

/** Zamanlanmış haber taraması (uzun sürer; emir kontrolünü bekletmesin diye ayrı). */
async function runScheduledNews() {
  try {
    const { maybeRunScheduledScan } = await import("./news");
    await maybeRunScheduledScan();
  } catch (err) {
    console.error("[haber] zamanlayıcı hatası", err);
  }
}
