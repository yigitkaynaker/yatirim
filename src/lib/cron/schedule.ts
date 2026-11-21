// Bulut modu nöbet zamanlaması (saf fonksiyonlar; veritabanına dokunmaz).
//
// Seçilen sıklık: hafta içi 09:30–18:30 (İstanbul) her dakika, diğer zamanlarda 30 dakikada bir.
// Dış zamanlayıcı (cron-job.org) 7/24 her dakika çağırır; uygulama pencere dışında çağrıyı
// VERİTABANINA DOKUNMADAN geri çevirir, yalnızca :00 ve :30 dilimlerinde (birkaç dakikalık
// hoşgörüyle) çalışır. Böylece Neon gece ve hafta sonu uykuya geçebilir (5 dk boşta kalınca).
//
// Neden dakika dilimi + bellek koruması: dakikayı saate göre hesaplamak hiçbir durum
// gerektirmez (her sunucu örneği aynı kararı verir). Hoşgörü (0, 1, 2. dakikalar) gecikmeli
// ya da kaçan bir çağrıyı telafi eder; aynı örnek aynı dilimde ikinci kez çalışmasın diye
// bellekte son dış-saat çalışması tutulur. Farklı bir örnek aynı dilimde yine çalışabilir;
// o durumda da görev kilitleri (task_leases, en az aralık) işi tekrar yaptırmaz ve Neon zaten
// uyanıktır, ek maliyet yoktur.

export interface IstanbulClock {
  /** YYYY-MM-DD */
  date: string;
  /** Mon … Sun */
  weekday: string;
  /** Gece yarısından beri dakika */
  minutes: number;
  /** Saatin dakikası (0–59) */
  minute: number;
}

export function istanbulClock(ms: number): IstanbulClock {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/Istanbul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    weekday: "short",
    hourCycle: "h23",
  }).formatToParts(new Date(ms));
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  const hour = Number(get("hour"));
  const minute = Number(get("minute"));
  return { date: `${get("year")}-${get("month")}-${get("day")}`, weekday: get("weekday"), minutes: hour * 60 + minute, minute };
}

export const isWeekday = (c: IstanbulClock) => c.weekday !== "Sat" && c.weekday !== "Sun";

/** Sık nöbet penceresi: hafta içi 09:30–18:30 (İstanbul, iki uç dahil) */
export const FAST_START_MIN = 9 * 60 + 30;
export const FAST_END_MIN = 18 * 60 + 30;
/** Pencere dışında çalışma aralığı ve dilim hoşgörüsü (dakika) */
export const SLOW_EVERY_MIN = 30;
export const SLOT_TOLERANCE_MIN = 2;

export function inFastWindow(ms: number): boolean {
  const c = istanbulClock(ms);
  return isWeekday(c) && c.minutes >= FAST_START_MIN && c.minutes <= FAST_END_MIN;
}

export type GateDecision = { run: true; window: "fast" | "slow" } | { run: false; window: "slow"; reason: string };

/**
 * Bu nöbet çağrısı çalışmalı mı? Veritabanına dokunmaz.
 * lastSlowRunAt: bu sunucu örneğinde son dış-saat çalışmasının zamanı (bellek).
 */
export function tickGate(ms: number, opts: { force?: boolean; lastSlowRunAt?: number | null } = {}): GateDecision {
  if (opts.force) return { run: true, window: inFastWindow(ms) ? "fast" : "slow" };
  if (inFastWindow(ms)) return { run: true, window: "fast" };
  const { minute } = istanbulClock(ms);
  if (minute % SLOW_EVERY_MIN > SLOT_TOLERANCE_MIN) return { run: false, window: "slow", reason: "pencere dışı (30 dk'lık dilim değil)" };
  if (opts.lastSlowRunAt != null && ms - opts.lastSlowRunAt < (SLOW_EVERY_MIN - SLOT_TOLERANCE_MIN - 1) * 60_000) {
    return { run: false, window: "slow", reason: "bu dilim bu örnekte zaten çalıştı" };
  }
  return { run: true, window: "slow" };
}

/** Son nöbetin en fazla ne kadar eski olması beklenir (Ayarlar'daki uyarı için) */
export function expectedMaxGapMs(ms: number): number {
  // Pencere içinde dakikalık; dışında 30 dk + hoşgörü. Geçişlerde (09:30'dan hemen sonra) önceki
  // dış-saat çalışmasından bu yana 30 dk'dan fazla geçmiş olabilir; bu yüzden ilk dakikalarda geniş tutulur.
  const c = istanbulClock(ms);
  if (inFastWindow(ms) && c.minutes - FAST_START_MIN >= 5) return 5 * 60_000;
  return (SLOW_EVERY_MIN + SLOT_TOLERANCE_MIN + 10) * 60_000;
}
