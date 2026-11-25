import "server-only";
import { getDb, sqlNow } from "./db";
import { ValidationError } from "./portfolio";
import { parseDecimal } from "./format";
import { getCurrentUserId, OWNER_USER_ID } from "./userContext";

// Uygulama ayarları: settings tablosunda (kullanıcı, anahtar) → değer olarak tutulur.
// Yapay zeka ayarları (model, otomatik tarama takvimi, arama sınırı, bütçe) ve
// Ayarlar sayfasından yapıştırılan API anahtarı buradadır. Ayarlar KULLANICI BAŞINADIR;
// user_id 0 sunucu geneli anahtarlardır (VAPID, KAP son çekim, paylaşılan yapay zeka sınırı).

/** Sunucu geneli ayarların kullanıcı kimliği */
const GLOBAL_UID = 0;

async function readSetting(userId: number, key: string): Promise<string | null> {
  const row = await (await getDb()).get("SELECT value FROM settings WHERE user_id = ? AND key = ?", [userId, key]) as { value: string } | undefined;
  return row ? row.value : null;
}

async function writeSetting(userId: number, key: string, value: string) {
  await (await getDb()).run(`INSERT INTO settings (user_id, key, value, updated_at) VALUES (?, ?, ?, ?)
       ON CONFLICT(user_id, key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`, [userId, key, value, sqlNow()]);
}

/** Geçerli kullanıcının ayarı */
export async function getSetting(key: string): Promise<string | null> {
  return readSetting(await getCurrentUserId(), key);
}

export async function setSetting(key: string, value: string) {
  await writeSetting(await getCurrentUserId(), key, value);
}

export async function deleteSetting(key: string) {
  await (await getDb()).run("DELETE FROM settings WHERE user_id = ? AND key = ?", [await getCurrentUserId(), key]);
}

/** Sunucu geneli ayar (kullanıcıdan bağımsız: VAPID anahtarları, KAP son çekim…) */
export async function getGlobalSetting(key: string): Promise<string | null> {
  return readSetting(GLOBAL_UID, key);
}

export async function setGlobalSetting(key: string, value: string) {
  await writeSetting(GLOBAL_UID, key, value);
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

// ---- Sağlayıcı (Claude / OpenAI) ------------------------------------------------------

export const AI_PROVIDERS = ["anthropic", "openai"] as const;
export type AiProviderId = (typeof AI_PROVIDERS)[number];
export const PROVIDER_LABELS: Record<AiProviderId, string> = { anthropic: "Claude", openai: "OpenAI (ChatGPT)" };

export function isAiProviderId(v: unknown): v is AiProviderId {
  return v === "anthropic" || v === "openai";
}

/**
 * OpenAI modelleri ve tahmini fiyatları ($ / milyon token). Fiyatlar değişebilir; listede olmayan
 * bir model Ayarlar'dan elle yazılabilir (isteğe bağlı fiyatıyla).
 */
export const OPENAI_MODELS = [
  { id: "gpt-5-nano", label: "GPT-5 nano (en ucuz)", inputPerMTok: 0.05, outputPerMTok: 0.4 },
  { id: "gpt-5-mini", label: "GPT-5 mini (önerilen)", inputPerMTok: 0.25, outputPerMTok: 2 },
  { id: "gpt-5.4-mini", label: "GPT-5.4 mini", inputPerMTok: 0.75, outputPerMTok: 4.5 },
  { id: "gpt-6.1-terra", label: "GPT-6.1 Terra (gelişmiş)", inputPerMTok: 1, outputPerMTok: 5 },
] as const;
export const DEFAULT_OPENAI_MODEL = "gpt-5-mini";
/** Günlük özet ve "neden hareket ediyor" için ucuz OpenAI modeli */
export const OPENAI_CHEAP_MODEL = "gpt-5-nano";

export interface ModelPrice {
  inputPerMTok: number;
  outputPerMTok: number;
}

/** Bilinen modelin fiyatı (yoksa null) */
export function knownPrice(modelId: string): ModelPrice | null {
  return Object.values(AI_MODELS).find((m) => m.id === modelId) ?? OPENAI_MODELS.find((m) => m.id === modelId) ?? null;
}

function isModelId(v: unknown): v is string {
  return typeof v === "string" && /^[A-Za-z0-9][A-Za-z0-9._:\-]{1,80}$/.test(v);
}

// ---- API anahtarı -----------------------------------------------------------

const KEY_SETTINGS: Record<AiProviderId, { setting: string; env: string }> = {
  anthropic: { setting: "anthropic_api_key", env: "ANTHROPIC_API_KEY" },
  openai: { setting: "openai_api_key", env: "OPENAI_API_KEY" },
};

/** env: .env (sahibin), db: kullanıcının kendi kaydettiği, owner: sahibin anahtarı paylaşımlı kullanılıyor */
export type KeySource = "env" | "db" | "owner" | null;

/** Sahibin anahtarı: .env'deki ANTHROPIC_API_KEY / OPENAI_API_KEY önceliklidir; yoksa sahibin Ayarlar'dan kaydettiği. */
async function ownerKey(provider: AiProviderId): Promise<{ key: string; source: "env" | "db" } | null> {
  const k = KEY_SETTINGS[provider];
  const env = process.env[k.env]?.trim();
  if (env) return { key: env, source: "env" };
  const db = (await readSetting(OWNER_USER_ID, k.setting))?.trim();
  return db ? { key: db, source: "db" } : null;
}

/** Geçerli kullanıcının KENDİ anahtarı (sahip için .env dahil); paylaşılan anahtar dahil değil */
export async function getOwnApiKey(provider: AiProviderId = "anthropic"): Promise<{ key: string | null; source: KeySource }> {
  const uid = await getCurrentUserId();
  if (uid === OWNER_USER_ID) {
    const o = await ownerKey(provider);
    return o ? { key: o.key, source: o.source } : { key: null, source: null };
  }
  const db = (await readSetting(uid, KEY_SETTINGS[provider].setting))?.trim();
  return db ? { key: db, source: "db" } : { key: null, source: null };
}

/**
 * Kullanılacak API anahtarı. Sahip: .env, yoksa Ayarlar. Diğer kullanıcılar: kendi kaydettikleri
 * anahtar öncelikli; yoksa sahibin anahtarı paylaşımlı kullanılır (source "owner"; günlük istek
 * sınırına tabidir, bkz. consumeSharedAiQuota). Sahibin anahtarı istemciye asla dönmez.
 */
export async function getApiKey(provider: AiProviderId = "anthropic"): Promise<{ key: string | null; source: KeySource }> {
  const own = await getOwnApiKey(provider);
  if (own.key || (await getCurrentUserId()) === OWNER_USER_ID) return own;
  const o = await ownerKey(provider);
  return o ? { key: o.key, source: "owner" } : { key: null, source: null };
}

export async function hasApiKey(provider: AiProviderId = "anthropic"): Promise<boolean> {
  return (await getApiKey(provider)).key != null;
}

/**
 * İstemciye gösterilecek anahtar durumu: yalnızca kullanıcının KENDİ anahtarı maskeli gösterilir.
 * Sahibin anahtarını paylaşan kullanıcıya yalnızca "owner" kaynağı döner (anahtar, maskeli bile, dönmez).
 */
export async function publicKeyState(provider: AiProviderId): Promise<{ source: KeySource; masked: string | null }> {
  const own = await getOwnApiKey(provider);
  if (own.key) return { source: own.source, masked: maskKey(own.key) };
  const used = await getApiKey(provider);
  return { source: used.source === "owner" ? "owner" : null, masked: null };
}

/** Sahip-dışı kullanıcının hiç kendi anahtarı yok: sahibin yapay zekasını (sağlayıcı + model) paylaşır */
export async function usesSharedAi(): Promise<boolean> {
  if ((await getCurrentUserId()) === OWNER_USER_ID) return false;
  for (const p of AI_PROVIDERS) if ((await getOwnApiKey(p)).key) return false;
  return true;
}

// ---- Paylaşılan yapay zeka: günlük istek sınırı --------------------------------------

export const DEFAULT_SHARED_AI_DAILY_LIMIT = 50;
/** Sahibin anahtarıyla TÜM kullanıcıların toplam günlük istek tavanı (sunucu geneli) */
export const DEFAULT_SHARED_AI_GLOBAL_LIMIT = 300;
const SHARED_LIMIT_KEY = "shared_ai_daily_limit";
const SHARED_GLOBAL_LIMIT_KEY = "shared_ai_global_daily_limit";
const SHARED_USED_PREFIX = "ai_shared_used:";
const SHARED_TOTAL_PREFIX = "ai_shared_total:";

/** Günlük paylaşılan yapay zeka sınırı aşıldı (ValidationError: API'de 400 + Türkçe mesaj) */
export class AiDailyLimitError extends ValidationError {
  constructor(limit: number) {
    super(
      `Bugünkü yapay zeka kullanım sınırına ulaştınız (günde ${limit} istek). Uygulama sahibinin anahtarı paylaşımlı kullanıldığı için bu sınır var. ` +
        "Yarın yeniden kullanabilir ya da Ayarlar'dan kendi API anahtarınızı ekleyerek sınırsız kullanabilirsiniz.",
    );
    this.name = "AiDailyLimitError";
  }
}

/** Sunucu geneli günlük tavan doldu (tüm kullanıcılar için) */
export class AiGlobalLimitError extends ValidationError {
  constructor() {
    super(
      "Uygulama sahibinin yapay zeka erişimi bugün için tüm kullanıcılarda toplam sınıra ulaştı. Yarın yeniden deneyebilir ya da " +
        "Ayarlar'dan kendi API anahtarınızı ekleyerek hemen kullanabilirsiniz.",
    );
    this.name = "AiGlobalLimitError";
  }
}

/** Sahibin anahtarını kullanan diğer kullanıcılar için kullanıcı başına günlük istek sınırı (sahip değiştirir) */
export async function getSharedAiDailyLimit(): Promise<number> {
  const raw = await getGlobalSetting(SHARED_LIMIT_KEY);
  const v = Number(raw);
  return raw != null && Number.isInteger(v) && v >= 0 ? v : DEFAULT_SHARED_AI_DAILY_LIMIT;
}

export async function setSharedAiDailyLimit(raw: unknown): Promise<number> {
  if ((await getCurrentUserId()) !== OWNER_USER_ID) throw new ValidationError("Bu ayarı yalnızca uygulama sahibi değiştirebilir.");
  const n = parseDecimal(raw as string | number);
  if (!Number.isInteger(n) || n < 0 || n > 10_000) throw new ValidationError("Günlük sınır 0 ile 10.000 arasında bir tam sayı olmalı.");
  await setGlobalSetting(SHARED_LIMIT_KEY, String(n));
  return n;
}

/** Sahibin anahtarı için tüm kullanıcıların toplam günlük istek tavanı (0: paylaşım kapalı) */
export async function getSharedAiGlobalLimit(): Promise<number> {
  const raw = await getGlobalSetting(SHARED_GLOBAL_LIMIT_KEY);
  const v = Number(raw);
  return raw != null && Number.isInteger(v) && v >= 0 ? v : DEFAULT_SHARED_AI_GLOBAL_LIMIT;
}

export async function setSharedAiGlobalLimit(raw: unknown): Promise<number> {
  if ((await getCurrentUserId()) !== OWNER_USER_ID) throw new ValidationError("Bu ayarı yalnızca uygulama sahibi değiştirebilir.");
  const n = parseDecimal(raw as string | number);
  if (!Number.isInteger(n) || n < 0 || n > 100_000) throw new ValidationError("Toplam günlük sınır 0 ile 100.000 arasında bir tam sayı olmalı.");
  await setGlobalSetting(SHARED_GLOBAL_LIMIT_KEY, String(n));
  return n;
}

/** Bugün sahibin anahtarıyla (tüm kullanıcılar) yapılan istek sayısı */
export async function sharedAiTotalToday(now = Date.now()): Promise<number> {
  return Number(await getGlobalSetting(SHARED_TOTAL_PREFIX + istanbulDay(now))) || 0;
}

/**
 * Sayacı atomik olarak bir artırır; yalnızca sınırın altındaysa (ON CONFLICT … WHERE). Sınırdaysa
 * satır dönmez → false. Eşzamanlı çağrılar sınırı aşamaz (Postgres satır kilidi / SQLite yazma kilidi).
 */
async function incrementBelow(userId: number, key: string, limit: number, now: number): Promise<boolean> {
  if (limit <= 0) return false;
  const db = await getDb();
  const row = await db.get<{ value: string }>(
    `INSERT INTO settings (user_id, key, value, updated_at) VALUES (?, ?, '1', ?)
     ON CONFLICT(user_id, key) DO UPDATE SET value = CAST(CAST(settings.value AS INTEGER) + 1 AS TEXT), updated_at = excluded.updated_at
       WHERE CAST(settings.value AS INTEGER) < ?
     RETURNING value`,
    [userId, key, sqlNow(now), limit],
  );
  return row != null;
}

const istanbulDay = (ms: number) => new Date(ms).toLocaleDateString("en-CA", { timeZone: "Europe/Istanbul" });

/** Geçerli kullanıcının bugün paylaşılan anahtarla yaptığı istek sayısı */
export async function sharedAiUsedToday(now = Date.now()): Promise<number> {
  return Number(await getSetting(SHARED_USED_PREFIX + istanbulDay(now))) || 0;
}

/**
 * Paylaşılan anahtarla bir yapay zeka işlemi (sohbet mesajı, tarama, özet…) başlamadan çağrılır.
 * İki sayaç atomik olarak artırılır: kullanıcı başına günlük sınır (AiDailyLimitError) ve sahibin
 * anahtarı için sunucu geneli toplam tavan (AiGlobalLimitError; o durumda kullanıcı sayacı geri alınır).
 * Sayaçlar dosyadan geri yüklenemez (dataExport.ts). Sahip için etkisizdir.
 */
export async function consumeSharedAiQuota(now = Date.now()): Promise<void> {
  const uid = await getCurrentUserId();
  if (uid === OWNER_USER_ID) return;
  const db = await getDb();
  const day = istanbulDay(now);
  const userKey = SHARED_USED_PREFIX + day;
  const totalKey = SHARED_TOTAL_PREFIX + day;
  // Eski günlerin sayaçları silinir
  await db.run("DELETE FROM settings WHERE user_id = ? AND key LIKE ? AND key <> ?", [uid, `${SHARED_USED_PREFIX}%`, userKey]);
  await db.run("DELETE FROM settings WHERE user_id = ? AND key LIKE ? AND key <> ?", [GLOBAL_UID, `${SHARED_TOTAL_PREFIX}%`, totalKey]);

  const limit = await getSharedAiDailyLimit();
  if (!(await incrementBelow(uid, userKey, limit, now))) throw new AiDailyLimitError(limit);
  if (!(await incrementBelow(GLOBAL_UID, totalKey, await getSharedAiGlobalLimit(), now))) {
    await db.run("UPDATE settings SET value = CAST(CAST(value AS INTEGER) - 1 AS TEXT) WHERE user_id = ? AND key = ? AND CAST(value AS INTEGER) > 0", [uid, userKey]);
    throw new AiGlobalLimitError();
  }
}

export async function saveApiKey(raw: unknown, provider: AiProviderId = "anthropic") {
  const key = typeof raw === "string" ? raw.trim() : "";
  if (!key) throw new ValidationError("Anahtar boş olamaz.");
  if (provider === "anthropic" && !/^sk-ant-[A-Za-z0-9_\-]{10,}$/.test(key)) {
    throw new ValidationError("Bu bir Claude API anahtarına benzemiyor. Anahtar \"sk-ant-\" ile başlar.");
  }
  if (provider === "openai") {
    if (key.startsWith("sk-ant-")) throw new ValidationError("Bu bir Claude anahtarı. OpenAI anahtarı platform.openai.com'dan alınır.");
    if (!/^sk-[A-Za-z0-9_\-]{20,}$/.test(key)) {
      throw new ValidationError("Bu bir OpenAI API anahtarına benzemiyor. Anahtar \"sk-\" (çoğunlukla \"sk-proj-\") ile başlar.");
    }
  }
  await setSetting(KEY_SETTINGS[provider].setting, key);
}

export async function deleteApiKey(provider: AiProviderId = "anthropic") {
  await deleteSetting(KEY_SETTINGS[provider].setting);
}

export function maskKey(key: string | null): string | null {
  if (!key) return null;
  return `${key.slice(0, 10)}…${key.slice(-4)}`;
}

// ---- Yapay zeka ayarları ----------------------------------------------------

export interface AiSettings {
  /** Etkin yapay zeka sağlayıcısı */
  provider: AiProviderId;
  /** Claude modeli */
  model: AiModelKey;
  /** OpenAI model kimliği (listeden ya da elle) */
  openaiModel: string;
  /** Listede olmayan OpenAI modeli için elle girilen fiyat (yoksa null: tahmin en pahalı bilinen modelle) */
  openaiPrice: ModelPrice | null;
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
  provider: "anthropic",
  model: "ekonomik",
  openaiModel: DEFAULT_OPENAI_MODEL,
  openaiPrice: null,
  scheduleEnabled: true,
  scheduleTimes: ["09:45", "13:00", "18:30"],
  // Ücretsiz RSS + KAP bağlamı önce kullanıldığından varsayılan 2 arama yeterli.
  maxSearches: 2,
  budgetUsd: 10,
};

const AI_SETTINGS_KEY = "ai_settings";

async function readAiSettings(userId: number): Promise<AiSettings> {
  const raw = await readSetting(userId, AI_SETTINGS_KEY);
  if (!raw) return { ...DEFAULT_AI_SETTINGS };
  try {
    return normalizeAiSettings({ ...DEFAULT_AI_SETTINGS, ...(JSON.parse(raw) as Partial<AiSettings>) });
  } catch {
    return { ...DEFAULT_AI_SETTINGS };
  }
}

/**
 * Geçerli kullanıcının yapay zeka ayarları. Kendi anahtarı olmayan (sahibin anahtarını paylaşan)
 * kullanıcıda sağlayıcı ve model sahibin seçimidir; takvim, arama sayısı ve bütçe kullanıcınındır.
 */
export async function getAiSettings(): Promise<AiSettings> {
  const own = await readAiSettings(await getCurrentUserId());
  if (!(await usesSharedAi())) return own;
  const o = await readAiSettings(OWNER_USER_ID);
  return { ...own, provider: o.provider, model: o.model, openaiModel: o.openaiModel, openaiPrice: o.openaiPrice };
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
  const price = s.openaiPrice && typeof s.openaiPrice === "object" ? s.openaiPrice : null;
  return {
    provider: isAiProviderId(s.provider) ? s.provider : DEFAULT_AI_SETTINGS.provider,
    model: isAiModelKey(s.model) ? s.model : DEFAULT_AI_SETTINGS.model,
    openaiModel: isModelId(s.openaiModel) ? s.openaiModel : DEFAULT_OPENAI_MODEL,
    openaiPrice:
      price && Number.isFinite(Number(price.inputPerMTok)) && Number.isFinite(Number(price.outputPerMTok))
        ? { inputPerMTok: Number(price.inputPerMTok), outputPerMTok: Number(price.outputPerMTok) }
        : null,
    scheduleEnabled: !!s.scheduleEnabled,
    scheduleTimes: parseTimes(s.scheduleTimes),
    maxSearches: Math.min(10, Math.max(0, Math.round(Number(s.maxSearches) || 0))),
    budgetUsd: Math.max(0, Number(s.budgetUsd) || 0),
  };
}

/** Kısmi güncelleme. Hatalı değerde ValidationError. */
export async function updateAiSettings(body: Record<string, unknown>): Promise<AiSettings> {
  const cur = await readAiSettings(await getCurrentUserId());
  const next: AiSettings = { ...cur };
  if (body.model !== undefined) {
    if (!isAiModelKey(body.model)) throw new ValidationError("Model geçersiz.");
    next.model = body.model;
  }
  if (body.provider !== undefined) {
    if (!isAiProviderId(body.provider)) throw new ValidationError("Yapay zeka sağlayıcısı geçersiz.");
    next.provider = body.provider;
  }
  if (body.openaiModel !== undefined) {
    const id = typeof body.openaiModel === "string" ? body.openaiModel.trim() : "";
    if (!isModelId(id)) throw new ValidationError("OpenAI model adı geçersiz. Örnek: gpt-5-mini");
    next.openaiModel = id;
  }
  if (body.openaiPrice !== undefined) {
    const p = body.openaiPrice as Record<string, unknown> | null;
    if (p == null || ((p.inputPerMTok ?? "") === "" && (p.outputPerMTok ?? "") === "")) next.openaiPrice = null;
    else {
      const i = parseDecimal(p.inputPerMTok as string | number);
      const o = parseDecimal(p.outputPerMTok as string | number);
      if (!Number.isFinite(i) || !Number.isFinite(o) || i < 0 || o < 0 || i > 1000 || o > 1000) {
        throw new ValidationError("Model fiyatı geçersiz (milyon token başına $, 0–1000).");
      }
      next.openaiPrice = { inputPerMTok: i, outputPerMTok: o };
    }
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
  await setSetting(AI_SETTINGS_KEY, JSON.stringify(next));
  return getAiSettings();
}

// ---- ChatGPT / MCP bağlantısı --------------------------------------------------------

export interface McpSettings {
  /** Yazma araçlarına (işlem, emir, alarm) izin ver */
  allowWrites: boolean;
  /** Tek çağrıda izin verilen en büyük tutar (TL karşılığı) */
  maxAmountTry: number;
}

export const DEFAULT_MCP_SETTINGS: McpSettings = { allowWrites: true, maxAmountTry: 100_000 };
const MCP_SETTINGS_KEY = "mcp_settings";

export async function getMcpSettings(): Promise<McpSettings> {
  try {
    const raw = await getSetting(MCP_SETTINGS_KEY);
    const v = raw ? { ...DEFAULT_MCP_SETTINGS, ...(JSON.parse(raw) as Partial<McpSettings>) } : { ...DEFAULT_MCP_SETTINGS };
    return { allowWrites: !!v.allowWrites, maxAmountTry: Number(v.maxAmountTry) > 0 ? Number(v.maxAmountTry) : DEFAULT_MCP_SETTINGS.maxAmountTry };
  } catch {
    return { ...DEFAULT_MCP_SETTINGS };
  }
}

export async function updateMcpSettings(body: Record<string, unknown>): Promise<McpSettings> {
  const cur = await getMcpSettings();
  if (body.allowWrites !== undefined) cur.allowWrites = !!body.allowWrites;
  if (body.maxAmountTry !== undefined) {
    const n = parseDecimal(body.maxAmountTry as string | number);
    if (!Number.isFinite(n) || n < 1 || n > 100_000_000) throw new ValidationError("Çağrı başına en fazla tutar 1 ile 100.000.000 TL arasında olmalı.");
    cur.maxAmountTry = n;
  }
  await setSetting(MCP_SETTINGS_KEY, JSON.stringify(cur));
  return cur;
}

// ---- Teknik sinyal uyarıları --------------------------------------------------------

const SIGNAL_ALERTS_KEY = "signal_alerts";

/** Günlük teknik sinyal değişimi bildirimi açık mı (varsayılan: açık) */
export async function getSignalAlertsEnabled(): Promise<boolean> {
  return (await getSetting(SIGNAL_ALERTS_KEY)) !== "0";
}

export async function setSignalAlertsEnabled(on: boolean) {
  await setSetting(SIGNAL_ALERTS_KEY, on ? "1" : "0");
}

// ---- KAP bildirimleri ---------------------------------------------------------------

export const KAP_NOTIFY_SCOPES = ["real", "all", "off"] as const;
export type KapNotifyScope = (typeof KAP_NOTIFY_SCOPES)[number];
const KAP_NOTIFY_KEY = "kap_notify";

/** KAP bildirimi: real = yalnızca gerçek portföy hisseleri (varsayılan), all = gerçek + sanal, off = kapalı */
export async function getKapNotifyScope(): Promise<KapNotifyScope> {
  const v = await getSetting(KAP_NOTIFY_KEY);
  return (KAP_NOTIFY_SCOPES as readonly string[]).includes(v ?? "") ? (v as KapNotifyScope) : "real";
}

export async function setKapNotifyScope(v: unknown) {
  if (!(KAP_NOTIFY_SCOPES as readonly unknown[]).includes(v)) throw new ValidationError("KAP bildirim ayarı geçersiz.");
  await setSetting(KAP_NOTIFY_KEY, v as string);
}

// ---- Temettü stopajı (vergi kesintisi) ----------------------------------------------

export interface DividendWithholding {
  /** BIST hisseleri (%); Türkiye'de bireysel yatırımcı için kâr payı stopajı */
  bist: number;
  /** Yabancı hisseler (%); ABD'de W-8BEN formuyla genelde %15 */
  foreign: number;
}

export const DEFAULT_WITHHOLDING: DividendWithholding = { bist: 15, foreign: 15 };
const WITHHOLDING_KEY = "dividend_withholding";

export async function getDividendWithholding(): Promise<DividendWithholding> {
  try {
    const raw = await getSetting(WITHHOLDING_KEY);
    return raw ? { ...DEFAULT_WITHHOLDING, ...(JSON.parse(raw) as Partial<DividendWithholding>) } : { ...DEFAULT_WITHHOLDING };
  } catch {
    return { ...DEFAULT_WITHHOLDING };
  }
}

export async function setDividendWithholding(body: unknown): Promise<DividendWithholding> {
  const b = (body ?? {}) as Record<string, unknown>;
  const cur = await getDividendWithholding();
  for (const k of ["bist", "foreign"] as const) {
    if (b[k] === undefined) continue;
    const n = parseDecimal(b[k] as string | number);
    if (!Number.isFinite(n) || n < 0 || n > 60) throw new ValidationError("Stopaj oranı 0 ile 60 arasında olmalı.");
    cur[k] = n;
  }
  await setSetting(WITHHOLDING_KEY, JSON.stringify(cur));
  return cur;
}
