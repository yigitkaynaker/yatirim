import "server-only";
import { getDb } from "./db";
import { parseDecimal } from "./format";
import { ValidationError } from "./portfolio";

// HESAPLAR
// Varlıklarınızı tuttuğunuz yerler: aracı kurum (Midas, İş Yatırım…), banka, altın kasası,
// kripto borsası. Her gerçek işlem / emir / temettü / alarm bir hesaba aittir.
// Sanal portföy hesap kullanmaz. "Toplama dahil" kapalı hesap, ana toplamda görünmez
// (örn. başkası adına tuttuğunuz bir hesap). Arşivlenen hesap seçim listelerinde çıkmaz.

export interface Account {
  id: number;
  name: string;
  includeInTotal: boolean;
  archived: boolean;
  /** Varsayılan komisyon oranı (%): yeni işlemde komisyon alanı bununla dolar */
  feePct: number;
  sortOrder: number;
  createdAt: string;
}

interface AccountRow {
  id: number;
  name: string;
  include_in_total: number;
  archived: number;
  fee_pct: number;
  sort_order: number;
  created_at: string;
}

const fromRow = (r: AccountRow): Account => ({
  id: r.id,
  name: r.name,
  includeInTotal: r.include_in_total === 1,
  archived: r.archived === 1,
  feePct: r.fee_pct,
  sortOrder: r.sort_order,
  createdAt: r.created_at,
});

export function listAccounts(opts: { includeArchived?: boolean } = {}): Account[] {
  const rows = getDb()
    .prepare(`SELECT * FROM accounts ${opts.includeArchived ? "" : "WHERE archived = 0"} ORDER BY sort_order, id`)
    .all() as unknown as AccountRow[];
  return rows.map(fromRow);
}

export function getAccount(id: number): Account | null {
  const r = getDb().prepare("SELECT * FROM accounts WHERE id = ?").get(id) as unknown as AccountRow | undefined;
  return r ? fromRow(r) : null;
}

/** Varsayılan hesap: arşivlenmemiş ilk hesap (yoksa ilk hesap; hiç yoksa "Ana hesap" oluşturulur). */
export function defaultAccount(): Account {
  const db = getDb();
  const r =
    (db.prepare("SELECT * FROM accounts WHERE archived = 0 ORDER BY sort_order, id LIMIT 1").get() as unknown as AccountRow | undefined) ??
    (db.prepare("SELECT * FROM accounts ORDER BY sort_order, id LIMIT 1").get() as unknown as AccountRow | undefined);
  if (r) return fromRow(r);
  const res = db.prepare("INSERT INTO accounts (name) VALUES ('Ana hesap')").run();
  return getAccount(Number(res.lastInsertRowid))!;
}

function findByName(name: string): Account | null {
  const r = getDb().prepare("SELECT * FROM accounts WHERE name = ? COLLATE NOCASE").get(name.trim()) as unknown as AccountRow | undefined;
  return r ? fromRow(r) : null;
}

/**
 * Gövdedeki hesabı çözer: accountId (sayı) ya da account (ad). Verilmezse varsayılan hesap.
 * Arşivli hesaba yeni kayıt eklenmez (allowArchived: düzenleme / içe aktarma için).
 */
export function resolveAccount(raw: { accountId?: unknown; account?: unknown }, opts: { allowArchived?: boolean } = {}): Account {
  let acc: Account | null = null;
  if (raw.accountId != null && raw.accountId !== "") {
    const id = Number(raw.accountId);
    if (!Number.isInteger(id) || id <= 0) throw new ValidationError("Hesap geçersiz.");
    acc = getAccount(id);
    if (!acc) throw new ValidationError("Hesap bulunamadı.");
  } else if (raw.account != null && !(typeof raw.account === "string" && !raw.account.trim())) {
    // account: hesap adı ya da numarası (id). Verilip bulunamazsa varsayılana düşülmez, hata verilir.
    const text = typeof raw.account === "string" || typeof raw.account === "number" ? String(raw.account).trim() : "";
    if (!text) throw new ValidationError("Hesap geçersiz (hesap adı ya da numarası bekleniyor).");
    acc = findByName(text);
    if (!acc && /^\d+$/.test(text)) acc = getAccount(Number(text));
    if (!acc) {
      const names = listAccounts().map((a) => a.name).join(", ");
      throw new ValidationError(`"${text}" adında ya da numarasında hesap yok. Hesaplar: ${names}.`);
    }
  } else {
    acc = defaultAccount();
  }
  if (acc.archived && !opts.allowArchived) throw new ValidationError(`"${acc.name}" hesabı arşivlenmiş; önce Ayarlar'dan geri alın.`);
  return acc;
}

function parseName(v: unknown): string {
  const name = typeof v === "string" ? v.trim().replace(/\s+/g, " ") : "";
  if (!name) throw new ValidationError("Hesap adı boş olamaz.");
  if (name.length > 40) throw new ValidationError("Hesap adı en fazla 40 karakter olabilir.");
  return name;
}

function parseFeePct(v: unknown): number {
  if (v == null || v === "") return 0;
  const n = parseDecimal(v as string | number);
  if (!Number.isFinite(n) || n < 0 || n > 10) throw new ValidationError("Komisyon oranı %0 ile %10 arasında olmalı (örn. 0,2).");
  return n;
}

function assertUniqueName(name: string, exceptId?: number) {
  const other = findByName(name);
  if (other && other.id !== exceptId) throw new ValidationError(`"${name}" adında bir hesap zaten var.`);
}

/** Yeni hesap: { name, feePct?, includeInTotal? } */
export function createAccount(body: Record<string, unknown>): Account {
  const name = parseName(body.name);
  assertUniqueName(name);
  const feePct = parseFeePct(body.feePct);
  const include = body.includeInTotal === false ? 0 : 1;
  const db = getDb();
  const { m } = db.prepare("SELECT COALESCE(MAX(sort_order), 0) AS m FROM accounts").get() as { m: number };
  const res = db.prepare("INSERT INTO accounts (name, fee_pct, include_in_total, sort_order) VALUES (?, ?, ?, ?)").run(name, feePct, include, m + 1);
  return getAccount(Number(res.lastInsertRowid))!;
}

/** Hesabın açık pozisyonu var mı (gerçek, aktif işlemlerden) */
function hasOpenPositions(id: number): boolean {
  const rows = getDb()
    .prepare(
      `SELECT asset_type, symbol, SUM(CASE WHEN side = 'buy' THEN quantity ELSE -quantity END) AS q
       FROM transactions WHERE mode = 'real' AND account_id = ? AND converted_at IS NULL GROUP BY asset_type, symbol`,
    )
    .all(id) as { q: number }[];
  return rows.some((r) => r.q > 1e-9);
}

/** Hesabı günceller: { name?, feePct?, includeInTotal?, archived? }. Bulunamazsa null. */
export function updateAccount(id: number, body: Record<string, unknown>): Account | null {
  const acc = getAccount(id);
  if (!acc) return null;
  const db = getDb();
  if (body.name !== undefined) {
    const name = parseName(body.name);
    assertUniqueName(name, id);
    db.prepare("UPDATE accounts SET name = ? WHERE id = ?").run(name, id);
  }
  if (body.feePct !== undefined) db.prepare("UPDATE accounts SET fee_pct = ? WHERE id = ?").run(parseFeePct(body.feePct), id);
  if (body.includeInTotal !== undefined) db.prepare("UPDATE accounts SET include_in_total = ? WHERE id = ?").run(body.includeInTotal ? 1 : 0, id);
  if (body.archived !== undefined) {
    const archive = !!body.archived;
    if (archive && !acc.archived) {
      const active = listAccounts().filter((a) => a.id !== id);
      if (active.length === 0) throw new ValidationError("En az bir etkin hesap kalmalı.");
      if (hasOpenPositions(id)) {
        throw new ValidationError(
          `"${acc.name}" hesabında açık pozisyon var. Arşivlemek yerine "Toplama dahil" anahtarını kapatabilir ya da önce pozisyonları satabilirsiniz.`,
        );
      }
      const pending = db.prepare("SELECT COUNT(*) AS c FROM orders WHERE account_id = ? AND status = 'pending'").get(id) as { c: number };
      if (pending.c > 0) throw new ValidationError(`"${acc.name}" hesabında bekleyen emir var; önce iptal edin.`);
    }
    db.prepare("UPDATE accounts SET archived = ? WHERE id = ?").run(archive ? 1 : 0, id);
  }
  return getAccount(id);
}

/** Hesap adları (id → ad), arşivliler dahil */
export function accountNames(): Map<number, string> {
  return new Map(listAccounts({ includeArchived: true }).map((a) => [a.id, a.name]));
}
