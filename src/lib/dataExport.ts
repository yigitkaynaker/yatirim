import "server-only";
import { getDb, SCHEMA_VERSION } from "./db";
import { dumpAll, loadAll, parseDump, rowCounts, type DataDump } from "./db/transfer";
import { ValidationError } from "./portfolio";
import { getCurrentUserId, OWNER_USER_ID } from "./userContext";

/**
 * Sahip-dışı kullanıcının dosyadan geri yükleyebileceği ayarlar. Kota / kullanım sayaçları
 * (ai_shared_used:…) ve ai_usage (aylık bütçe hesabı) dosyadan yüklenemez: aksi hâlde kullanıcı
 * sayacını sıfırlayıp paylaşılan anahtarın sınırını aşabilirdi. Sahip için tüm ayarlar yüklenir.
 */
export const USER_RESTORABLE_SETTINGS: readonly string[] = [
  "ai_settings",
  "mcp_settings",
  "signal_alerts",
  "kap_notify",
  "dividend_withholding",
  "target_allocation",
  "anthropic_api_key",
  "openai_api_key",
  "gemini_api_key",
];
const USER_SKIPPED_TABLES: ReadonlySet<string> = new Set(["ai_usage"]);

// "Tüm verilerimi indir (JSON)" ve "JSON'dan geri yükle" (bulut modunda dosya yedeğinin yerine;
// yerel modda da çalışır). Gizli anahtarlar (Claude API anahtarı, bildirim anahtarları) varsayılan
// olarak dosyaya GİRMEZ; includeSecrets ile açıkça istenirse girer. Geri yüklemede dosyada olmayan
// gizli anahtarlar mevcut değerleriyle korunur. Döküm ve geri yükleme KULLANICI BAŞINADIR: yalnızca
// geçerli kullanıcının verisi okunur / değiştirilir; diğer kullanıcılara dokunulmaz.

export async function exportAllData(opts: { includeCaches?: boolean; includeSecrets?: boolean } = {}): Promise<DataDump> {
  return dumpAll(await getDb(), { includeCaches: opts.includeCaches, includeSecrets: opts.includeSecrets, schemaVersion: SCHEMA_VERSION, userId: await getCurrentUserId() });
}

export interface ImportSummary {
  counts: Record<string, number>;
  transactions: number;
}

/** Dökümü doğrular ve mevcut verilerin YERİNE yazar (tek işlem; hata olursa hiçbir şey değişmez). */
export async function importAllData(raw: unknown): Promise<ImportSummary> {
  let dump: DataDump;
  try {
    dump = parseDump(raw);
  } catch (err) {
    throw new ValidationError((err as Error).message);
  }
  if (dump.schemaVersion > SCHEMA_VERSION) throw new ValidationError("Bu dosya uygulamanın daha yeni bir sürümünden; önce uygulamayı güncelleyin.");
  const db = await getDb();
  const uid = await getCurrentUserId();
  let counts: Record<string, number>;
  try {
    const restricted = uid !== OWNER_USER_ID;
    ({ counts } = await loadAll(db, dump, {
      replace: true,
      userId: uid,
      ...(restricted ? { allowedSettings: USER_RESTORABLE_SETTINGS, skipTables: USER_SKIPPED_TABLES } : {}),
    }));
  } catch (err) {
    if (err instanceof ValidationError) throw err;
    const msg = (err as Error)?.message ?? "";
    if (/bu hesaba ait olmayan/.test(msg)) throw new ValidationError(msg);
    if (/UNIQUE|unique|duplicate|PRIMARY/i.test(msg)) {
      throw new ValidationError("Dosyadaki kayıt numaraları bu sunucudaki başka kayıtlarla çakışıyor; dosya yüklenemedi (hiçbir şey değişmedi).");
    }
    throw err;
  }
  const after = await rowCounts(db, ["transactions"], uid);
  return { counts, transactions: after.transactions };
}
