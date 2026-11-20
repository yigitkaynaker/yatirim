import "server-only";
import { getDb } from "./db";
import { displaySymbol, instrumentId, isAssetType, isMode, isValidSymbol, normalizeSymbol, type AssetType, type Mode } from "./assets";
import { parseDecimal } from "./format";
import { getQuotes, quoteUsable, type Quote } from "./prices";
import { getPortfolio, ValidationError } from "./portfolio";
import { listWatchlist } from "./market";
import { addNotification } from "./orders";
import { sendPushToAll } from "./push";
import {
  describeRule,
  evaluateAlarm,
  type AlarmDirection,
  type AlarmKind,
  type AlarmRepeat,
  type AlarmRule,
  type AlarmState,
  type Observation,
} from "./alarmLogic";

// ALARMLAR
// İşlem yapmayan uyarılar: koşul sağlanınca yalnızca bildirim + push gönderilir.
// Emir izleyici döngüsünden (~30 sn) çağrılır. Fiyat / günlük değişim / maliyet
// alarmları her turda (fiyatlar 30 sn önbellekli), hacim ve teknik sinyal alarmları
// en fazla 15 dakikada bir kontrol edilir (günlük mumlar 30 dk önbellekli).
// Tetikleme ve bekleme süresi mantığı: alarmLogic.ts.

export type { AlarmKind, AlarmDirection, AlarmRepeat } from "./alarmLogic";
export type AlarmScope = "asset" | "watchlist";

export const ALARM_KINDS: AlarmKind[] = ["price", "day_change", "cost_change", "volume_spike", "signal_change"];

export const ALARM_KIND_LABEL: Record<AlarmKind, string> = {
  price: "Fiyat eşiği",
  day_change: "Günlük % değişim",
  cost_change: "Maliyetime göre %",
  volume_spike: "Hacim patlaması",
  signal_change: "Teknik sinyal değişimi",
};

export interface Alarm {
  id: number;
  kind: AlarmKind;
  scope: AlarmScope;
  assetType: AssetType | null;
  symbol: string | null;
  instrument: string | null;
  name: string;
  mode: Mode | null;
  direction: AlarmDirection;
  threshold: number | null;
  repeat: AlarmRepeat;
  cooldownMin: number;
  active: boolean;
  note: string | null;
  source: string;
  fireCount: number;
  lastFiredAt: number | null;
  createdAt: string;
  /** Okunur koşul metni */
  description: string;
}

export interface AlarmEvent {
  id: number;
  alarmId: number | null;
  instrument: string;
  message: string;
  value: number | null;
  firedAt: number;
}

interface AlarmRow {
  id: number;
  kind: AlarmKind;
  scope: AlarmScope;
  asset_type: AssetType | null;
  symbol: string | null;
  mode: Mode | null;
  direction: AlarmDirection;
  threshold: number | null;
  repeat: AlarmRepeat;
  cooldown_min: number;
  active: number;
  note: string | null;
  source: string;
  state: string | null;
  fire_count: number;
  last_fired_at: number | null;
  created_at: string;
}

const ruleOf = (r: AlarmRow): AlarmRule => ({ kind: r.kind, direction: r.direction, threshold: r.threshold, repeat: r.repeat, cooldownMin: r.cooldown_min });

function nameOf(r: { scope: AlarmScope; asset_type: AssetType | null; symbol: string | null }) {
  return r.scope === "watchlist" || !r.asset_type || !r.symbol ? "İzleme listemdeki herhangi bir varlık" : displaySymbol(r.asset_type, r.symbol);
}

function fromRow(r: AlarmRow): Alarm {
  const name = nameOf(r);
  return {
    id: r.id,
    kind: r.kind,
    scope: r.scope,
    assetType: r.asset_type,
    symbol: r.symbol,
    instrument: r.asset_type && r.symbol ? instrumentId(r.asset_type, r.symbol) : null,
    name,
    mode: r.mode,
    direction: r.direction,
    threshold: r.threshold,
    repeat: r.repeat,
    cooldownMin: r.cooldown_min,
    active: r.active === 1,
    note: r.note,
    source: r.source,
    fireCount: r.fire_count,
    lastFiredAt: r.last_fired_at,
    createdAt: r.created_at,
    description: describeRule(ruleOf(r), { name, mode: r.mode }),
  };
}

function rows(where = "", ...args: (string | number)[]): AlarmRow[] {
  return getDb().prepare(`SELECT * FROM alarms ${where} ORDER BY id DESC`).all(...args) as unknown as AlarmRow[];
}

export function listAlarms(opts: { instrument?: string; activeOnly?: boolean } = {}): Alarm[] {
  let list = rows(opts.activeOnly ? "WHERE active = 1" : "").map(fromRow);
  if (opts.instrument) list = list.filter((a) => a.instrument === opts.instrument);
  return list;
}

export function getAlarm(id: number): Alarm | null {
  const r = rows("WHERE id = ?", id)[0];
  return r ? fromRow(r) : null;
}

export function listAlarmEvents(limit = 30): AlarmEvent[] {
  const list = getDb().prepare("SELECT * FROM alarm_events ORDER BY fired_at DESC, id DESC LIMIT ?").all(limit) as {
    id: number;
    alarm_id: number | null;
    instrument: string;
    message: string;
    value: number | null;
    fired_at: number;
  }[];
  return list.map((e) => ({ id: e.id, alarmId: e.alarm_id, instrument: e.instrument, message: e.message, value: e.value, firedAt: e.fired_at }));
}

/** Belirli bir zamandan beri çalan alarmlar (günlük özet için) */
export function alarmEventsSince(ms: number): AlarmEvent[] {
  return listAlarmEvents(200).filter((e) => e.firedAt >= ms);
}

// ---- Oluşturma / değiştirme --------------------------------------------------------

const WATCHLIST_KINDS: AlarmKind[] = ["day_change", "volume_spike", "signal_change"];

/**
 * Alarm kurar. Gövde: { kind, scope?, assetType?, symbol?, mode?, direction?, threshold?,
 * repeat?: "once"|"every", cooldownMin?, note? }
 */
export async function createAlarm(body: Record<string, unknown>, source = "manuel"): Promise<Alarm> {
  const kind = body.kind as AlarmKind;
  if (!ALARM_KINDS.includes(kind)) throw new ValidationError("Alarm türü geçersiz.");
  const scope: AlarmScope = body.scope === "watchlist" ? "watchlist" : "asset";
  if (scope === "watchlist" && !WATCHLIST_KINDS.includes(kind)) {
    throw new ValidationError("İzleme listesi alarmı yalnızca günlük değişim, hacim ve teknik sinyal için kurulabilir.");
  }
  let assetType: AssetType | null = null;
  let symbol: string | null = null;
  if (scope === "asset") {
    if (!isAssetType(body.assetType)) throw new ValidationError("Varlık türü geçersiz.");
    assetType = body.assetType;
    symbol = normalizeSymbol(assetType, String(body.symbol ?? ""));
    if (!isValidSymbol(assetType, symbol)) throw new ValidationError("Sembol geçersiz.");
  }
  const direction: AlarmDirection = body.direction === "up" || body.direction === "down" ? body.direction : "both";
  if (kind === "price" && direction === "both") throw new ValidationError("Fiyat alarmında yön seçin: üstüne çıkarsa ya da altına inerse.");

  let threshold: number | null = null;
  if (kind !== "signal_change") {
    const raw = body.threshold;
    threshold = raw == null || raw === "" ? NaN : parseDecimal(raw as string | number);
    if (!Number.isFinite(threshold) || threshold <= 0) {
      throw new ValidationError(kind === "price" ? "Eşik fiyatı geçersiz." : kind === "volume_spike" ? "Hacim katı geçersiz (örn. 2)." : "Yüzde geçersiz (örn. 5).");
    }
    if ((kind === "day_change" || kind === "cost_change") && threshold > 1000) throw new ValidationError("Yüzde çok büyük.");
  }

  let mode: Mode | null = null;
  if (kind === "cost_change") {
    mode = isMode(body.mode) ? body.mode : "real";
    const p = await getPortfolio(mode);
    if (!p.holdings.some((h) => h.assetType === assetType && h.symbol === symbol)) {
      throw new ValidationError(`${mode === "real" ? "Gerçek" : "Sanal"} portföyde ${displaySymbol(assetType!, symbol!)} pozisyonu yok; maliyet alarmı kurulamaz.`);
    }
  }

  if (scope === "asset" && kind === "price") {
    const [q] = await getQuotes([{ type: assetType!, symbol: symbol! }]);
    if (q.price == null) throw new ValidationError(`${symbol} için fiyat bulunamadı; sembolü kontrol edin.`);
  }

  const repeat: AlarmRepeat = body.repeat === "every" ? "every" : "once";
  const cooldownRaw = body.cooldownMin == null || body.cooldownMin === "" ? 60 : parseDecimal(body.cooldownMin as string | number);
  if (!Number.isFinite(cooldownRaw) || cooldownRaw < 0 || cooldownRaw > 7 * 24 * 60) throw new ValidationError("Bekleme süresi 0 ile 10080 dakika arasında olmalı.");
  const note = typeof body.note === "string" && body.note.trim() ? body.note.trim().slice(0, 300) : null;

  const res = getDb()
    .prepare(
      `INSERT INTO alarms (kind, scope, asset_type, symbol, mode, direction, threshold, repeat, cooldown_min, note, source)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(kind, scope, assetType, symbol, mode, direction, threshold, repeat, Math.round(cooldownRaw), note, source);
  return getAlarm(Number(res.lastInsertRowid))!;
}

export function deleteAlarm(id: number): boolean {
  return Number(getDb().prepare("DELETE FROM alarms WHERE id = ?").run(id).changes) > 0;
}

/** Alarmı açar / kapatır. Yeniden açılan alarmın durumu sıfırlanır (koşul sağlanıyorsa bir kez çalar). */
export function setAlarmActive(id: number, active: boolean): Alarm | null {
  getDb().prepare("UPDATE alarms SET active = ?, state = CASE WHEN ? = 1 THEN NULL ELSE state END WHERE id = ?").run(active ? 1 : 0, active ? 1 : 0, id);
  return getAlarm(id);
}

// ---- Kontrol ------------------------------------------------------------------------

const SLOW_EVERY_MS = 15 * 60_000;
const g = globalThis as unknown as { __yatirimAlarmSlowAt?: number; __yatirimAlarmRunning?: boolean };

interface Target {
  type: AssetType;
  symbol: string;
  id: string;
}

function targetsOf(r: AlarmRow, watch: Target[]): Target[] {
  if (r.scope === "watchlist") return watch;
  if (!r.asset_type || !r.symbol) return [];
  return [{ type: r.asset_type, symbol: r.symbol, id: instrumentId(r.asset_type, r.symbol) }];
}

const fmt = (v: number, d = 2) => v.toLocaleString("tr-TR", { maximumFractionDigits: d });

function fireMessage(r: AlarmRow, t: Target, obs: Observation, q: Quote | undefined, fromLabel?: string | null): { title: string; body: string } {
  const name = displaySymbol(t.type, t.symbol);
  const price = q?.price != null ? ` Fiyat: ${fmt(q.price, 4)} ${q.currency}.` : "";
  const v = obs.value ?? 0;
  switch (r.kind) {
    case "price":
      return { title: `Alarm: ${name} ${r.direction === "down" ? "eşiğin altına indi" : "eşiğin üstüne çıktı"}`, body: `${name} ${fmt(v, 4)} ${q?.currency ?? ""} (eşik ${fmt(r.threshold ?? 0, 4)}).` };
    case "day_change":
      return { title: `Alarm: ${name} bugün %${fmt(v)}`, body: `${name} bir önceki kapanışa göre %${fmt(v)} ${v >= 0 ? "yükseldi" : "düştü"} (eşik %${fmt(r.threshold ?? 0)}).${price}` };
    case "cost_change":
      return {
        title: `Alarm: ${name} maliyetine göre %${fmt(v)}`,
        body: `${r.mode === "virtual" ? "Sanal" : "Gerçek"} pozisyonunuz maliyetine göre %${fmt(v)} ${v >= 0 ? "kârda" : "zararda"} (eşik %${fmt(r.threshold ?? 0)}).${price}`,
      };
    case "volume_spike":
      return { title: `Alarm: ${name} hacmi ${fmt(v, 1)} kat`, body: `Bugünkü işlem hacmi son 20 günün ortalamasının ${fmt(v, 1)} katı (eşik ${fmt(r.threshold ?? 0, 1)}×). Yüksek hacim, fiyattaki hareketin daha çok kişi tarafından desteklendiğini gösterir.` };
    case "signal_change":
      return { title: `Alarm: ${name} teknik sinyali değişti`, body: `${fromLabel ?? "?"} → ${obs.label}. Teknik sinyaller geçmiş fiyatlara dayanır, yatırım tavsiyesi değildir.` };
  }
}

/**
 * Etkin alarmları kontrol eder. Hata fırlatmaz. now: testler için.
 * Dönüş: çalan alarm sayısı.
 */
export async function checkAlarms(opts: { now?: number; forceSlow?: boolean } = {}): Promise<{ checked: number; fired: number }> {
  if (g.__yatirimAlarmRunning) return { checked: 0, fired: 0 };
  const active = rows("WHERE active = 1");
  if (active.length === 0) return { checked: 0, fired: 0 };
  g.__yatirimAlarmRunning = true;
  try {
    return await runCheck(active, opts.now ?? Date.now(), !!opts.forceSlow);
  } finally {
    g.__yatirimAlarmRunning = false;
  }
}

async function runCheck(active: AlarmRow[], now: number, forceSlow: boolean) {
  const slowDue = forceSlow || now - (g.__yatirimAlarmSlowAt ?? 0) >= SLOW_EVERY_MS;
  const watch: Target[] = active.some((a) => a.scope === "watchlist")
    ? listWatchlist().map((w) => ({ type: w.assetType, symbol: w.symbol, id: instrumentId(w.assetType, w.symbol) }))
    : [];

  const isSlow = (k: AlarmKind) => k === "volume_spike" || k === "signal_change";
  const todo = active.filter((a) => !isSlow(a.kind) || slowDue);
  if (todo.some((a) => isSlow(a.kind))) g.__yatirimAlarmSlowAt = now;

  // Fiyatlar (tek seferde)
  const quoteTargets = new Map<string, Target>();
  for (const a of todo) if (a.kind === "price" || a.kind === "day_change") for (const t of targetsOf(a, watch)) quoteTargets.set(t.id, t);
  const qList = quoteTargets.size ? await getQuotes([...quoteTargets.values()].map((t) => ({ type: t.type, symbol: t.symbol }))) : [];
  const quotes = new Map(qList.map((q) => [q.id, q]));

  // Maliyete göre K/Z (TL): gerekiyorsa portföy
  const pnl = new Map<string, number>();
  for (const mode of ["real", "virtual"] as const) {
    if (!todo.some((a) => a.kind === "cost_change" && a.mode === mode)) continue;
    try {
      const p = await getPortfolio(mode);
      for (const h of p.holdings) {
        if (h.stale || h.pnlTry == null || !h.costTry) continue;
        if (!quoteUsable(h)) continue;
        pnl.set(`${mode}|${h.id}`, (h.pnlTry / h.costTry) * 100);
      }
    } catch (err) {
      console.warn("[alarm] portföy okunamadı", (err as Error).message);
    }
  }

  // Teknik veriler (hacim oranı, sinyal) — yavaş tür, sınırlı
  const tech = new Map<string, { volumeRatio: number | null; label: string | null }>();
  const techTargets = new Map<string, Target>();
  for (const a of todo) if (isSlow(a.kind)) for (const t of targetsOf(a, watch)) techTargets.set(t.id, t);
  if (techTargets.size) {
    const { getTechnicalAnalysis } = await import("./technical");
    for (const t of [...techTargets.values()].slice(0, 30)) {
      try {
        const ta = await getTechnicalAnalysis(t.type, t.symbol);
        tech.set(t.id, { volumeRatio: ta.snapshot.volumeRatio, label: ta.summary.insufficient ? null : ta.summary.label });
      } catch {
        // veri yok: bu tur atlanır
      }
    }
  }

  const db = getDb();
  let fired = 0;
  for (const a of todo) {
    const state: AlarmState = a.state ? (JSON.parse(a.state) as AlarmState) : {};
    const rule = ruleOf(a);
    let anyFired = false;
    for (const t of targetsOf(a, watch)) {
      const q = quotes.get(t.id);
      let obs: Observation = {};
      if (a.kind === "price") obs = { value: q && quoteUsable(q, now) ? q.price : null };
      else if (a.kind === "day_change") obs = { value: q && quoteUsable(q, now) && q.price != null && q.prevClose ? ((q.price - q.prevClose) / q.prevClose) * 100 : null };
      else if (a.kind === "cost_change") obs = { value: pnl.get(`${a.mode ?? "real"}|${t.id}`) ?? null };
      else if (a.kind === "volume_spike") obs = { value: tech.get(t.id)?.volumeRatio ?? null };
      else if (a.kind === "signal_change") obs = { label: tech.get(t.id)?.label ?? null };

      const ev = evaluateAlarm(rule, state[t.id], obs, now);
      state[t.id] = ev.next;
      if (!ev.fire) continue;
      anyFired = true;
      fired++;
      const msg = fireMessage(a, t, obs, q, ev.fromLabel);
      db.prepare("INSERT INTO alarm_events (alarm_id, instrument, message, value, fired_at) VALUES (?, ?, ?, ?, ?)").run(
        a.id,
        t.id,
        `${msg.title}. ${msg.body}`,
        obs.value ?? null,
        now,
      );
      addNotification({ kind: "alarm", title: msg.title, body: msg.body, data: { alarmId: a.id, instrument: t.id } });
      void sendPushToAll({ title: msg.title, body: msg.body, url: `/piyasa/detay?id=${encodeURIComponent(t.id)}`, tag: `alarm-${a.id}-${t.id}` });
      if (a.repeat === "once") break; // tek sefer: ilk çalan varlıktan sonra kapanır
    }
    db.prepare(
      `UPDATE alarms SET state = ?, fire_count = fire_count + ?, last_fired_at = CASE WHEN ? > 0 THEN ? ELSE last_fired_at END,
         active = CASE WHEN ? > 0 AND repeat = 'once' THEN 0 ELSE active END WHERE id = ?`,
    ).run(JSON.stringify(state), anyFired ? 1 : 0, anyFired ? 1 : 0, now, anyFired ? 1 : 0, a.id);
  }
  return { checked: todo.length, fired };
}
