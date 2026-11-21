import "server-only";
import { getDb, SCHEMA_VERSION } from "./db";
import { dumpAll, loadAll, parseDump, rowCounts, type DataDump } from "./db/transfer";
import { ValidationError } from "./portfolio";

// "Tüm verilerimi indir (JSON)" ve "JSON'dan geri yükle" (bulut modunda dosya yedeğinin yerine;
// yerel modda da çalışır). Dosya API anahtarı ve bildirim anahtarları dahil tüm ayarları içerir.

export async function exportAllData(opts: { includeCaches?: boolean } = {}): Promise<DataDump> {
  return dumpAll(await getDb(), { includeCaches: opts.includeCaches, schemaVersion: SCHEMA_VERSION });
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
  const { counts } = await loadAll(db, dump, { replace: true });
  const after = await rowCounts(db, ["transactions"]);
  return { counts, transactions: after.transactions };
}
