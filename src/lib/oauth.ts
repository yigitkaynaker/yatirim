import "server-only";
import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { getDb } from "./db";
import { readSessionToken, SESSION_COOKIE } from "./auth";
import { getCurrentUserId } from "./userContext";
import { getMcpSettings } from "./settings";

// TEK KULLANICILI OAuth 2.1 YETKİLENDİRME SUNUCUSU (ChatGPT / Claude.ai MCP bağlayıcısı için)
// - Meta veriler: /.well-known/oauth-protected-resource (RFC 9728) ve
//   /.well-known/oauth-authorization-server (RFC 8414).
// - Dinamik istemci kaydı (RFC 7591): /api/oauth/register
// - /api/oauth/authorize: uygulamanın normal oturumunu ister, Türkçe izin sayfası ("İzin ver").
// - /api/oauth/token: authorization_code (PKCE S256 zorunlu, kod tek kullanımlık ve kısa ömürlü)
//   ve refresh_token (her kullanımda yenilenir).
// - Belirteçler opaktır; veritabanında yalnızca SHA-256 özeti tutulur. Her MCP çağrısında
//   belirtecin hedef kaynağı (resource / audience) bu sunucunun MCP adresiyle karşılaştırılır.
// - Claude.ai'nin "başlık" seçeneği için Ayarlar'da üretilen statik Bearer anahtarı da desteklenir.
// Tüm işleyiciler web standardı Request → Response'tur (route dosyaları ince sarmalayıcıdır; testler
// doğrudan çağırır).

export const CODE_TTL_MS = 2 * 60_000;
export const ACCESS_TTL_MS = 60 * 60_000;
export const REFRESH_TTL_MS = 30 * 24 * 60 * 60_000;
export const SCOPE = "yatirim";
/** /api/oauth/register: IP başına art arda en fazla bu kadar kayıt (dakikada bir hak geri gelir) */
export const OAUTH_REGISTER_LIMIT = 10;
const MAX_CLIENTS = 100;

const sha256 = (s: string) => createHash("sha256").update(s).digest("hex");
const randomToken = (prefix: string) => `${prefix}${randomBytes(32).toString("base64url")}`;

// ---- Adresler -----------------------------------------------------------------------------

/** Uygulamanın dışarıdan görünen kökü: APP_PUBLIC_URL, yoksa ters vekil başlıkları / istek adresi. */
export function publicOrigin(req: Request): string {
  const env = process.env.APP_PUBLIC_URL?.trim();
  if (env) return env.replace(/\/+$/, "");
  const u = new URL(req.url);
  const host = req.headers.get("x-forwarded-host")?.split(",")[0].trim() || req.headers.get("host") || u.host;
  const proto = req.headers.get("x-forwarded-proto")?.split(",")[0].trim() || u.protocol.replace(":", "");
  return `${proto}://${host}`;
}

export const mcpResourceUrl = (origin: string) => `${origin}/api/mcp`;
export const resourceMetadataUrl = (origin: string) => `${origin}/.well-known/oauth-protected-resource/api/mcp`;

/** İstemcinin gönderdiği resource değeri bu MCP sunucusu mu (sondaki / önemsiz) */
function sameResource(a: string, b: string): boolean {
  return a.replace(/\/+$/, "") === b.replace(/\/+$/, "");
}

// ---- Yanıt yardımcıları ------------------------------------------------------------------

const NO_STORE = { "Cache-Control": "no-store", Pragma: "no-cache" };

export function json(body: unknown, status = 200, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json; charset=utf-8", ...NO_STORE, ...headers } });
}

function oauthError(error: string, description: string, status = 400): Response {
  return json({ error, error_description: description }, status);
}

/** MCP çağrısı yetkisiz: 401 + WWW-Authenticate (resource_metadata). */
export function unauthorized(req: Request, error?: "invalid_token", description?: string): Response {
  const origin = publicOrigin(req);
  let h = `Bearer resource_metadata="${resourceMetadataUrl(origin)}", scope="${SCOPE}"`;
  if (error) h += `, error="${error}", error_description="${(description ?? "Belirteç geçersiz ya da süresi dolmuş.").replace(/"/g, "'")}"`;
  return json(
    { jsonrpc: "2.0", error: { code: -32001, message: description ?? "Yetkilendirme gerekli." }, id: null },
    401,
    { "WWW-Authenticate": h },
  );
}

// ---- Meta veriler -------------------------------------------------------------------------

export function protectedResourceMetadata(req: Request) {
  const origin = publicOrigin(req);
  return {
    resource: mcpResourceUrl(origin),
    authorization_servers: [origin],
    scopes_supported: [SCOPE],
    bearer_methods_supported: ["header"],
    resource_name: "Yatırım",
  };
}

export function authServerMetadata(req: Request) {
  const origin = publicOrigin(req);
  return {
    issuer: origin,
    authorization_endpoint: `${origin}/api/oauth/authorize`,
    token_endpoint: `${origin}/api/oauth/token`,
    registration_endpoint: `${origin}/api/oauth/register`,
    response_types_supported: ["code"],
    response_modes_supported: ["query"],
    grant_types_supported: ["authorization_code", "refresh_token"],
    code_challenge_methods_supported: ["S256"],
    token_endpoint_auth_methods_supported: ["none", "client_secret_post", "client_secret_basic"],
    scopes_supported: [SCOPE],
  };
}

// ---- İstemciler (DCR) ------------------------------------------------------------------------

interface ClientRow {
  id: string;
  name: string | null;
  redirect_uris: string;
  secret_hash: string | null;
  created_at: number;
}

async function getClient(id: string): Promise<(ClientRow & { redirects: string[] }) | null> {
  if (!id) return null;
  const row = await (await getDb()).get<ClientRow>("SELECT * FROM oauth_clients WHERE id = ?", [id]);
  if (!row) return null;
  let redirects: string[] = [];
  try {
    redirects = JSON.parse(row.redirect_uris) as string[];
  } catch {}
  return { ...row, redirects };
}

function validRedirect(u: unknown): u is string {
  if (typeof u !== "string" || u.length > 500) return false;
  try {
    const url = new URL(u);
    if (url.hash) return false;
    if (url.protocol === "https:") return true;
    return url.protocol === "http:" && ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
  } catch {
    return false;
  }
}

/** POST /api/oauth/register — RFC 7591 dinamik istemci kaydı */
export async function handleRegister(req: Request): Promise<Response> {
  // IP başına hız sınırı (giriş sayacıyla aynı mekanizma, "oauth-kayit:" önekli): art arda en fazla 10 kayıt
  const { clientKey, recordLoginFailure } = await import("./loginThrottle");
  if ((await recordLoginFailure(`oauth-kayit:${clientKey(req)}`).catch(() => 1)) > OAUTH_REGISTER_LIMIT) {
    return oauthError("invalid_client_metadata", "Çok fazla istemci kaydı denemesi; birkaç dakika sonra tekrar deneyin.", 429);
  }
  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body || typeof body !== "object") return oauthError("invalid_client_metadata", "Geçersiz istek gövdesi.");
  const uris = body.redirect_uris;
  if (!Array.isArray(uris) || uris.length === 0 || uris.length > 10 || !uris.every(validRedirect)) {
    return oauthError("invalid_redirect_uri", "redirect_uris, https (ya da localhost) adreslerinden oluşan bir liste olmalı.");
  }
  const method = typeof body.token_endpoint_auth_method === "string" ? body.token_endpoint_auth_method : "none";
  if (!["none", "client_secret_post", "client_secret_basic"].includes(method)) {
    return oauthError("invalid_client_metadata", "Desteklenmeyen token_endpoint_auth_method.");
  }
  const name = typeof body.client_name === "string" ? body.client_name.trim().slice(0, 100) || null : null;
  const db = await getDb();
  const now = Date.now();
  // Hiç bağlanmamış (belirteç almamış) 1 günden eski kayıtları temizle; toplam kayıt sınırlı.
  await db.run(
    "DELETE FROM oauth_clients WHERE created_at < ? AND NOT EXISTS (SELECT 1 FROM oauth_tokens t WHERE t.client_id = oauth_clients.id)",
    [now - 24 * 3600_000],
  );
  const count = (await db.get<{ c: number }>("SELECT COUNT(*) AS c FROM oauth_clients"))?.c ?? 0;
  if (count >= MAX_CLIENTS) return oauthError("invalid_client_metadata", "Çok fazla kayıtlı istemci var. Ayarlar'dan eski bağlantıları kaldırın.");

  const id = `yat_c_${randomBytes(16).toString("base64url")}`;
  const secret = method === "none" ? null : randomToken("yat_cs_");
  await db.run("INSERT INTO oauth_clients (id, name, redirect_uris, secret_hash, created_at) VALUES (?, ?, ?, ?, ?)", [
    id,
    name,
    JSON.stringify(uris),
    secret ? sha256(secret) : null,
    now,
  ]);
  return json(
    {
      client_id: id,
      client_id_issued_at: Math.floor(now / 1000),
      client_name: name ?? undefined,
      redirect_uris: uris,
      grant_types: ["authorization_code", "refresh_token"],
      response_types: ["code"],
      token_endpoint_auth_method: method,
      ...(secret ? { client_secret: secret, client_secret_expires_at: 0 } : {}),
    },
    201,
  );
}

// ---- Yetkilendirme (izin sayfası) -------------------------------------------------------------

function cookieValue(req: Request, name: string): string | null {
  const raw = req.headers.get("cookie") ?? "";
  for (const part of raw.split(";")) {
    const [k, ...v] = part.trim().split("=");
    if (k === name) return decodeURIComponent(v.join("="));
  }
  return null;
}

async function sessionOf(req: Request): Promise<string | null> {
  return (await sessionWithUser(req))?.token ?? null;
}

/** Oturum çerezi (imzası geçerliyse) ve kullanıcısı; yetki kodu bu kullanıcıya verilir */
async function sessionWithUser(req: Request): Promise<{ token: string; uid: number } | null> {
  const token = cookieValue(req, SESSION_COOKIE);
  const s = token ? await readSessionToken(token) : null;
  return token && s ? { token, uid: s.uid } : null;
}

function csrfFor(session: string, clientId: string): string {
  return createHmac("sha256", process.env.SESSION_SECRET ?? "").update(`oauth-izin:${session}:${clientId}`).digest("base64url");
}

function safeEqual(a: string, b: string): boolean {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

interface AuthorizeReq {
  client: ClientRow & { redirects: string[] };
  redirectUri: string;
  state: string | null;
  challenge: string;
  resource: string;
}

type AuthorizeCheck = { ok: true; value: AuthorizeReq } | { ok: false; fatal: string } | { ok: false; redirect: string };

/** Ortak parametre denetimi. fatal: yönlendirme adresine güvenilemez (sayfa gösterilir). */
async function checkAuthorize(p: URLSearchParams, origin: string): Promise<AuthorizeCheck> {
  const client = await getClient(p.get("client_id") ?? "");
  if (!client) return { ok: false, fatal: "Bu bağlantı isteği tanınmıyor (istemci kayıtlı değil). ChatGPT'de bağlayıcıyı yeniden ekleyin." };
  const given = p.get("redirect_uri");
  const redirectUri = given ?? (client.redirects.length === 1 ? client.redirects[0] : "");
  if (!redirectUri || !client.redirects.includes(redirectUri)) return { ok: false, fatal: "Yönlendirme adresi bu istemci için kayıtlı değil." };
  const state = p.get("state");
  const back = (error: string, description: string) => {
    const u = new URL(redirectUri);
    u.searchParams.set("error", error);
    u.searchParams.set("error_description", description);
    if (state) u.searchParams.set("state", state);
    u.searchParams.set("iss", origin);
    return { ok: false as const, redirect: u.toString() };
  };
  if (p.get("response_type") !== "code") return back("unsupported_response_type", "Yalnızca response_type=code desteklenir.");
  const challenge = p.get("code_challenge") ?? "";
  if (p.get("code_challenge_method") !== "S256" || !/^[A-Za-z0-9_-]{43,128}$/.test(challenge)) {
    return back("invalid_request", "PKCE (code_challenge_method=S256) zorunludur.");
  }
  const resource = mcpResourceUrl(origin);
  const asked = p.get("resource");
  if (asked && !sameResource(asked, resource)) return back("invalid_target", "resource bu MCP sunucusu değil.");
  return { ok: true, value: { client, redirectUri, state, challenge, resource } };
}

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

function page(title: string, body: string, status = 200): Response {
  const html = `<!doctype html><html lang="tr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(title)} · Yatırım</title>
<style>
:root{color-scheme:dark}body{margin:0;background:#0b0f17;color:#e2e8f0;font:15px/1.5 system-ui,-apple-system,"Segoe UI",sans-serif;display:flex;min-height:100vh;align-items:center;justify-content:center;padding:16px;box-sizing:border-box}
.card{max-width:440px;width:100%;background:#121826;border:1px solid #1f2937;border-radius:16px;padding:24px}
h1{font-size:20px;margin:0 0 8px}p{margin:8px 0;color:#94a3b8}b{color:#e2e8f0}ul{padding-left:20px;color:#cbd5e1}li{margin:4px 0}
.row{display:flex;gap:8px;margin-top:20px}button{flex:1;border-radius:12px;padding:12px;font:inherit;font-weight:600;cursor:pointer;border:1px solid #334155;background:#1e293b;color:#e2e8f0}
button.ok{background:#7c3aed;border-color:#7c3aed;color:#fff}.warn{background:#422006;border:1px solid #713f12;color:#fde68a;border-radius:12px;padding:10px 12px;font-size:13px}
code{background:#0b0f17;padding:2px 6px;border-radius:6px}
</style></head><body><main class="card">${body}</main></body></html>`;
  return new Response(html, { status, headers: { "Content-Type": "text/html; charset=utf-8", ...NO_STORE, "X-Frame-Options": "DENY", "Content-Security-Policy": "frame-ancestors 'none'" } });
}

const errorPage = (msg: string, status = 400) => page("Bağlantı kurulamadı", `<h1>Bağlantı kurulamadı</h1><p>${esc(msg)}</p>`, status);

/** GET /api/oauth/authorize — oturum yoksa girişe yönlendirir; varsa Türkçe izin sayfası. */
export async function handleAuthorizeGet(req: Request): Promise<Response> {
  const origin = publicOrigin(req);
  const url = new URL(req.url);
  const session = await sessionOf(req);
  if (!session) {
    const next = `${url.pathname}${url.search}`;
    return new Response(null, { status: 302, headers: { Location: `${origin}/login?next=${encodeURIComponent(next)}`, ...NO_STORE } });
  }
  const c = await checkAuthorize(url.searchParams, origin);
  if (!c.ok) return "fatal" in c ? errorPage(c.fatal) : new Response(null, { status: 302, headers: { Location: c.redirect } });
  const { client, redirectUri } = c.value;
  const mcp = await getMcpSettings();
  const host = new URL(redirectUri).host;
  const appName = client.name ?? (host.includes("chatgpt") || host.includes("openai") ? "ChatGPT" : host.includes("claude") ? "Claude" : host);
  const hidden = [...url.searchParams.entries()]
    .filter(([k]) => ["client_id", "redirect_uri", "response_type", "code_challenge", "code_challenge_method", "state", "scope", "resource"].includes(k))
    .map(([k, v]) => `<input type="hidden" name="${esc(k)}" value="${esc(v)}">`)
    .join("");
  const writes = mcp.allowWrites
    ? `<li>Açıkça istediğinde <b>işlem yapabilir</b>: sanal pozisyon açma, işlem ekleme, emir verme / iptal, alarm kurma / silme (çağrı başına en fazla <b>${esc(mcp.maxAmountTry.toLocaleString("tr-TR"))} TL</b>). ChatGPT her işlemden önce sana onay sorar.</li>`
    : `<li>İşlem yapamaz (Ayarlar'da ChatGPT işlemleri kapalı).</li>`;
  return page(
    "Bağlantı izni",
    `<h1>${esc(appName)} Yatırım uygulamana bağlanmak istiyor</h1>
<p>Yönlendirme adresi: <code>${esc(host)}</code></p>
<p>İzin verirsen bu uygulama:</p>
<ul><li>Portföyünü, fiyatları, emirlerini, alarmlarını, temettü ve KAP bilgilerini <b>görebilir</b>.</li>${writes}</ul>
<p class="warn">Aracı kurum bağlantısı yoktur; gerçek para hareketi olmaz. Bağlantıyı istediğin zaman Ayarlar › ChatGPT bağlantısı bölümünden kaldırabilirsin.</p>
<form method="post" action="/api/oauth/authorize">${hidden}<input type="hidden" name="csrf" value="${esc(csrfFor(session, client.id))}">
<div class="row"><button type="submit" name="decision" value="deny">Reddet</button><button class="ok" type="submit" name="decision" value="allow">İzin ver</button></div></form>`,
  );
}

/** POST /api/oauth/authorize — izin sayfasının formu: kod üretip istemciye yönlendirir. */
export async function handleAuthorizePost(req: Request): Promise<Response> {
  const origin = publicOrigin(req);
  const sess = await sessionWithUser(req);
  if (!sess) return errorPage("Oturumun kapanmış. Uygulamaya yeniden giriş yapıp bağlantıyı tekrar başlat.", 401);
  const session = sess.token;
  const form = new URLSearchParams(await req.text());
  const c = await checkAuthorize(form, origin);
  if (!c.ok) return "fatal" in c ? errorPage(c.fatal) : new Response(null, { status: 303, headers: { Location: c.redirect } });
  const { client, redirectUri, state, challenge, resource } = c.value;
  if (!safeEqual(form.get("csrf") ?? "", csrfFor(session, client.id))) return errorPage("Güvenlik denetimi başarısız. Sayfayı yenileyip tekrar deneyin.", 403);
  const back = new URL(redirectUri);
  if (form.get("decision") !== "allow") {
    back.searchParams.set("error", "access_denied");
    back.searchParams.set("error_description", "Kullanıcı izin vermedi.");
  } else {
    const code = randomToken("yat_kod_");
    await (await getDb()).run(
      "INSERT INTO oauth_codes (user_id, code_hash, client_id, redirect_uri, code_challenge, resource, scope, expires_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
      [sess.uid, sha256(code), client.id, redirectUri, challenge, resource, SCOPE, Date.now() + CODE_TTL_MS],
    );
    back.searchParams.set("code", code);
  }
  if (state) back.searchParams.set("state", state);
  back.searchParams.set("iss", origin);
  return new Response(null, { status: 303, headers: { Location: back.toString(), ...NO_STORE } });
}

// ---- Belirteç ucu ------------------------------------------------------------------------------

async function issueTokens(clientId: string, resource: string, userId: number) {
  const db = await getDb();
  const now = Date.now();
  const access = randomToken("yat_at_");
  const refresh = randomToken("yat_rt_");
  await db.tx(async () => {
    await db.run("INSERT INTO oauth_tokens (user_id, token_hash, kind, client_id, resource, scope, expires_at, created_at) VALUES (?, ?, 'access', ?, ?, ?, ?, ?)", [
      userId, sha256(access), clientId, resource, SCOPE, now + ACCESS_TTL_MS, now,
    ]);
    await db.run("INSERT INTO oauth_tokens (user_id, token_hash, kind, client_id, resource, scope, expires_at, created_at) VALUES (?, ?, 'refresh', ?, ?, ?, ?, ?)", [
      userId, sha256(refresh), clientId, resource, SCOPE, now + REFRESH_TTL_MS, now,
    ]);
    // Temizlik: süresi çoktan dolmuş kodlar ve belirteçler
    await db.run("DELETE FROM oauth_codes WHERE expires_at < ?", [now - 3600_000]);
    await db.run("DELETE FROM oauth_tokens WHERE kind <> 'static' AND expires_at < ?", [now - 7 * 24 * 3600_000]);
  });
  return json({ access_token: access, token_type: "Bearer", expires_in: Math.floor(ACCESS_TTL_MS / 1000), refresh_token: refresh, scope: SCOPE });
}

/** İstemci kimliği ve (varsa) gizli anahtarı: Basic başlığı ya da gövde */
function clientCredentials(req: Request, form: URLSearchParams): { id: string; secret: string | null } {
  const auth = req.headers.get("authorization");
  if (auth?.toLowerCase().startsWith("basic ")) {
    try {
      const [id, secret] = Buffer.from(auth.slice(6).trim(), "base64").toString("utf8").split(":");
      return { id: decodeURIComponent(id ?? ""), secret: decodeURIComponent(secret ?? "") || null };
    } catch {}
  }
  return { id: form.get("client_id") ?? "", secret: form.get("client_secret") };
}

/** POST /api/oauth/token — authorization_code (PKCE) ve refresh_token */
export async function handleToken(req: Request): Promise<Response> {
  const origin = publicOrigin(req);
  const type = req.headers.get("content-type") ?? "";
  let form: URLSearchParams;
  if (type.includes("application/json")) {
    const b = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    form = new URLSearchParams(Object.entries(b).filter(([, v]) => typeof v === "string") as [string, string][]);
  } else form = new URLSearchParams(await req.text());

  const cred = clientCredentials(req, form);
  const client = await getClient(cred.id);
  if (!client) return oauthError("invalid_client", "İstemci tanınmıyor.", 401);
  if (client.secret_hash && (!cred.secret || !safeEqual(sha256(cred.secret), client.secret_hash))) {
    return oauthError("invalid_client", "İstemci kimlik doğrulaması başarısız.", 401);
  }
  const resource = mcpResourceUrl(origin);
  const asked = form.get("resource");
  if (asked && !sameResource(asked, resource)) return oauthError("invalid_target", "resource bu MCP sunucusu değil.");
  const db = await getDb();
  const now = Date.now();
  const grant = form.get("grant_type");

  if (grant === "authorization_code") {
    const code = form.get("code") ?? "";
    const verifier = form.get("code_verifier") ?? "";
    // Atomik tek kullanım: yalnızca bir istek kodu "kullanıldı" yapabilir.
    const row = await db.get<{ user_id: number; client_id: string; redirect_uri: string; code_challenge: string; resource: string; expires_at: number }>(
      "UPDATE oauth_codes SET used_at = ? WHERE code_hash = ? AND used_at IS NULL RETURNING user_id, client_id, redirect_uri, code_challenge, resource, expires_at",
      [now, sha256(code)],
    );
    if (!row) return oauthError("invalid_grant", "Yetki kodu geçersiz ya da daha önce kullanılmış.");
    if (row.expires_at < now) return oauthError("invalid_grant", "Yetki kodunun süresi dolmuş.");
    if (row.client_id !== client.id) return oauthError("invalid_grant", "Kod bu istemciye ait değil.");
    const redirect = form.get("redirect_uri");
    if (redirect && redirect !== row.redirect_uri) return oauthError("invalid_grant", "redirect_uri eşleşmiyor.");
    if (!/^[A-Za-z0-9._~-]{43,128}$/.test(verifier) || createHash("sha256").update(verifier).digest("base64url") !== row.code_challenge) {
      return oauthError("invalid_grant", "PKCE doğrulaması başarısız (code_verifier).");
    }
    if (!sameResource(row.resource, resource)) return oauthError("invalid_target", "Kod başka bir kaynak için verilmiş.");
    if (!(Number(row.user_id) > 0)) return oauthError("invalid_grant", "Yetki kodu bir kullanıcıya ait değil.");
    return issueTokens(client.id, row.resource, Number(row.user_id));
  }

  if (grant === "refresh_token") {
    const hash = sha256(form.get("refresh_token") ?? "");
    const row = await db.get<{ user_id: number; client_id: string; resource: string }>(
      "UPDATE oauth_tokens SET revoked_at = ? WHERE token_hash = ? AND kind = 'refresh' AND revoked_at IS NULL AND expires_at > ? RETURNING user_id, client_id, resource",
      [now, hash, now],
    );
    if (!row) return oauthError("invalid_grant", "Yenileme belirteci geçersiz, süresi dolmuş ya da kaldırılmış.");
    if (row.client_id !== client.id) return oauthError("invalid_grant", "Belirteç bu istemciye ait değil.");
    if (!sameResource(row.resource, resource)) return oauthError("invalid_target", "Belirteç başka bir kaynak için verilmiş.");
    if (!(Number(row.user_id) > 0)) return oauthError("invalid_grant", "Belirteç bir kullanıcıya ait değil.");
    return issueTokens(client.id, row.resource, Number(row.user_id));
  }

  return oauthError("unsupported_grant_type", "Desteklenen: authorization_code, refresh_token.");
}

// ---- MCP isteğinin doğrulanması ------------------------------------------------------------

export type BearerCheck =
  | { ok: true; kind: "access" | "static"; clientId: string | null; clientLabel: string; userId: number }
  | { ok: false; error?: "invalid_token"; description?: string };

/** Authorization: Bearer … — belirteç geçerli, süresi dolmamış, kaldırılmamış ve bu MCP adresi için mi */
export async function verifyBearer(req: Request): Promise<BearerCheck> {
  const h = req.headers.get("authorization") ?? "";
  const m = /^Bearer\s+(\S+)$/i.exec(h.trim());
  if (!m) return { ok: false };
  const db = await getDb();
  const now = Date.now();
  const row = await db.get<{ user_id: number; token_hash: string; kind: "access" | "refresh" | "static"; client_id: string | null; resource: string; expires_at: number | null; revoked_at: number | null; last_used_at: number | null }>(
    "SELECT user_id, token_hash, kind, client_id, resource, expires_at, revoked_at, last_used_at FROM oauth_tokens WHERE token_hash = ?",
    [sha256(m[1])],
  );
  const bad = (description: string): BearerCheck => ({ ok: false, error: "invalid_token", description });
  if (!row || row.kind === "refresh") return bad("Belirteç tanınmıyor.");
  if (row.revoked_at != null) return bad("Bağlantı kaldırılmış. Bağlayıcıyı yeniden bağlayın.");
  if (row.expires_at != null && row.expires_at <= now) return bad("Belirtecin süresi dolmuş.");
  if (!(Number(row.user_id) > 0)) return bad("Belirteç bir kullanıcıya ait değil.");
  let clientLabel = "Statik anahtar";
  if (row.kind === "access") {
    if (!sameResource(row.resource, mcpResourceUrl(publicOrigin(req)))) return bad("Belirteç bu sunucu için verilmemiş (audience).");
    const client = await getClient(row.client_id ?? "");
    if (!client) return bad("Bağlantı kaldırılmış. Bağlayıcıyı yeniden bağlayın.");
    clientLabel = client.name ?? "ChatGPT";
  }
  if (!row.last_used_at || now - row.last_used_at > 60_000) {
    await db.run("UPDATE oauth_tokens SET last_used_at = ? WHERE token_hash = ?", [now, row.token_hash]);
  }
  return { ok: true, kind: row.kind, clientId: row.client_id, clientLabel, userId: Number(row.user_id) };
}

// ---- Ayarlar: bağlantılar ve statik anahtar ------------------------------------------------------

export interface McpConnection {
  clientId: string;
  name: string;
  redirectHost: string;
  connectedAt: number;
  lastUsedAt: number | null;
}

/** Etkin (geçerli belirteci olan) bağlantılar */
export async function listConnections(): Promise<McpConnection[]> {
  const now = Date.now();
  const rows = await (await getDb()).all<{ id: string; name: string | null; redirect_uris: string; first: number; last: number | null }>(
    `SELECT c.id, c.name, c.redirect_uris, MIN(t.created_at) AS first, MAX(t.last_used_at) AS last
       FROM oauth_clients c JOIN oauth_tokens t ON t.client_id = c.id
      WHERE t.user_id = ? AND t.revoked_at IS NULL AND t.expires_at > ?
      GROUP BY c.id, c.name, c.redirect_uris ORDER BY first DESC`,
    [await getCurrentUserId(), now],
  );
  return rows.map((r) => {
    let host = "";
    try {
      host = new URL((JSON.parse(r.redirect_uris) as string[])[0]).host;
    } catch {}
    return { clientId: r.id, name: r.name ?? host ?? "Bilinmeyen istemci", redirectHost: host, connectedAt: r.first, lastUsedAt: r.last };
  });
}

/**
 * Bağlantıyı kaldırır: geçerli kullanıcının bu istemciye verilmiş belirteçleri geçersiz olur. İstemci
 * kaydı (dinamik kayıt, kullanıcıdan bağımsız) başka etkin belirteci kalmadıysa silinir.
 */
export async function revokeClient(clientId: string): Promise<boolean> {
  const db = await getDb();
  const uid = await getCurrentUserId();
  return db.tx(async () => {
    const r = await db.run("UPDATE oauth_tokens SET revoked_at = ? WHERE client_id = ? AND user_id = ? AND revoked_at IS NULL", [Date.now(), clientId, uid]);
    await db.run("DELETE FROM oauth_codes WHERE client_id = ? AND user_id = ?", [clientId, uid]);
    await db.run(
      "DELETE FROM oauth_clients WHERE id = ? AND NOT EXISTS (SELECT 1 FROM oauth_tokens t WHERE t.client_id = oauth_clients.id AND t.revoked_at IS NULL)",
      [clientId],
    );
    return Number(r.changes) > 0;
  });
}

export async function staticTokenInfo(): Promise<{ createdAt: number; lastUsedAt: number | null } | null> {
  const r = await (await getDb()).get<{ created_at: number; last_used_at: number | null }>(
    "SELECT created_at, last_used_at FROM oauth_tokens WHERE user_id = ? AND kind = 'static' AND revoked_at IS NULL ORDER BY created_at DESC LIMIT 1",
    [await getCurrentUserId()],
  );
  return r ? { createdAt: r.created_at, lastUsedAt: r.last_used_at } : null;
}

/** Yeni statik Bearer anahtarı (öncekini geçersiz kılar). Düz metin yalnızca burada bir kez döner. */
export async function createStaticToken(): Promise<string> {
  const db = await getDb();
  const token = randomToken("yat_st_");
  const now = Date.now();
  const uid = await getCurrentUserId();
  await db.tx(async () => {
    await db.run("UPDATE oauth_tokens SET revoked_at = ? WHERE user_id = ? AND kind = 'static' AND revoked_at IS NULL", [now, uid]);
    await db.run("INSERT INTO oauth_tokens (user_id, token_hash, kind, client_id, resource, scope, expires_at, created_at) VALUES (?, ?, 'static', NULL, '*', ?, NULL, ?)", [
      uid, sha256(token), SCOPE, now,
    ]);
  });
  return token;
}

export async function revokeStaticToken(): Promise<void> {
  await (await getDb()).run("UPDATE oauth_tokens SET revoked_at = ? WHERE user_id = ? AND kind = 'static' AND revoked_at IS NULL", [Date.now(), await getCurrentUserId()]);
}
