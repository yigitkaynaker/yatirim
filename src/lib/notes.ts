import "server-only";
import { getDb, sqlNow } from "./db";
import { isAssetType, isMode, isValidSymbol, normalizeSymbol, type AssetType, type Mode } from "./assets";
import { parseDecimal } from "./format";
import { ValidationError } from "./portfolio";

// POZİSYON NOTU
// Her (gerçek / sanal) pozisyon için: "Neden aldım?", "Ne olursa satarım?" ve isteğe bağlı
// hedef / stop fiyatı. Amaç, alırken verdiğiniz kararı satarken hatırlamak: duygusal
// kararları azaltır. Hedef ve stop fiyatı grafikte çizgi olarak görünür; tek tıkla alarm kurulabilir.

export interface PositionNote {
  mode: Mode;
  assetType: AssetType;
  symbol: string;
  why: string | null;
  exitPlan: string | null;
  /** Varlığın fiyat biriminde */
  targetPrice: number | null;
  stopPrice: number | null;
  updatedAt: string;
}

interface NoteRow {
  mode: Mode;
  asset_type: AssetType;
  symbol: string;
  why: string | null;
  exit_plan: string | null;
  target_price: number | null;
  stop_price: number | null;
  updated_at: string;
}

const fromRow = (r: NoteRow): PositionNote => ({
  mode: r.mode,
  assetType: r.asset_type,
  symbol: r.symbol,
  why: r.why,
  exitPlan: r.exit_plan,
  targetPrice: r.target_price,
  stopPrice: r.stop_price,
  updatedAt: r.updated_at,
});

export async function getNote(mode: Mode, assetType: AssetType, symbol: string): Promise<PositionNote | null> {
  const r = await (await getDb()).get("SELECT * FROM position_notes WHERE mode = ? AND asset_type = ? AND symbol = ?", [mode, assetType, symbol]) as unknown as NoteRow | undefined;
  return r ? fromRow(r) : null;
}

/** Bir varlığın notları (önce gerçek) */
export async function notesForInstrument(assetType: AssetType, symbol: string): Promise<PositionNote[]> {
  const rows = await (await getDb()).all("SELECT * FROM position_notes WHERE asset_type = ? AND symbol = ? ORDER BY CASE mode WHEN 'real' THEN 0 ELSE 1 END", [assetType, symbol]) as unknown as NoteRow[];
  return rows.map(fromRow);
}

function text(v: unknown, max: number): string | null {
  const s = typeof v === "string" ? v.trim() : "";
  return s ? s.slice(0, max) : null;
}

function price(v: unknown, label: string): number | null {
  if (v == null || v === "") return null;
  const n = parseDecimal(v as string | number);
  if (!Number.isFinite(n) || n <= 0) throw new ValidationError(`${label} geçersiz.`);
  return n;
}

/**
 * Notu kaydeder: { mode, assetType, symbol, why?, exitPlan?, targetPrice?, stopPrice? }.
 * Tüm alanlar boşsa not silinir (null döner).
 */
export async function saveNote(body: Record<string, unknown>): Promise<PositionNote | null> {
  if (!isMode(body.mode)) throw new ValidationError("Portföy modu geçersiz.");
  if (!isAssetType(body.assetType)) throw new ValidationError("Varlık türü geçersiz.");
  const symbol = normalizeSymbol(body.assetType, String(body.symbol ?? ""));
  if (!isValidSymbol(body.assetType, symbol)) throw new ValidationError("Sembol geçersiz.");
  const why = text(body.why, 1000);
  const exitPlan = text(body.exitPlan, 1000);
  const targetPrice = price(body.targetPrice, "Hedef fiyat");
  const stopPrice = price(body.stopPrice, "Stop fiyatı");
  if (targetPrice != null && stopPrice != null && stopPrice >= targetPrice) {
    throw new ValidationError("Stop fiyatı hedef fiyattan düşük olmalı (stop: zararı durdurmak için satacağınız fiyat).");
  }
  const db = await getDb();
  if (!why && !exitPlan && targetPrice == null && stopPrice == null) {
    await db.run("DELETE FROM position_notes WHERE mode = ? AND asset_type = ? AND symbol = ?", [body.mode, body.assetType, symbol]);
    return null;
  }
  await db.run(`INSERT INTO position_notes (mode, asset_type, symbol, why, exit_plan, target_price, stop_price, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(mode, asset_type, symbol) DO UPDATE SET why = excluded.why, exit_plan = excluded.exit_plan,
       target_price = excluded.target_price, stop_price = excluded.stop_price, updated_at = excluded.updated_at`, [body.mode, body.assetType, symbol, why, exitPlan, targetPrice, stopPrice, sqlNow()]);
  return await getNote(body.mode, body.assetType, symbol);
}

const near = (a: number, b: number) => Math.abs(a - b) <= Math.max(1e-9, Math.abs(b) * 1e-6);

/**
 * Fiyat alarmı çaldığında bildirime eklenecek not hatırlatması: alarm eşiği bir notun stop
 * (aşağı) ya da hedef (yukarı) fiyatıysa notunuzu hatırlatır.
 */
export async function noteReminder(assetType: AssetType, symbol: string, direction: "up" | "down" | "both", threshold: number | null): Promise<string | null> {
  if (threshold == null) return null;
  for (const n of (await notesForInstrument(assetType, symbol))) {
    const where = n.mode === "virtual" ? " (sanal)" : "";
    if (direction === "down" && n.stopPrice != null && near(n.stopPrice, threshold)) {
      return `Stop fiyatınıza geldi${where}. Satış planınız: ${n.exitPlan ?? "—"}${n.why ? ` · Neden almıştınız: ${n.why}` : ""}`;
    }
    if (direction === "up" && n.targetPrice != null && near(n.targetPrice, threshold)) {
      return `Hedef fiyatınıza ulaştı${where}. Satış planınız: ${n.exitPlan ?? "—"}${n.why ? ` · Neden almıştınız: ${n.why}` : ""}`;
    }
  }
  return null;
}
