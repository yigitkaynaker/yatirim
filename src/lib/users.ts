import "server-only";
import { randomBytes, scrypt as scryptCb, timingSafeEqual, type ScryptOptions } from "node:crypto";
import { getDb, sqlNow } from "./db";
import { ValidationError } from "./portfolio";
import { OWNER_USER_ID, runAsUser } from "./userContext";

// Kullanıcı hesapları (çok kullanıcılı mod). Kayıt herkese açıktır; her kullanıcının verisi
// ayrıdır (bkz. userContext.ts). Şifreler node:crypto scrypt ile tuzlanarak özetlenir; özet
// asla istemciye dönmez. Sahip (id 1) tek kullanıcılı dönemden gelir: e-postası yoksa
// APP_PASSWORD ile girer; Ayarlar'dan e-posta + şifre tanımlayabilir.

export const MIN_PASSWORD_LENGTH = 8;
const MAX_PASSWORD_LENGTH = 200;
const SCRYPT_N = 16384;
const SCRYPT_R = 8;
const SCRYPT_P = 1;
const KEYLEN = 64;

function scrypt(password: string, salt: Buffer, opts: ScryptOptions): Promise<Buffer> {
  return new Promise((resolve, reject) =>
    scryptCb(password.normalize("NFKC"), salt, KEYLEN, { ...opts, maxmem: 64 * 1024 * 1024 }, (err, key) => (err ? reject(err) : resolve(key))),
  );
}

/** "scrypt$N$r$p$tuz$özet" (base64) */
export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const key = await scrypt(password, salt, { N: SCRYPT_N, r: SCRYPT_R, p: SCRYPT_P });
  return `scrypt$${SCRYPT_N}$${SCRYPT_R}$${SCRYPT_P}$${salt.toString("base64")}$${key.toString("base64")}`;
}

export async function verifyPassword(password: string, stored: string | null | undefined): Promise<boolean> {
  const parts = (stored ?? "").split("$");
  if (parts.length !== 6 || parts[0] !== "scrypt") {
    // Kullanıcı yoksa da aynı sürede yanıt verilsin (e-posta var mı sızmasın)
    await scrypt(password, Buffer.alloc(16), { N: SCRYPT_N, r: SCRYPT_R, p: SCRYPT_P }).catch(() => null);
    return false;
  }
  const [, n, r, p, saltB64, keyB64] = parts;
  try {
    const expected = Buffer.from(keyB64, "base64");
    const actual = await scrypt(password, Buffer.from(saltB64, "base64"), { N: Number(n), r: Number(r), p: Number(p) });
    return actual.length === expected.length && timingSafeEqual(actual, expected);
  } catch {
    return false;
  }
}

export function normalizeEmail(raw: unknown): string {
  return typeof raw === "string" ? raw.trim().toLowerCase() : "";
}

const EMAIL_RE = /^[^\s@]{1,64}@[^\s@]{1,190}\.[^\s@.]{2,}$/;

export function validateEmail(email: string) {
  if (!email) throw new ValidationError("E-posta adresi girin.");
  if (email.length > 254 || !EMAIL_RE.test(email)) throw new ValidationError("E-posta adresi geçersiz. Örnek: ad@ornek.com");
}

export function validatePassword(password: string) {
  if (password.length < MIN_PASSWORD_LENGTH) throw new ValidationError(`Şifre en az ${MIN_PASSWORD_LENGTH} karakter olmalı.`);
  if (password.length > MAX_PASSWORD_LENGTH) throw new ValidationError(`Şifre en fazla ${MAX_PASSWORD_LENGTH} karakter olabilir.`);
}

/** İstemciye dönebilecek kullanıcı bilgisi (şifre özeti YOK) */
export interface PublicUser {
  id: number;
  email: string | null;
  isOwner: boolean;
  createdAt: string;
}

interface UserRow {
  id: number;
  email: string | null;
  password_hash: string | null;
  created_at: string;
}

const toPublic = (r: UserRow): PublicUser => ({ id: Number(r.id), email: r.email, isOwner: Number(r.id) === OWNER_USER_ID, createdAt: r.created_at });

export async function getUser(id: number): Promise<PublicUser | null> {
  const r = await (await getDb()).get<UserRow>("SELECT id, email, password_hash, created_at FROM users WHERE id = ?", [id]);
  return r ? toPublic(r) : null;
}

/** Arka plan işleri için tüm kullanıcı kimlikleri (artan) */
export async function listUserIds(): Promise<number[]> {
  return (await (await getDb()).all<{ id: number }>("SELECT id FROM users ORDER BY id")).map((r) => Number(r.id));
}

/**
 * Arka plan işleri için: fn'i her kullanıcının bağlamında sırayla çalıştırır. Bir kullanıcıdaki
 * hata diğerlerini durdurmaz (günlüğe yazılır). Dönüş: başarılı sonuçlar.
 */
export async function forEachUser<T>(label: string, fn: (userId: number) => Promise<T>): Promise<T[]> {
  const out: T[] = [];
  for (const uid of await listUserIds()) {
    try {
      out.push(await runAsUser(uid, () => fn(uid)));
    } catch (err) {
      console.error(`[${label}] kullanıcı ${uid} hatası`, err);
    }
  }
  return out;
}

/** Yeni kullanıcı; e-posta kullanılıyorsa ValidationError. Varsayılan "Ana hesap" da oluşturulur. */
export async function createUser(rawEmail: unknown, rawPassword: unknown): Promise<PublicUser> {
  const email = normalizeEmail(rawEmail);
  const password = typeof rawPassword === "string" ? rawPassword : "";
  validateEmail(email);
  validatePassword(password);
  const hash = await hashPassword(password);
  const db = await getDb();
  return db.tx(async () => {
    await db.lockKey(`kayit:${email}`);
    if (await db.get("SELECT 1 AS x FROM users WHERE email = ?", [email])) {
      throw new ValidationError("Bu e-posta ile kayıt olunamıyor. Zaten hesabınız varsa giriş yapın.");
    }
    const now = sqlNow();
    const id = (await db.run("INSERT INTO users (email, password_hash, created_at) VALUES (?, ?, ?) RETURNING id", [email, hash, now])).lastId!;
    await db.run("INSERT INTO accounts (user_id, name, created_at) VALUES (?, 'Ana hesap', ?)", [id, now]);
    return { id, email, isOwner: id === OWNER_USER_ID, createdAt: now };
  });
}

/** E-posta + şifre doğrulaması; hatalıysa null (hangisinin hatalı olduğu söylenmez). */
export async function authenticate(rawEmail: unknown, rawPassword: unknown): Promise<PublicUser | null> {
  const email = normalizeEmail(rawEmail);
  const password = typeof rawPassword === "string" ? rawPassword.slice(0, MAX_PASSWORD_LENGTH + 1) : "";
  const row = email ? await (await getDb()).get<UserRow>("SELECT id, email, password_hash, created_at FROM users WHERE email = ?", [email]) : undefined;
  const ok = await verifyPassword(password, row?.password_hash);
  return ok && row ? toPublic(row) : null;
}

/**
 * Şifre değiştirme: mevcut şifre doğrulanır (sahipte .env APP_PASSWORD da kabul edilir). Hatalı mevcut
 * şifrede false döner (çağıran hız sınırı uygular); e-postası olmayan hesapta ValidationError.
 */
export async function changePassword(userId: number, rawCurrent: unknown, rawNext: unknown): Promise<boolean> {
  const current = typeof rawCurrent === "string" ? rawCurrent.slice(0, MAX_PASSWORD_LENGTH + 1) : "";
  const next = typeof rawNext === "string" ? rawNext : "";
  const db = await getDb();
  const row = await db.get<UserRow>("SELECT id, email, password_hash, created_at FROM users WHERE id = ?", [userId]);
  if (!row) return false;
  if (!row.email) throw new ValidationError("Bu hesabın giriş e-postası yok; önce e-posta ve şifre tanımlayın.");
  validatePassword(next);
  let ok = await verifyPassword(current, row.password_hash);
  if (!ok && userId === OWNER_USER_ID) {
    const { checkPassword } = await import("./auth");
    ok = !!current && (await checkPassword(current));
  }
  if (!ok) return false;
  await db.run("UPDATE users SET password_hash = ? WHERE id = ?", [await hashPassword(next), userId]);
  return true;
}

/** Kullanıcının giriş e-postası ve şifresini tanımlar / değiştirir (sahip Ayarlar'dan kullanır). */
export async function setCredentials(userId: number, rawEmail: unknown, rawPassword: unknown): Promise<PublicUser> {
  const email = normalizeEmail(rawEmail);
  const password = typeof rawPassword === "string" ? rawPassword : "";
  validateEmail(email);
  validatePassword(password);
  const hash = await hashPassword(password);
  const db = await getDb();
  await db.tx(async () => {
    await db.lockKey(`kayit:${email}`);
    if (await db.get("SELECT 1 AS x FROM users WHERE email = ? AND id <> ?", [email, userId])) {
      throw new ValidationError("Bu e-posta başka bir hesapta kullanılıyor.");
    }
    await db.run("UPDATE users SET email = ?, password_hash = ? WHERE id = ?", [email, hash, userId]);
  });
  return (await getUser(userId))!;
}
