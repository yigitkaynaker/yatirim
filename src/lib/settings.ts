import "server-only";
import { getDb } from "./db";
import { ValidationError } from "./portfolio";
import { parseDecimal } from "./format";

// Uygulama ayarları: settings tablosunda anahtar/değer olarak tutulur.
// Yapay zeka ayarları (model, otomatik tarama takvimi, arama sınırı, bütçe) ve
// Ayarlar sayfasından yapıştırılan API anahtarı buradadır.

export function getSetting(key: string): string | null {
  const row = getDb().prepare("SELECT value FROM settings WHERE key = ?").get(key) as { value: string } | undefined;
  return row ? row.value : null;
}

export function setSetting(key: string, value: string) {
  getDb()
    .prepare(
      `INSERT INTO settings (key, value) VALUES (?, ?)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = datetime('now')`,
    )
    .run(key, value);
}

export function deleteSetting(key: string) {
  getDb().prepare("DELETE FROM settings WHERE key = ?").run(key);
}

// ---- Modeller ---------------------------------------------------------------

export const AI_MODELS = {
  ekonomik: { id: "claude-haiku-5-5", label: "Ekonomik (Haiku)", inputPerMTok: 0.1, outputPerMTok: 0.5 },
  gelismis: { id: "claude-sonnet-5-5", label: "Gelişmiş (Sonnet)", inputPerMTok: 2, outputPerMTok: 10 },
} as const;
export type AiModelKey = keyof typeof AI_MODELS;

/** Web araması: $10 / 1000 arama */
export const WEB_SEARCH_USD = 0.01;

export function isAiModelKey(v: unknown): v is AiModelKey {
  return v === "ekonomik" || v === "gelismis";
}

// ---- API anahtarı -----------------------------------------------------------

const KEY_SETTING = "anthropic_api_key";

export type KeySource = "env" | "db" | null;

/** .env'deki ANTHROPIC_API_KEY önceliklidir; yoksa Ayarlar'dan kaydedilen anahtar. */
export function getApiKey(): { key: string | null; source: KeySource } {
  const env = process.env.ANTHROPIC_API_KEY?.trim();
  if (env) return { key: env, source: "env" };
  const db = getSetting(KEY_SETTING)?.trim();
  if (db) return { key: db, source: "db" };
  return { key: null, source: null };
}

export function hasApiKey(): boolean {
  return getApiKey().key != null;
}

export function saveApiKey(raw: unknown) {
  const key = typeof raw === "string" ? raw.trim() : "";
  if (!key) throw new ValidationError("Anahtar boş olamaz.");
  if (!/^sk-ant-[A-Za-z0-9_\-]{10,}$/.test(key)) {
    throw new ValidationError("Bu bir Claude API anahtarına benzemiyor. Anahtar \"sk-ant-\" ile başlar.");
  }
  setSetting(KEY_SETTING, key);
}

export function deleteApiKey() {
  deleteSetting(KEY_SETTING);
}

export function maskKey(key: string | null): string | null {
  if (!key) return null;
  return `${key.slice(0, 10)}…${key.slice(-4)}`;
}

// ---- Yapay zeka ayarları ----------------------------------------------------

export interface AiSettings {
  model: AiModelKey;
  /** Otomatik haber taraması açık mı */
  scheduleEnabled: boolean;
  /** "HH:MM" listesi, Europe/Istanbul saatiyle, yalnızca hafta içi */
  scheduleTimes: string[];
  /** Tarama başına en fazla web araması */
  maxSearches: number;
  /** Aylık bütçe (USD) */
  budgetUsd: number;
}

export const DEFAULT_AI_SETTINGS: AiSettings = {
  model: "ekonomik",
  scheduleEnabled: true,
  scheduleTimes: ["09:45", "13:00", "18:30"],
  maxSearches: 3,
  budgetUsd: 10,
};

const AI_SETTINGS_KEY = "ai_settings";

export function getAiSettings(): AiSettings {
  const raw = getSetting(AI_SETTINGS_KEY);
  if (!raw) return { ...DEFAULT_AI_SETTINGS };
  try {
    return normalizeAiSettings({ ...DEFAULT_AI_SETTINGS, ...(JSON.parse(raw) as Partial<AiSettings>) });
  } catch {
    return { ...DEFAULT_AI_SETTINGS };
  }
}

function parseTimes(v: unknown): string[] {
  const list = Array.isArray(v) ? v : typeof v === "string" ? v.split(/[,\s]+/) : [];
  const out = new Set<string>();
  for (const item of list) {
    const s = String(item).trim();
    if (!s) continue;
    const m = /^(\d{1,2})[:.](\d{2})$/.exec(s);
    if (!m || Number(m[1]) > 23 || Number(m[2]) > 59) throw new ValidationError(`Saat geçersiz: "${s}". Örnek: 09:45`);
    out.add(`${m[1].padStart(2, "0")}:${m[2]}`);
  }
  if (out.size > 12) throw new ValidationError("En fazla 12 tarama saati girilebilir.");
  return [...out].sort();
}

function normalizeAiSettings(s: AiSettings): AiSettings {
  return {
    model: isAiModelKey(s.model) ? s.model : DEFAULT_AI_SETTINGS.model,
    scheduleEnabled: !!s.scheduleEnabled,
    scheduleTimes: parseTimes(s.scheduleTimes),
    maxSearches: Math.min(10, Math.max(0, Math.round(Number(s.maxSearches) || 0))),
    budgetUsd: Math.max(0, Number(s.budgetUsd) || 0),
  };
}

/** Kısmi güncelleme. Hatalı değerde ValidationError. */
export function updateAiSettings(body: Record<string, unknown>): AiSettings {
  const cur = getAiSettings();
  const next: AiSettings = { ...cur };
  if (body.model !== undefined) {
    if (!isAiModelKey(body.model)) throw new ValidationError("Model geçersiz.");
    next.model = body.model;
  }
  if (body.scheduleEnabled !== undefined) next.scheduleEnabled = !!body.scheduleEnabled;
  if (body.scheduleTimes !== undefined) next.scheduleTimes = parseTimes(body.scheduleTimes);
  if (body.maxSearches !== undefined) {
    const n = parseDecimal(body.maxSearches as string | number);
    if (!Number.isInteger(n) || n < 0 || n > 10) throw new ValidationError("Arama sayısı 0 ile 10 arasında bir tam sayı olmalı.");
    next.maxSearches = n;
  }
  if (body.budgetUsd !== undefined) {
    const n = parseDecimal(body.budgetUsd as string | number);
    if (!Number.isFinite(n) || n < 0 || n > 1000) throw new ValidationError("Bütçe 0 ile 1000 $ arasında olmalı.");
    next.budgetUsd = n;
  }
  if (next.scheduleEnabled && next.scheduleTimes.length === 0) {
    throw new ValidationError("Otomatik tarama açıkken en az bir saat girin.");
  }
  setSetting(AI_SETTINGS_KEY, JSON.stringify(next));
  return next;
}

// ---- Teknik sinyal uyarıları --------------------------------------------------------

const SIGNAL_ALERTS_KEY = "signal_alerts";

/** Günlük teknik sinyal değişimi bildirimi açık mı (varsayılan: açık) */
export function getSignalAlertsEnabled(): boolean {
  return getSetting(SIGNAL_ALERTS_KEY) !== "0";
}

export function setSignalAlertsEnabled(on: boolean) {
  setSetting(SIGNAL_ALERTS_KEY, on ? "1" : "0");
}
