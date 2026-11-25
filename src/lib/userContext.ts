import "server-only";
import { AsyncLocalStorage } from "node:async_hooks";
import { readSessionToken, SESSION_COOKIE } from "./auth";

// Geçerli kullanıcı (çok kullanıcılı mod). Her kullanıcı yalnızca kendi verisini görür: kullanıcıya ait
// tüm sorgular getCurrentUserId() ile kapsamlanır. Kimlik iki yerden gelir:
//  1) Açık bağlam (AsyncLocalStorage): runAsUser() — arka plan işleri (nöbet, izleyici), MCP
//     (Bearer belirteç) ve route handler sarmalayıcısı (api.ts handle) bunu kurar. Bağlam, içinde
//     başlatılan tüm eşzamansız işlere (arka plan bildirimleri dahil) taşınır.
//  2) İstek çerezi: sunucu bileşenleri (sayfalar) ve sarmalayıcısız route'lar için imzalı oturum
//     çerezi (HMAC) doğrulanır. Çerez yoksa / geçersizse UnauthorizedError.
// İkisi de yoksa (ör. bağlamsız arka plan kodu) hata fırlatılır; ASLA varsayılan kullanıcıya düşülmez.

/** Mevcut sahibin (tek kullanıcılı dönemden kalan tüm veri ona atanır) kullanıcı kimliği */
export const OWNER_USER_ID = 1;

export class UnauthorizedError extends Error {
  constructor(message = "Oturum gerekli.") {
    super(message);
    this.name = "UnauthorizedError";
  }
}

/** Yalnızca sahibin yapabileceği işlem (API'de 403) */
export class ForbiddenError extends Error {
  constructor(message = "Bu işlemi yalnızca uygulama sahibi yapabilir.") {
    super(message);
    this.name = "ForbiddenError";
  }
}

const als = new AsyncLocalStorage<{ userId: number }>();

function checkId(userId: number): number {
  if (!Number.isInteger(userId) || userId <= 0) throw new Error(`Geçersiz kullanıcı kimliği: ${userId}`);
  return userId;
}

/** fn'i verilen kullanıcının bağlamında çalıştırır (içindeki tüm getCurrentUserId() çağrıları bu kimliği görür). */
export function runAsUser<T>(userId: number, fn: () => T): T {
  return als.run({ userId: checkId(userId) }, fn);
}

/**
 * Yalnızca test betikleri için: geçerli eşzamansız akışın geri kalanını bu kullanıcıyla çalıştırır
 * (AsyncLocalStorage.enterWith). Uygulama kodunda kullanmayın; runAsUser kullanın.
 */
export function enterUserForScripts(userId: number): void {
  als.enterWith({ userId: checkId(userId) });
}

/** Açık bağlamdaki kullanıcı (yoksa null; çereze bakmaz) */
export function contextUserId(): number | null {
  return als.getStore()?.userId ?? null;
}

/** İstek çerezindeki oturumun kullanıcısı (istek dışında ya da oturum yoksa null) */
export async function sessionUserId(): Promise<number | null> {
  let token: string | undefined;
  try {
    const { cookies } = await import("next/headers");
    token = (await cookies()).get(SESSION_COOKIE)?.value;
  } catch {
    return null;
  }
  const s = await readSessionToken(token);
  return s?.uid ?? null;
}

/** Geçerli kullanıcının kimliği. Bağlam da oturum da yoksa UnauthorizedError. */
export async function getCurrentUserId(): Promise<number> {
  const ctx = contextUserId();
  if (ctx != null) return ctx;
  const uid = await sessionUserId();
  if (uid != null) return uid;
  throw new UnauthorizedError();
}

/** Geçerli kullanıcı sahip mi (.env'deki API anahtarları ve sunucu yedekleri yalnızca sahibe açıktır) */
export async function isOwner(): Promise<boolean> {
  return (await getCurrentUserId()) === OWNER_USER_ID;
}

/** Sahip değilse ForbiddenError (sunucu geneli işlemler: tüm veritabanının dosya yedeği / geri yüklemesi) */
export async function requireOwner(): Promise<void> {
  if (!(await isOwner())) throw new ForbiddenError();
}
