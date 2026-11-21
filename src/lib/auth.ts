// İmzalı oturum çerezi (HMAC-SHA256, Web Crypto). Hem proxy'de hem route
// handler'larda çalışır. Çerez içeriği: base64url(payload).base64url(imza)

export const SESSION_COOKIE = "yatirim_oturum";
export const SESSION_MAX_AGE_S = 60 * 60 * 24 * 30; // 30 gün

interface SessionPayload {
  /** bitiş zamanı (unix sn) */
  exp: number;
  /** oluşturulma zamanı (unix sn) */
  iat: number;
}

const enc = new TextEncoder();

function getSecret(): string {
  const s = process.env.SESSION_SECRET;
  if (!s || s.length < 16) throw new Error("SESSION_SECRET tanımlı değil ya da çok kısa (.env dosyasını kontrol edin).");
  return s;
}

function b64url(bytes: Uint8Array): string {
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromB64url(s: string): Uint8Array<ArrayBuffer> {
  const bin = atob(s.replace(/-/g, "+").replace(/_/g, "/"));
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

let keyPromise: Promise<CryptoKey> | null = null;
let keyFor: string | null = null;
function hmacKey(): Promise<CryptoKey> {
  const secret = getSecret();
  if (!keyPromise || keyFor !== secret) {
    keyFor = secret;
    keyPromise = crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, [
      "sign",
      "verify",
    ]);
  }
  return keyPromise;
}

export async function createSessionToken(): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const payload: SessionPayload = { iat: now, exp: now + SESSION_MAX_AGE_S };
  const body = b64url(enc.encode(JSON.stringify(payload)));
  const sig = new Uint8Array(await crypto.subtle.sign("HMAC", await hmacKey(), enc.encode(body)));
  return `${body}.${b64url(sig)}`;
}

export async function verifySessionToken(token: string | undefined | null): Promise<boolean> {
  if (!token) return false;
  const [body, sig] = token.split(".");
  if (!body || !sig) return false;
  try {
    const ok = await crypto.subtle.verify("HMAC", await hmacKey(), fromB64url(sig), enc.encode(body));
    if (!ok) return false;
    const payload = JSON.parse(new TextDecoder().decode(fromB64url(body))) as SessionPayload;
    return typeof payload.exp === "number" && payload.exp > Date.now() / 1000;
  } catch {
    return false;
  }
}

/** Zamanlamaya dayanıklı şifre karşılaştırması (iki tarafın HMAC'ini karşılaştırır). */
export async function checkPassword(input: string): Promise<boolean> {
  const expected = process.env.APP_PASSWORD;
  if (!expected) throw new Error("APP_PASSWORD tanımlı değil (.env dosyasını kontrol edin).");
  const key = await hmacKey();
  const [a, b] = await Promise.all([
    crypto.subtle.sign("HMAC", key, enc.encode(input)),
    crypto.subtle.sign("HMAC", key, enc.encode(expected)),
  ]);
  const x = new Uint8Array(a);
  const y = new Uint8Array(b);
  let diff = x.length ^ y.length;
  for (let i = 0; i < x.length; i++) diff |= x[i] ^ y[i];
  return diff === 0;
}

/**
 * Oturum çerezi "Secure" olsun mu: HTTPS isteklerinde ve her zaman Vercel'de (üretim).
 * COOKIE_SECURE=1 ile zorlanabilir. Yerelde düz HTTP (Tailscale IP) ile giriş çalışmaya devam eder.
 */
export function secureCookie(req: Request): boolean {
  return process.env.VERCEL === "1" || process.env.COOKIE_SECURE === "1" || isSecureRequest(req);
}

/** İstek HTTPS üzerinden mi geldi (Tailscale serve gibi bir ters vekil dahil)? */
export function isSecureRequest(req: Request): boolean {
  const proto = req.headers.get("x-forwarded-proto");
  if (proto) return proto.split(",")[0].trim() === "https";
  return new URL(req.url).protocol === "https:";
}
