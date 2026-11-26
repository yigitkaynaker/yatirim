import "server-only";
import { getDb, isCloud, type Db } from "../db";
import { checkPendingOrders } from "../orders";
import { maybeRecordSnapshots } from "../snapshots";
import { forEachUser } from "../users";
import { expectedMaxGapMs, inFastWindow, istanbulClock, isWeekday, type IstanbulClock } from "./schedule";

// Görev çalıştırıcı (bulut modu nöbeti). Dış zamanlayıcı /api/cron/tick'i çağırır; burada
// zamanı gelen görevler, veritabanındaki kilitlerle (task_leases) tam bir kez çalıştırılır:
//   UPDATE task_leases SET locked_until = …, last_run_at = … WHERE name = ? AND locked_until <= şimdi
//     AND (last_run_at IS NULL OR last_run_at <= şimdi − en az aralık) RETURNING name
// Bu ifade atomiktir: eşzamanlı iki nöbet çağrısından yalnızca biri görevi alır (Postgres'te satır
// kilidi, SQLite'ta yazma kilidi). Bellekteki durum (Map/globalThis) sunucusuz ortamda örnek
// başınadır; önemli olan her şey (son çalışma, kilit, alarm bekleme süresi) veritabanındadır.
// Uzun süren işler (yapay zeka taraması, günlük özet, sinyal kontrolü) "yavaş" görevdir ve
// /api/cron/slow'da ayrı bir işlev çağrısında çalışır (nöbet yanıtı 25 sn'nin altında kalsın).
// Yerel modda bu dosya kullanılmaz: orderWatcher.ts'deki süreç içi döngü aynen çalışır.
// Kilitler görev başınadır (kullanıcı başına değil); görev her kullanıcı için ayrı, o kullanıcının
// bağlamında çalışır (forEachUser). KAP çekme paylaşımlıdır, bildirim kullanıcı başınadır (kap.ts).

const sum = <T>(list: T[], f: (x: T) => number) => list.reduce((a, x) => a + f(x), 0);

export interface TaskDef {
  name: string;
  /** İki çalışma arasındaki en az süre (sn) */
  minIntervalSec: number;
  /** Kilit süresi (sn): bu süre içinde başka bir çağrı görevi alamaz (çökme durumunda da açılır) */
  leaseSec: number;
  /** Yavaş görev: /api/cron/slow'da çalışır */
  slow?: boolean;
  /** Etkin pencere (İstanbul saatiyle); verilmezse her zaman */
  active?: (c: IstanbulClock) => boolean;
  /** Bilgi metni (Ayarlar'da) */
  label: string;
  run: () => Promise<unknown>;
}

export const TASKS: TaskDef[] = [
  {
    name: "emirler",
    label: "Bekleyen emirler",
    minIntervalSec: 50,
    leaseSec: 120,
    run: async () => {
      const r = await forEachUser("emirler", () => checkPendingOrders());
      const executed = sum(r, (x) => x.executed);
      return executed > 0 ? `${executed} emir gerçekleşti` : `${sum(r, (x) => x.checked)} emir kontrol edildi`;
    },
  },
  {
    name: "alarm",
    label: "Fiyat / değişim / maliyet alarmları",
    minIntervalSec: 50,
    leaseSec: 120,
    run: async () => {
      const { checkAlarms } = await import("../alarms");
      const r = await forEachUser("alarm", () => checkAlarms({ skipSlow: true }));
      return `${sum(r, (x) => x.checked)} alarm, ${sum(r, (x) => x.fired)} çaldı`;
    },
  },
  {
    name: "alarm_yavas",
    label: "Hacim / sinyal alarmları",
    minIntervalSec: 15 * 60,
    leaseSec: 180,
    run: async () => {
      const { checkAlarms } = await import("../alarms");
      const r = await forEachUser("alarm", () => checkAlarms({ forceSlow: true }));
      return `${sum(r, (x) => x.checked)} alarm, ${sum(r, (x) => x.fired)} çaldı`;
    },
  },
  {
    name: "anlik_goruntu",
    label: "Günlük portföy değeri",
    minIntervalSec: 10 * 60,
    leaseSec: 120,
    run: async () => {
      await forEachUser("anlık görüntü", () => maybeRecordSnapshots(true));
      return "tamam";
    },
  },
  {
    name: "kap",
    label: "KAP bildirimleri",
    minIntervalSec: 10 * 60,
    leaseSec: 120,
    active: (c) => isWeekday(c) && c.minutes >= 8 * 60 && c.minutes < 22 * 60,
    run: async () => {
      const { maybePollKap } = await import("../kap");
      const r = await maybePollKap();
      return r ? `${r.stored} yeni, ${r.notified} bildirim` : "atlandı";
    },
  },
  {
    name: "haber",
    label: "Zamanlanmış haber analizi",
    slow: true,
    minIntervalSec: 2 * 60,
    leaseSec: 300,
    run: async () => {
      const { maybeRunScheduledScan } = await import("../news");
      const r = await forEachUser("haber", () => maybeRunScheduledScan());
      return `${r.filter((x) => x.ran).length} kullanıcı için tarama`;
    },
  },
  {
    name: "ozet",
    label: "Günlük özet",
    slow: true,
    minIntervalSec: 5 * 60,
    leaseSec: 300,
    active: (c) => isWeekday(c) && c.minutes >= 18 * 60 + 45,
    run: async () => {
      const { maybeRunDailySummary } = await import("../dailySummary");
      const r = await forEachUser("özet", () => maybeRunDailySummary());
      return `${r.filter((x) => x.ran).length} kullanıcı için özet`;
    },
  },
  {
    name: "sinyal",
    label: "Günlük teknik sinyal kontrolü",
    slow: true,
    minIntervalSec: 30 * 60,
    leaseSec: 300,
    run: async () => {
      const { maybeRunSignalAlerts } = await import("../technical");
      const r = await forEachUser("teknik", () => maybeRunSignalAlerts());
      const ran = r.filter((x) => x.ran);
      return ran.length ? `${ran.length} kullanıcı, ${sum(ran, (x) => (x.ran ? x.changes.length : 0))} değişim` : (r[0]?.ran === false ? r[0].reason : "atlandı");
    },
  },
  {
    name: "katalog",
    label: "Sembol kataloğu (kripto pariteleri, hisse/ETF listeleri, TEFAS fonları)",
    slow: true,
    minIntervalSec: 6 * 3600,
    leaseSec: 300,
    run: async () => {
      // Paylaşımlı (kullanıcıya özel değil); 24 saatten eskiyse yenilenir
      const { maybeRefreshCatalog, refreshSummary } = await import("../catalog");
      const r = await maybeRefreshCatalog();
      return r ? refreshSummary(r) : "güncel";
    },
  },
];

/** En az aralığa hoşgörü (zamanlayıcı tam 60 sn'de bir çağırmayabilir) */
const SLACK_MS = 5_000;
/** Bu süreden sonra yeni hızlı görev başlatılmaz (yanıt 25 sn'nin altında kalsın) */
const FAST_BUDGET_MS = 15_000;
const KEEP_TICK_RUNS = 500;

interface LeaseRow {
  name: string;
  locked_until: number;
  last_run_at: number | null;
  last_ok_at: number | null;
  last_error: string | null;
  last_duration_ms: number | null;
}

const g = globalThis as unknown as { __yatirimLeasesSeeded?: boolean };

async function ensureLeaseRows(db: Db) {
  if (g.__yatirimLeasesSeeded) return;
  await db.run(
    `INSERT INTO task_leases (name, locked_until) VALUES ${TASKS.map(() => "(?, 0)").join(", ")} ON CONFLICT DO NOTHING`,
    TASKS.map((t) => t.name),
  );
  g.__yatirimLeasesSeeded = true;
}

function isActive(t: TaskDef, now: number) {
  return !t.active || t.active(istanbulClock(now));
}

function dueByRow(t: TaskDef, row: LeaseRow | undefined, now: number) {
  if (!row) return true;
  if (row.locked_until > now) return false;
  return row.last_run_at == null || row.last_run_at <= now - t.minIntervalSec * 1000 + SLACK_MS;
}

/** Görevi atomik olarak alır. Başka bir çağrı aldıysa ya da zamanı gelmediyse false. */
export async function claimTask(db: Db, t: TaskDef, now = Date.now()): Promise<boolean> {
  const r = await db.run(
    `UPDATE task_leases SET locked_until = ?, last_run_at = ?
     WHERE name = ? AND locked_until <= ? AND (last_run_at IS NULL OR last_run_at <= ?) RETURNING name`,
    [now + t.leaseSec * 1000, now, t.name, now, now - t.minIntervalSec * 1000 + SLACK_MS],
  );
  return r.changes === 1;
}

/**
 * Kilidi bırakır. Yalnızca kilidin sahibi bırakabilir: claimedAt, alımda yazılan last_run_at'tir.
 * Kilit süresi dolup görev başka bir çağrıca yeniden alındıysa geç biten eski çağrı yeni sahibin
 * kilidini açmaz (false döner).
 */
export async function releaseTask(db: Db, t: TaskDef, claimedAt: number, ok: boolean, error: string | null, durationMs: number): Promise<boolean> {
  const r = await db.run(
    `UPDATE task_leases SET locked_until = 0, last_ok_at = CASE WHEN ? = 1 THEN ? ELSE last_ok_at END, last_error = ?, last_duration_ms = ?
     WHERE name = ? AND last_run_at = ?`,
    [ok ? 1 : 0, Date.now(), error, durationMs, t.name, claimedAt],
  );
  return r.changes === 1;
}

function summarize(v: unknown): string {
  if (v == null) return "tamam";
  if (typeof v === "string") return v.slice(0, 200);
  try {
    return JSON.stringify(v).slice(0, 200);
  } catch {
    return "tamam";
  }
}

/** Görevi kilitle, çalıştır, kilidi bırak. Hata fırlatmaz. */
async function runOne(db: Db, t: TaskDef): Promise<string> {
  const started = Date.now();
  if (!(await claimTask(db, t, started))) return "kilitli/atlandı";
  try {
    const r = await t.run();
    await releaseTask(db, t, started, true, null, Date.now() - started);
    return summarize(r);
  } catch (err) {
    const msg = (err as Error)?.message ?? String(err);
    console.error(`[nöbet] ${t.name} hatası`, err);
    await releaseTask(db, t, started, false, msg.slice(0, 500), Date.now() - started).catch(() => {});
    return `hata: ${msg.slice(0, 150)}`;
  }
}

export interface TickResult {
  tickId: number;
  window: "fast" | "slow";
  tasks: Record<string, string>;
  /** Zamanı gelmiş yavaş görev var: /api/cron/slow çağrılmalı */
  slowDue: boolean;
  ms: number;
}

/** Bir nöbet turu: zamanı gelen hızlı görevleri çalıştırır. */
export async function runTick(opts: { source: string; now?: number }): Promise<TickResult> {
  const t0 = opts.now ?? Date.now();
  const db = await getDb();
  await ensureLeaseRows(db);
  const tickId = (await db.run("INSERT INTO tick_runs (started_at, source) VALUES (?, ?) RETURNING id", [t0, opts.source.slice(0, 60)])).lastId!;
  const rows = new Map((await db.all<LeaseRow>("SELECT * FROM task_leases")).map((r) => [r.name, r]));
  const tasks: Record<string, string> = {};
  let error: string | null = null;
  try {
    for (const t of TASKS) {
      if (t.slow || !isActive(t, Date.now()) || !dueByRow(t, rows.get(t.name), Date.now())) continue;
      if (Date.now() - t0 > FAST_BUDGET_MS) {
        tasks[t.name] = "süre doldu, sonraki tura";
        continue;
      }
      tasks[t.name] = await runOne(db, t);
    }
  } catch (err) {
    error = (err as Error)?.message ?? String(err);
  }
  const now = Date.now();
  const slowDue = TASKS.some((t) => t.slow && isActive(t, now) && dueByRow(t, rows.get(t.name), now));
  await db.run("UPDATE tick_runs SET finished_at = ?, tasks = ?, error = ? WHERE id = ?", [now, JSON.stringify(tasks), error, tickId]);
  if (tickId % 20 === 0) await db.run("DELETE FROM tick_runs WHERE id <= ?", [tickId - KEEP_TICK_RUNS]);
  return { tickId, window: inFastWindow(t0) ? "fast" : "slow", tasks, slowDue, ms: now - t0 };
}

/** Yavaş görevler (ayrı işlev çağrısında, en fazla ~300 sn). */
export async function runSlow(): Promise<Record<string, string>> {
  const db = await getDb();
  await ensureLeaseRows(db);
  const rows = new Map((await db.all<LeaseRow>("SELECT * FROM task_leases")).map((r) => [r.name, r]));
  const out: Record<string, string> = {};
  for (const t of TASKS) {
    if (!t.slow || !isActive(t, Date.now()) || !dueByRow(t, rows.get(t.name), Date.now())) continue;
    out[t.name] = await runOne(db, t);
  }
  return out;
}

// ---- Durum (Ayarlar) ----------------------------------------------------------------

export interface NobetStatus {
  mode: "bulut" | "yerel";
  /** Son nöbetin zamanı (ms); hiç yoksa null */
  lastTickAt: number | null;
  lastSource: string | null;
  /** Beklenen en uzun aralık (ms) */
  expectedMaxGapMs: number;
  /** Son nöbet beklenenden eski */
  late: boolean;
  tasks: { name: string; label: string; lastRunAt: number | null; lastOkAt: number | null; lastError: string | null }[];
}

const gw = globalThis as unknown as { __yatirimWatcherTickAt?: number };

/** Yerel izleyici her turda çağırır (Ayarlar'daki "Son nöbet" için) */
export function markLocalTick(now = Date.now()) {
  gw.__yatirimWatcherTickAt = now;
}

export async function nobetStatus(now = Date.now()): Promise<NobetStatus> {
  if (!isCloud()) {
    const last = gw.__yatirimWatcherTickAt ?? null;
    const gap = 2 * 60_000;
    return { mode: "yerel", lastTickAt: last, lastSource: last ? "yerel izleyici" : null, expectedMaxGapMs: gap, late: last == null || now - last > gap, tasks: [] };
  }
  const db = await getDb();
  const last = await db.get<{ started_at: number; source: string | null }>("SELECT started_at, source FROM tick_runs ORDER BY id DESC LIMIT 1");
  const rows = new Map((await db.all<LeaseRow>("SELECT * FROM task_leases")).map((r) => [r.name, r]));
  const gap = expectedMaxGapMs(now);
  return {
    mode: "bulut",
    lastTickAt: last?.started_at ?? null,
    lastSource: last?.source ?? null,
    expectedMaxGapMs: gap,
    late: !last || now - last.started_at > gap,
    tasks: TASKS.map((t) => {
      const r = rows.get(t.name);
      return { name: t.name, label: t.label, lastRunAt: r?.last_run_at ?? null, lastOkAt: r?.last_ok_at ?? null, lastError: r?.last_error ?? null };
    }),
  };
}
