// Alarm tetikleme mantığı (saf, testli). Sunucu servisi alarms.ts bunu kullanır.
//
// Kural: koşul sağlanınca alarm "çalar" ve o varlık için kurulu (armed) olmaktan çıkar.
// Koşul yeniden bozulunca tekrar kurulur. Böylece fiyat eşiğin üstünde durdukça her
// turda bildirim gelmez. "her seferinde" alarmlarda ayrıca bekleme süresi (cooldown)
// uygulanır: koşul tekrar sağlansa bile son çalmadan bu kadar dakika geçmeden çalmaz
// (koşul sürüyorsa süre dolunca çalar). "tek sefer" alarm çalınca kapanır.
// Teknik sinyal alarmında koşul "sinyal son kayıttan farklı" demektir; ilk görülen
// sinyal yalnızca kaydedilir.

export type AlarmKind = "price" | "day_change" | "cost_change" | "volume_spike" | "signal_change";
export type AlarmDirection = "up" | "down" | "both";
export type AlarmRepeat = "once" | "every";

export interface AlarmRule {
  kind: AlarmKind;
  direction: AlarmDirection;
  /** price: fiyat; day_change / cost_change: yüzde (pozitif); volume_spike: kat (örn. 2) */
  threshold: number | null;
  repeat: AlarmRepeat;
  cooldownMin: number;
}

/** Bir varlık için son durum */
export interface InstrumentState {
  /** false: çaldı, koşul bozulana kadar tekrar çalmaz */
  armed: boolean;
  lastFiredAt: number | null;
  /** signal_change: son kaydedilen sinyal etiketi */
  label?: string | null;
}

export type AlarmState = Record<string, InstrumentState>;

/** Bir turdaki gözlem: türüne göre değer */
export interface Observation {
  /** price: fiyat; day_change / cost_change: yüzde; volume_spike: oran */
  value?: number | null;
  /** signal_change: güncel sinyal etiketi */
  label?: string | null;
}

export interface Evaluation {
  fire: boolean;
  next: InstrumentState;
  /** signal_change: önceki etiket (bildirim metni için) */
  fromLabel?: string | null;
}

export function conditionMet(rule: AlarmRule, value: number): boolean {
  const t = rule.threshold ?? 0;
  switch (rule.kind) {
    case "price":
      return rule.direction === "down" ? value <= t : value >= t;
    case "day_change":
    case "cost_change":
      if (rule.direction === "up") return value >= t;
      if (rule.direction === "down") return value <= -t;
      return Math.abs(value) >= t;
    case "volume_spike":
      return value >= t;
    default:
      return false;
  }
}

function cooledDown(rule: AlarmRule, prev: InstrumentState | undefined, now: number): boolean {
  if (!prev?.lastFiredAt) return true;
  return now - prev.lastFiredAt >= rule.cooldownMin * 60_000;
}

/** Tek varlık için bu turun sonucu. Gözlem yoksa (veri alınamadı) durum değişmez. */
export function evaluateAlarm(rule: AlarmRule, prev: InstrumentState | undefined, obs: Observation, now: number): Evaluation {
  const base: InstrumentState = prev ?? { armed: true, lastFiredAt: null };

  if (rule.kind === "signal_change") {
    const label = obs.label ?? null;
    if (!label) return { fire: false, next: base };
    if (!base.label) return { fire: false, next: { ...base, armed: true, label } }; // ilk kayıt
    if (label === base.label) return { fire: false, next: base };
    // Değişti: bekleme süresi dolmadıysa kaydı güncelleme (süre dolunca çalsın)
    if (!cooledDown(rule, prev, now)) return { fire: false, next: base };
    return { fire: true, next: { armed: true, lastFiredAt: now, label }, fromLabel: base.label };
  }

  const v = obs.value;
  if (v == null || !Number.isFinite(v)) return { fire: false, next: base };
  if (!conditionMet(rule, v)) return { fire: false, next: { ...base, armed: true } };
  if (!base.armed) return { fire: false, next: base };
  if (!cooledDown(rule, prev, now)) return { fire: false, next: base };
  return { fire: true, next: { ...base, armed: false, lastFiredAt: now } };
}

/** Kullanıcıya gösterilecek kısa koşul metni */
export function describeRule(rule: AlarmRule, opts: { name: string; currency?: string | null; mode?: "real" | "virtual" | null }): string {
  const t = rule.threshold ?? 0;
  const pct = `%${t.toLocaleString("tr-TR", { maximumFractionDigits: 2 })}`;
  const dirWord = rule.direction === "up" ? "yükselirse" : rule.direction === "down" ? "düşerse" : "hareket ederse (iki yön)";
  switch (rule.kind) {
    case "price":
      return `${opts.name} ${t.toLocaleString("tr-TR", { maximumFractionDigits: 6 })}${opts.currency ? ` ${opts.currency}` : ""} ${rule.direction === "down" ? "altına inerse" : "üstüne çıkarsa"}`;
    case "day_change":
      return `${opts.name} bir günde ${pct} ${dirWord}`;
    case "cost_change":
      return `${opts.name} ${opts.mode === "virtual" ? "sanal" : "gerçek"} maliyetime göre ${pct} ${rule.direction === "up" ? "kâra geçerse" : rule.direction === "down" ? "zarara geçerse" : "kâr ya da zarara ulaşırsa"}`;
    case "volume_spike":
      return `${opts.name} işlem hacmi 20 günlük ortalamanın ${t.toLocaleString("tr-TR", { maximumFractionDigits: 1 })} katına çıkarsa`;
    case "signal_change":
      return `${opts.name} teknik sinyali değişirse`;
  }
}
