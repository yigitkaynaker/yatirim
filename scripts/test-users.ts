// Çok kullanıcılı mod testleri: kayıt / giriş (scrypt), oturum çerezi, veri kapsamlama (A kullanıcısı
// B'nin verisini göremez / değiştiremez), kullanıcı başına ayarlar, sahibin yapay zeka anahtarının
// paylaşımı (anahtar gizli kalır, günlük sınır) ve kullanıcı bazlı JSON döküm / geri yükleme.
// Ağ kullanmaz; geçici bir veri klasörü kullanır. İki modda da çalışır (npm run test:pg).
//   npm run test:users
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const DIR = fs.mkdtempSync(path.join(os.tmpdir(), "yatirim-users-"));
if (!process.env.YATIRIM_DATA_DIR) process.env.YATIRIM_DATA_DIR = DIR;
process.env.SESSION_SECRET ??= "test-oturum-gizli-anahtari-0123456789";
delete process.env.ANTHROPIC_API_KEY;
delete process.env.OPENAI_API_KEY;
delete process.env.VERCEL;

const { resetDatabase } = await import("./test-db");
const db = await import("../src/lib/db");
const users = await import("../src/lib/users");
const ctx = await import("../src/lib/userContext");
const auth = await import("../src/lib/auth");
const portfolio = await import("../src/lib/portfolio");
const accounts = await import("../src/lib/accounts");
const market = await import("../src/lib/market");
const orders = await import("../src/lib/orders");
const alarms = await import("../src/lib/alarms");
const notes = await import("../src/lib/notes");
const settings = await import("../src/lib/settings");
const push = await import("../src/lib/push");
const dx = await import("../src/lib/dataExport");
const onboarding = await import("../src/lib/onboarding");

let passed = 0;
async function test(name: string, fn: () => void | Promise<void>) {
  await fn();
  passed++;
  console.log(`  ✓ ${name}`);
}

await resetDatabase();
const OWNER = ctx.OWNER_USER_ID;
const asOwner = <T>(fn: () => Promise<T>) => ctx.runAsUser(OWNER, fn);

console.log("Kayıt ve giriş");

let A = 0;
let B = 0;
await test("kayıt: e-posta küçük harfe çevrilir, şifre özeti istemciye dönmez, varsayılan hesap açılır", async () => {
  const a = await users.createUser("  Ayse@Ornek.COM ", "gizli-sifre-1");
  A = a.id;
  assert.equal(a.email, "ayse@ornek.com");
  assert.equal(a.isOwner, false);
  assert.ok(!("password_hash" in a) && !JSON.stringify(a).includes("scrypt"));
  B = (await users.createUser("bora@ornek.com", "baska-sifre-2")).id;
  assert.ok(A > OWNER && B > A);
  const accs = await ctx.runAsUser(A, () => accounts.listAccounts());
  assert.deepEqual(accs.map((x) => x.name), ["Ana hesap"]);
  const row = await (await db.getDb()).get<{ password_hash: string }>("SELECT password_hash FROM users WHERE id = ?", [A]);
  assert.match(row!.password_hash, /^scrypt\$/);
  assert.ok(!row!.password_hash.includes("gizli-sifre-1"));
});

await test("kayıt doğrulaması: aynı e-posta (büyük/küçük harf farkıyla), kısa şifre, geçersiz e-posta", async () => {
  await assert.rejects(() => users.createUser("AYSE@ornek.com", "baska-bir-sifre"), /kayıt olunamıyor/);
  await assert.rejects(() => users.createUser("yeni@ornek.com", "kisa"), /en az 8/);
  await assert.rejects(() => users.createUser("gecersiz-eposta", "uzun-bir-sifre"), /geçersiz/);
  await assert.rejects(() => users.createUser("", "uzun-bir-sifre"), /E-posta adresi girin/);
});

await test("giriş: doğru şifre kullanıcıyı döndürür; yanlış şifre ve olmayan e-posta aynı sonucu (null) verir", async () => {
  assert.equal((await users.authenticate("AYSE@ornek.com", "gizli-sifre-1"))?.id, A);
  assert.equal(await users.authenticate("ayse@ornek.com", "yanlis-sifre"), null);
  assert.equal(await users.authenticate("yok@ornek.com", "gizli-sifre-1"), null);
  assert.equal(await users.authenticate("", ""), null);
});

await test("sahip e-posta + şifre tanımlayabilir; başka hesabın e-postası alınamaz", async () => {
  await assert.rejects(() => users.setCredentials(OWNER, "ayse@ornek.com", "sahip-sifresi-1"), /başka bir hesapta/);
  const o = await users.setCredentials(OWNER, "Sahip@Ornek.com", "sahip-sifresi-1");
  assert.equal(o.email, "sahip@ornek.com");
  assert.equal(o.isOwner, true);
  assert.equal((await users.authenticate("sahip@ornek.com", "sahip-sifresi-1"))?.id, OWNER);
});

await test("oturum çerezi kullanıcı kimliğini taşır; kimliksiz eski çerez sahibe aittir; bozuk imza reddedilir", async () => {
  const t = await auth.createSessionToken(A);
  assert.deepEqual(await auth.readSessionToken(t), { uid: A });
  const [body, sig] = t.split(".");
  const forged = Buffer.from(JSON.stringify({ iat: 1, exp: 9_999_999_999, uid: OWNER })).toString("base64url");
  assert.equal(await auth.readSessionToken(`${forged}.${sig}`), null, "başka kullanıcıya çevrilmiş gövde");
  assert.equal(await auth.readSessionToken(`${body}.x${sig}`), null);
  // Eski (uid'siz) belirteç: imzayı aynı anahtarla üret
  const legacyBody = Buffer.from(JSON.stringify({ iat: 1, exp: 9_999_999_999 })).toString("base64url");
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(process.env.SESSION_SECRET!), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const legacySig = Buffer.from(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(legacyBody))).toString("base64url");
  assert.deepEqual(await auth.readSessionToken(`${legacyBody}.${legacySig}`), { uid: OWNER });
});

await test("bağlam ve oturum yoksa veri erişimi reddedilir (varsayılan kullanıcıya düşülmez)", async () => {
  // Bu betik bilerek bağlamsız çalışır (enterUserForScripts yok); her erişim runAsUser ile yapılır.
  assert.equal(ctx.contextUserId(), null);
  assert.equal(await ctx.sessionUserId(), null, "istek dışında çerez yok");
  await assert.rejects(() => ctx.getCurrentUserId(), ctx.UnauthorizedError);
  await assert.rejects(() => portfolio.listTransactions(), ctx.UnauthorizedError);
  await assert.rejects(() => settings.getSetting("ai_settings"), ctx.UnauthorizedError);
  assert.throws(() => ctx.runAsUser(0, () => null), /Geçersiz kullanıcı/);
});

console.log("Veri kapsamlama");

const tx = (accountId: number, symbol: string, quantity = "10") =>
  portfolio.parseTransactionInput({ mode: "real", accountId, assetType: "bist", symbol, side: "buy", quantity, price: "50", currency: "TRY", date: "2025-02-03" });

let ownerTxId = 0;
let ownerAccId = 0;
let aTxId = 0;
await test("işlemler ve hesaplar: A, sahibin ve B'nin işlemlerini göremez, değiştiremez, silemez", async () => {
  await asOwner(async () => {
    ownerAccId = (await accounts.defaultAccount()).id;
    ownerTxId = (await portfolio.createTransaction(await tx(ownerAccId, "THYAO"))).id;
  });
  await ctx.runAsUser(A, async () => {
    const acc = await accounts.defaultAccount();
    assert.notEqual(acc.id, ownerAccId);
    aTxId = (await portfolio.createTransaction(await tx(acc.id, "ASELS", "5"))).id;
    const list = await portfolio.listTransactions();
    assert.deepEqual(list.map((t) => t.id), [aTxId]);
    assert.equal(await portfolio.getTransaction(ownerTxId), null);
    assert.equal(await portfolio.deleteTransaction(ownerTxId), false);
    assert.equal(await portfolio.updateTransaction(ownerTxId, await tx(acc.id, "THYAO", "1")), null);
    // Sahibin hesabına işlem yazılamaz
    await assert.rejects(() => tx(ownerAccId, "THYAO"), /Hesap bulunamadı/);
    assert.equal(await accounts.getAccount(ownerAccId), null);
    assert.equal(await accounts.updateAccount(ownerAccId, { name: "ele geçirildi" }), null);
    // Hesap adı kullanıcı başına tekildir: A da "Ana hesap" adını kullanır, ikinci kez kullanamaz
    await assert.rejects(() => accounts.createAccount({ name: "ana HESAP" }), /zaten var/);
  });
  await ctx.runAsUser(B, async () => {
    assert.deepEqual(await portfolio.listTransactions(), []);
    assert.equal((await portfolio.getPortfolio("real", { force: false }).catch(() => null))?.holdings.length ?? 0, 0);
  });
  await asOwner(async () => {
    assert.deepEqual((await portfolio.listTransactions()).map((t) => t.id), [ownerTxId]);
    assert.equal((await accounts.getAccount(ownerAccId))?.name, "Ana hesap");
  });
});

await test("izleme listesi, alarm, emir, bildirim, pozisyon notu ve ilk adımlar kullanıcı başınadır", async () => {
  await ctx.runAsUser(A, async () => {
    await market.addWatch("bist", "THYAO");
    await alarms.createAlarm({ kind: "price", assetType: "bist", symbol: "THYAO", direction: "up", threshold: "500" });
    await orders.addNotification({ kind: "deneme", title: "A'nın bildirimi", body: "x" });
  });
  const d = await db.getDb();
  await d.run(
    "INSERT INTO orders (user_id, mode, asset_type, symbol, side, condition, trigger_price, trigger_currency, quantity) VALUES (?, 'real', 'bist', 'THYAO', 'sell', 'gte', 400, 'TRY', 1)",
    [A],
  );
  await ctx.runAsUser(B, async () => {
    // Aynı varlığı B de izleyebilir (tekillik kullanıcı başına)
    await market.addWatch("bist", "THYAO");
    assert.equal((await market.listWatchlist()).length, 1);
    assert.deepEqual(await alarms.listAlarms(), []);
    assert.deepEqual(await orders.listOrders(), []);
    assert.equal((await orders.listNotifications()).items.length, 0);
    assert.deepEqual(await onboarding.getOnboardingStatus(), { sanal: false, izleme: true, emirAlarm: false, bildirim: false });
    // A'nın alarmını / emrini silemez, iptal edemez
    const aAlarm = (await d.get<{ id: number }>("SELECT id FROM alarms WHERE user_id = ?", [A]))!.id;
    const aOrder = (await d.get<{ id: number }>("SELECT id FROM orders WHERE user_id = ?", [A]))!.id;
    assert.equal(await alarms.deleteAlarm(aAlarm), false);
    assert.equal(await alarms.setAlarmActive(aAlarm, false), null);
    assert.equal(await orders.cancelOrder(aOrder), null);
    assert.equal(await orders.getOrder(aOrder), null);
  });
  await ctx.runAsUser(A, async () => {
    assert.equal((await alarms.listAlarms()).length, 1);
    assert.equal((await alarms.listAlarms())[0].active, true);
    assert.equal((await orders.listOrders("pending")).length, 1);
    assert.equal((await orders.listNotifications()).unread, 1);
    await orders.markNotificationsRead();
  });
  await asOwner(async () => {
    assert.deepEqual(await market.listWatchlist(), []);
    assert.equal((await orders.listNotifications()).items.length, 0);
  });
});

await test("pozisyon notu: aynı varlığa iki kullanıcının ayrı notu", async () => {
  const save = (who: number, why: string) => ctx.runAsUser(who, () => notes.saveNote({ mode: "real", assetType: "bist", symbol: "THYAO", why }));
  await save(A, "A'nın gerekçesi");
  await save(B, "B'nin gerekçesi");
  assert.equal((await ctx.runAsUser(A, () => notes.getNote("real", "bist", "THYAO")))?.why, "A'nın gerekçesi");
  assert.equal((await ctx.runAsUser(B, () => notes.getNote("real", "bist", "THYAO")))?.why, "B'nin gerekçesi");
  assert.equal(await asOwner(() => notes.getNote("real", "bist", "THYAO")), null);
});

await test("anlık bildirim aboneliği: cihaz başka kullanıcıyla girilince ona geçer; başkasının aboneliği silinemez", async () => {
  const sub = { endpoint: "https://push.example/cihaz-1", keys: { p256dh: "p", auth: "a" } };
  const { id } = await ctx.runAsUser(A, () => push.saveSubscription(sub, "test"));
  assert.equal(await ctx.runAsUser(B, () => push.removeSubscription({ id })), false);
  await ctx.runAsUser(B, () => push.saveSubscription(sub, "test"));
  assert.equal((await ctx.runAsUser(A, () => push.listSubscriptions())).length, 0);
  assert.equal((await ctx.runAsUser(B, () => push.listSubscriptions())).length, 1);
  // VAPID anahtarları sunucu genelidir: iki kullanıcıda aynı
  const ka = await ctx.runAsUser(A, () => push.getVapidKeys());
  const kb = await ctx.runAsUser(B, () => push.getVapidKeys());
  assert.equal(ka.publicKey, kb.publicKey);
});

console.log("Ayarlar ve yapay zeka anahtarı");

await test("ayarlar kullanıcı başınadır", async () => {
  await ctx.runAsUser(A, () => settings.updateAiSettings({ budgetUsd: 3, scheduleEnabled: false }));
  await ctx.runAsUser(A, () => settings.setKapNotifyScope("off"));
  assert.equal((await ctx.runAsUser(A, () => settings.getAiSettings())).budgetUsd, 3);
  assert.equal((await asOwner(() => settings.getAiSettings())).budgetUsd, settings.DEFAULT_AI_SETTINGS.budgetUsd);
  assert.equal(await ctx.runAsUser(B, () => settings.getKapNotifyScope()), "real");
});

await test("sahibin anahtarı diğer kullanıcılarca kullanılır ama hiçbir biçimde görünmez; kendi anahtarı öncelikli", async () => {
  const ownerKey = "sk-ant-sahibin-gizli-anahtari-123456";
  await asOwner(() => settings.saveApiKey(ownerKey, "anthropic"));
  await asOwner(() => settings.updateAiSettings({ model: "gelismis" }));
  // A: kendi anahtarı yok → sahibinki paylaşımlı
  const used = await ctx.runAsUser(A, () => settings.getApiKey("anthropic"));
  assert.equal(used.source, "owner");
  assert.equal(used.key, ownerKey, "sunucu tarafında kullanılabilir");
  const shown = await ctx.runAsUser(A, () => settings.publicKeyState("anthropic"));
  assert.deepEqual(shown, { source: "owner", masked: null });
  assert.equal(await ctx.runAsUser(A, () => settings.usesSharedAi()), true);
  // Paylaşımda sağlayıcı / model sahibin seçimi, bütçe kullanıcınınki
  const s = await ctx.runAsUser(A, () => settings.getAiSettings());
  assert.equal(s.model, "gelismis");
  assert.equal(s.budgetUsd, 3);
  // A anahtarı silmeye çalışırsa sahibin anahtarı etkilenmez
  await ctx.runAsUser(A, () => settings.deleteApiKey("anthropic"));
  assert.equal((await asOwner(() => settings.getApiKey("anthropic"))).key, ownerKey);
  // B kendi anahtarını girer → öncelikli, maskeli yalnızca kendisininki
  const bKey = "sk-ant-bora-kendi-anahtari-987654";
  await ctx.runAsUser(B, () => settings.saveApiKey(bKey, "anthropic"));
  assert.deepEqual(await ctx.runAsUser(B, () => settings.getApiKey("anthropic")), { key: bKey, source: "db" });
  assert.equal((await ctx.runAsUser(B, () => settings.publicKeyState("anthropic"))).masked, settings.maskKey(bKey));
  assert.equal(await ctx.runAsUser(B, () => settings.usesSharedAi()), false);
  // Sahip B'nin anahtarını kullanmaz
  assert.equal((await asOwner(() => settings.getApiKey("anthropic"))).key, ownerKey);
  // .env anahtarı yalnızca sahibin "kendi" anahtarıdır; diğerlerine paylaşımlı olarak gider
  process.env.OPENAI_API_KEY = "sk-env-openai-anahtari-0123456789abcdef";
  try {
    assert.equal((await asOwner(() => settings.getApiKey("openai"))).source, "env");
    assert.deepEqual(await ctx.runAsUser(A, () => settings.publicKeyState("openai")), { source: "owner", masked: null });
  } finally {
    delete process.env.OPENAI_API_KEY;
  }
});

await test("sağlayıcı: paylaşımda sahibin seçimi; kendi OpenAI anahtarını giren kullanıcıda kendi sağlayıcısı", async () => {
  const E = (await users.createUser("ece@ornek.com", "ece-sifresi-1")).id;
  await asOwner(() => settings.updateAiSettings({ provider: "anthropic" }));
  assert.equal((await ctx.runAsUser(E, () => settings.getAiSettings())).provider, "anthropic");
  // E kendi OpenAI anahtarını girer → paylaşım biter, etkin sağlayıcı OpenAI, anahtar kendisininki
  const eKey = "sk-proj-ece-kendi-openai-anahtari-0123456789";
  await ctx.runAsUser(E, () => settings.saveApiKey(eKey, "openai"));
  assert.equal(await ctx.runAsUser(E, () => settings.usesSharedAi()), false);
  assert.equal((await ctx.runAsUser(E, () => settings.getAiSettings())).provider, "openai");
  assert.deepEqual(await ctx.runAsUser(E, () => settings.getApiKey("openai")), { key: eKey, source: "db" });
  // Sahibin seçimi değişmez; sahip OpenAI'ye geçse de E'nin anahtarını görmez
  assert.equal((await asOwner(() => settings.getAiSettings())).provider, "anthropic");
  await asOwner(() => settings.updateAiSettings({ provider: "openai" }));
  assert.equal((await asOwner(() => settings.getApiKey("openai"))).key, null);
  await asOwner(() => settings.updateAiSettings({ provider: "anthropic" }));
  // Seçili sağlayıcının kendi anahtarı varken başka sağlayıcıya anahtar eklemek seçimi değiştirmez
  await asOwner(() => settings.saveApiKey("sk-proj-sahip-openai-anahtari-0123456789", "openai"));
  assert.equal((await asOwner(() => settings.getAiSettings())).provider, "anthropic");
  await asOwner(() => settings.deleteApiKey("openai"));
});

await test("yerel model (Ollama): yalnızca sahip seçer ve adres girer; paylaşımda kota düşmez; bulutta anlaşılır hata", async () => {
  const { getProvider } = await import("../src/lib/aiProvider");
  const { aiErrorMessage } = await import("../src/lib/aiClient");
  const raw = async (uid: number, value: unknown) =>
    (await db.getDb()).run(
      "INSERT INTO settings (user_id, key, value, updated_at) VALUES (?, 'ai_settings', ?, '2026-11-20 10:00:00') ON CONFLICT(user_id, key) DO UPDATE SET value = excluded.value",
      [uid, JSON.stringify(value)],
    );
  // Sahip-dışı kullanıcı adres, model ya da yerel sağlayıcı seçemez (SSRF)
  for (const body of [{ ollamaUrl: "http://169.254.169.254" }, { ollamaModel: "qwen3:4b" }, { provider: "ollama" }]) {
    await assert.rejects(() => ctx.runAsUser(B, () => settings.updateAiSettings(body)), /yalnızca uygulama sahibi/);
    await assert.rejects(() => ctx.runAsUser(A, () => settings.updateAiSettings(body)), /yalnızca uygulama sahibi/);
  }
  // JSON geri yüklemesiyle gelen kayıt da etkisiz: sağlayıcı varsayılana döner, adres sahibinki
  await raw(B, { provider: "ollama", ollamaUrl: "http://10.0.0.5:8080", ollamaModel: "kotu-model" });
  const sb = await ctx.runAsUser(B, () => settings.getAiSettings());
  assert.equal(sb.provider, "anthropic");
  assert.equal(sb.ollamaUrl, settings.DEFAULT_OLLAMA_URL);
  assert.equal(sb.ollamaModel, settings.DEFAULT_OLLAMA_MODEL);
  // Sahip: geçersiz adres reddedilir, geçerli adres normalize edilir
  for (const bad of ["ftp://localhost:11434", "http://kullanici:sifre@localhost:11434", "http://localhost:11434/api?x=1", "localhost"]) {
    await assert.rejects(() => asOwner(() => settings.updateAiSettings({ ollamaUrl: bad })), /Ollama adresi geçersiz/);
  }
  const so = await asOwner(() => settings.updateAiSettings({ provider: "ollama", ollamaUrl: " http://127.0.0.1:11434/ ", ollamaModel: "qwen3:4b-instruct" }));
  assert.equal(so.provider, "ollama");
  assert.equal(so.ollamaUrl, "http://127.0.0.1:11434");
  // A (kendi anahtarı yok) sahibin yerel modelini paylaşır; ücretsiz olduğu için günlük sınırdan düşmez
  assert.equal((await ctx.runAsUser(A, () => settings.getAiSettings())).provider, "ollama");
  const before = await ctx.runAsUser(A, () => settings.sharedAiUsedToday());
  const p = await ctx.runAsUser(A, () => getProvider());
  assert.equal(p.id, "ollama");
  assert.equal(await p.model(), "qwen3:4b-instruct");
  assert.equal(await ctx.runAsUser(A, () => settings.sharedAiUsedToday()), before);
  // B (kendi anahtarı var) kendi seçimini kullanır
  assert.equal((await ctx.runAsUser(B, () => getProvider())).id, "anthropic");
  // Bulutta (Vercel) yerel model: anlaşılır Türkçe hata
  process.env.VERCEL = "1";
  try {
    const err = await asOwner(() => getProvider()).then(() => null, (e: unknown) => e);
    assert.match(aiErrorMessage(err), /yalnızca uygulama bilgisayarınızda çalışırken kullanılabilir/);
    assert.equal(await asOwner(async () => (await import("../src/lib/aiClient")).isAiConfigured()), false);
  } finally {
    delete process.env.VERCEL;
  }
  // Kaldırılan Gemini sağlayıcısı kayıtlıysa çökmeden varsayılana (ya da kendi OpenAI anahtarına) dönülür
  await raw(OWNER, { provider: "gemini", geminiModel: "gemini-3.8-flash", budgetUsd: 7 });
  const sg = await asOwner(() => settings.getAiSettings());
  assert.equal(sg.provider, "anthropic");
  assert.equal(sg.budgetUsd, 7);
  assert.ok(!("geminiModel" in sg));
  await ctx.runAsUser(B, () => settings.saveApiKey("sk-proj-bora-openai-anahtari-0123456789", "openai"));
  await raw(B, { provider: "gemini" });
  assert.equal((await ctx.runAsUser(B, () => settings.getAiSettings())).provider, "openai");
  await ctx.runAsUser(B, () => settings.deleteApiKey("openai"));
  await raw(B, {});
  // Eski Gemini anahtar kaydı JSON dökümünde gizli sayılmaya devam eder
  assert.ok((await import("../src/lib/db/transfer")).SECRET_SETTINGS.includes("gemini_api_key"));
  await asOwner(() => settings.updateAiSettings({ provider: "anthropic", budgetUsd: settings.DEFAULT_AI_SETTINGS.budgetUsd }));
});

await test("paylaşımda bulut sağlayıcısı: sahibin yerel modeli bulutta kullanılamazsa sahibin Claude / OpenAI anahtarına geçilir", async () => {
  const { getProvider } = await import("../src/lib/aiProvider");
  const { aiErrorMessage, aiStatus, isAiConfigured, NO_SHARED_KEY_MESSAGE } = await import("../src/lib/aiClient");
  const ownerClaude = "sk-ant-sahibin-gizli-anahtari-123456";
  const ownerOpenAi = "sk-proj-sahibin-openai-anahtari-0123456789";
  assert.equal((await asOwner(() => settings.getApiKey("anthropic"))).key, ownerClaude);
  assert.equal(await ctx.runAsUser(A, () => settings.usesSharedAi()), true);
  await asOwner(() => settings.updateAiSettings({ provider: "ollama" }));
  process.env.VERCEL = "1";
  try {
    // Sahip yerel modeli seçmiş, uygulama bulutta: A sahibin Claude anahtarını kullanır (kotadan düşer)
    assert.equal((await ctx.runAsUser(A, () => settings.getAiSettings())).provider, "anthropic");
    assert.deepEqual(await ctx.runAsUser(A, () => aiStatus()), { configured: true, sharedMissing: false });
    const before = await ctx.runAsUser(A, () => settings.sharedAiUsedToday());
    assert.equal((await ctx.runAsUser(A, () => getProvider())).id, "anthropic");
    assert.equal(await ctx.runAsUser(A, () => settings.sharedAiUsedToday()), before + 1);
    // Anahtar istemciye hiçbir biçimde dönmez
    assert.deepEqual(await ctx.runAsUser(A, () => settings.publicKeyState("anthropic")), { source: "owner", masked: null });
    // Sahibin yalnızca OpenAI anahtarı varsa OpenAI'ye geçilir
    await asOwner(() => settings.deleteApiKey("anthropic"));
    await asOwner(() => settings.saveApiKey(ownerOpenAi, "openai"));
    assert.equal((await asOwner(() => settings.getAiSettings())).provider, "ollama", "sahibin seçimi değişmez");
    assert.equal((await ctx.runAsUser(A, () => settings.getAiSettings())).provider, "openai");
    assert.equal((await ctx.runAsUser(A, () => getProvider())).id, "openai");
    assert.deepEqual(await ctx.runAsUser(A, () => settings.publicKeyState("openai")), { source: "owner", masked: null });
    // Sahip OpenAI seçmiş ama yalnızca Claude anahtarı var: Claude'a geçilir
    await asOwner(() => settings.deleteApiKey("openai"));
    await asOwner(() => settings.saveApiKey(ownerClaude, "anthropic"));
    await asOwner(() => settings.updateAiSettings({ provider: "openai" }));
    assert.equal((await ctx.runAsUser(A, () => settings.getAiSettings())).provider, "anthropic");
    // Sahibin hiç bulut anahtarı yok: anlaşılır Türkçe mesaj ("paylaşılan anahtar yok")
    await asOwner(() => settings.updateAiSettings({ provider: "ollama" }));
    await asOwner(() => settings.deleteApiKey("anthropic"));
    assert.equal(await ctx.runAsUser(A, () => isAiConfigured()), false);
    assert.deepEqual(await ctx.runAsUser(A, () => aiStatus()), { configured: false, sharedMissing: true });
    const err = await ctx.runAsUser(A, () => getProvider()).then(() => null, (e: unknown) => e);
    assert.equal(aiErrorMessage(err), NO_SHARED_KEY_MESSAGE);
    // Kendi anahtarı olan B'de "paylaşılan" mesajı çıkmaz
    assert.equal((await ctx.runAsUser(B, () => aiStatus())).sharedMissing, false);
  } finally {
    delete process.env.VERCEL;
  }
  // Yerelde sahibin yerel modeli paylaşılmaya devam eder
  assert.equal((await ctx.runAsUser(A, () => settings.getAiSettings())).provider, "ollama");
  await asOwner(() => settings.saveApiKey(ownerClaude, "anthropic"));
  await asOwner(() => settings.updateAiSettings({ provider: "anthropic" }));
  // Paylaşım kapalı (sınır 0): "sınıra ulaştınız" yerine "paylaşımı kapattı"
  await asOwner(() => settings.setSharedAiGlobalLimit(0));
  await assert.rejects(() => ctx.runAsUser(A, () => settings.consumeSharedAiQuota()), (e: unknown) => e instanceof settings.AiGlobalLimitError && /paylaşımını kapattı/.test((e as Error).message));
  await asOwner(() => settings.setSharedAiGlobalLimit(settings.DEFAULT_SHARED_AI_GLOBAL_LIMIT));
});

await test("paylaşılan anahtarda kullanıcı başına günlük sınır; sahip ve kendi anahtarı olan sınırsız", async () => {
  await assert.rejects(() => ctx.runAsUser(A, () => settings.setSharedAiDailyLimit(1)), /yalnızca uygulama sahibi/);
  await asOwner(() => settings.setSharedAiDailyLimit(2));
  const now = Date.parse("2026-11-20T10:00:00Z");
  await ctx.runAsUser(A, () => settings.consumeSharedAiQuota(now));
  await ctx.runAsUser(A, () => settings.consumeSharedAiQuota(now));
  await assert.rejects(() => ctx.runAsUser(A, () => settings.consumeSharedAiQuota(now)), (e: unknown) => e instanceof settings.AiDailyLimitError && /günde 2 istek/.test((e as Error).message));
  assert.equal(await ctx.runAsUser(A, () => settings.sharedAiUsedToday(now)), 2);
  // Ertesi gün sıfırlanır
  await ctx.runAsUser(A, () => settings.consumeSharedAiQuota(now + 86_400_000));
  // Sahip sınırsız
  for (let i = 0; i < 5; i++) await asOwner(() => settings.consumeSharedAiQuota(now));
  // İstemci (aiClient) paylaşılan anahtarda sınırı uygular; kendi anahtarı olan B için uygulanmaz
  const { getAiClient } = await import("../src/lib/aiClient");
  await asOwner(() => settings.setSharedAiDailyLimit(0));
  await assert.rejects(() => ctx.runAsUser(A, () => getAiClient()), settings.AiDailyLimitError);
  await ctx.runAsUser(B, () => getAiClient());
  await asOwner(() => getAiClient());
});

await test("sunucu geneli toplam tavan: tüm kullanıcıların toplamı aşılamaz, eşzamanlı çağrılarda da", async () => {
  const C = (await users.createUser("cem@ornek.com", "cem-sifresi-1")).id;
  const D = (await users.createUser("deniz@ornek.com", "deniz-sifresi-1")).id;
  const day = Date.parse("2026-12-01T10:00:00Z");
  await asOwner(() => settings.setSharedAiDailyLimit(100));
  await asOwner(() => settings.setSharedAiGlobalLimit(3));
  await assert.rejects(() => ctx.runAsUser(C, () => settings.setSharedAiGlobalLimit(1000)), /yalnızca uygulama sahibi/);
  await ctx.runAsUser(A, () => settings.consumeSharedAiQuota(day));
  await ctx.runAsUser(A, () => settings.consumeSharedAiQuota(day));
  await ctx.runAsUser(C, () => settings.consumeSharedAiQuota(day));
  await assert.rejects(() => ctx.runAsUser(C, () => settings.consumeSharedAiQuota(day)), settings.AiGlobalLimitError);
  assert.equal(await ctx.runAsUser(C, () => settings.sharedAiUsedToday(day)), 1, "tavanda reddedilen istek kullanıcı sayacından düşmez");
  assert.equal(await asOwner(() => settings.sharedAiTotalToday(day)), 3);
  // Eşzamanlı: tavan 5, 12 paralel çağrı → tam 5'i geçer
  const day2 = day + 86_400_000;
  await asOwner(() => settings.setSharedAiGlobalLimit(5));
  const results = await Promise.allSettled(
    Array.from({ length: 12 }, (_, i) => ctx.runAsUser(i % 2 ? C : D, () => settings.consumeSharedAiQuota(day2))),
  );
  assert.equal(results.filter((r) => r.status === "fulfilled").length, 5);
  assert.equal(await asOwner(() => settings.sharedAiTotalToday(day2)), 5);
  // 0: paylaşım kapalı; sahip etkilenmez
  await asOwner(() => settings.setSharedAiGlobalLimit(0));
  await assert.rejects(() => ctx.runAsUser(D, () => settings.consumeSharedAiQuota(day2 + 86_400_000)), settings.AiGlobalLimitError);
  await asOwner(() => settings.consumeSharedAiQuota(day2));
  await asOwner(() => settings.setSharedAiGlobalLimit(300));
});

await test("şifre değiştir: mevcut şifre doğrulanır; sahip uygulama şifresini de kullanabilir", async () => {
  assert.equal(await users.changePassword(A, "yanlis-sifre", "yeni-sifre-123"), false);
  await assert.rejects(() => users.changePassword(A, "gizli-sifre-1", "kisa"), /en az 8/);
  assert.equal(await users.changePassword(A, "gizli-sifre-1", "yeni-sifre-123"), true);
  assert.equal(await users.authenticate("ayse@ornek.com", "gizli-sifre-1"), null);
  assert.equal((await users.authenticate("ayse@ornek.com", "yeni-sifre-123"))?.id, A);
  process.env.APP_PASSWORD = "uygulama-sifresi-x";
  try {
    assert.equal(await users.changePassword(OWNER, "uygulama-sifresi-x", "sahip-yeni-sifre"), true);
    assert.equal((await users.authenticate("sahip@ornek.com", "sahip-yeni-sifre"))?.id, OWNER);
  } finally {
    delete process.env.APP_PASSWORD;
  }
});

await test("OAuth istemci kaydı IP başına hız sınırlıdır", async () => {
  const oauth = await import("../src/lib/oauth");
  const call = () => oauth.handleRegister(new Request("http://yerel/api/oauth/register", { method: "POST", headers: { "x-forwarded-for": "203.0.113.9" }, body: "{}" }));
  const statuses: number[] = [];
  for (let i = 0; i < oauth.OAUTH_REGISTER_LIMIT + 1; i++) statuses.push((await call()).status);
  assert.ok(statuses.slice(0, -1).every((s) => s === 400));
  assert.equal(statuses.at(-1), 429);
});

console.log("Kullanıcı bazlı JSON döküm");

await test("döküm yalnızca kullanıcının verisini içerir; geri yükleme diğer kullanıcılara dokunmaz", async () => {
  const dumpA = (await ctx.runAsUser(A, () => dx.exportAllData())) as unknown as { tables: Record<string, Record<string, unknown>[]> };
  assert.deepEqual(dumpA.tables.transactions.map((t) => t.id), [aTxId]);
  assert.ok(!("users" in dumpA.tables) && !("push_subscriptions" in dumpA.tables));
  assert.ok(!JSON.stringify(dumpA).includes("sahibin-gizli"), "sahibin anahtarı A'nın dökümünde yok");
  assert.ok(dumpA.tables.accounts.every((r) => !("user_id" in r)));
  // A kendi verisini siler gibi değiştirir, sonra geri yükler
  await ctx.runAsUser(A, () => portfolio.deleteTransaction(aTxId));
  const r = await ctx.runAsUser(A, () => dx.importAllData(JSON.parse(JSON.stringify(dumpA))));
  assert.equal(r.transactions, 1);
  assert.deepEqual((await ctx.runAsUser(A, () => portfolio.listTransactions())).map((t) => t.id), [aTxId]);
  // Sahibin ve B'nin verisi yerinde
  assert.deepEqual((await asOwner(() => portfolio.listTransactions())).map((t) => t.id), [ownerTxId]);
  assert.equal((await ctx.runAsUser(B, () => market.listWatchlist())).length, 1);
});

await test("kullanıcı dosya yükleyerek kota sayacını ve harcama kaydını sıfırlayamaz", async () => {
  const now = Date.now();
  await asOwner(() => settings.setSharedAiDailyLimit(2));
  await ctx.runAsUser(A, () => settings.consumeSharedAiQuota(now)).catch(() => null);
  await ctx.runAsUser(A, () => settings.consumeSharedAiQuota(now)).catch(() => null);
  await assert.rejects(() => ctx.runAsUser(A, () => settings.consumeSharedAiQuota(now)), settings.AiDailyLimitError);
  const d = await db.getDb();
  await d.run("INSERT INTO ai_usage (user_id, kind, model, cost_usd) VALUES (?, 'sohbet', 'claude-haiku-5-5', 1.5)", [A]);
  const dump = (await ctx.runAsUser(A, () => dx.exportAllData())) as unknown as { tables: Record<string, Record<string, unknown>[]> };
  // Saldırgan dosya: sayaç sıfır, harcama kaydı yok, ayrıca sahte bir sunucu geneli anahtar
  dump.tables.settings = dump.tables.settings
    .map((r) => (String(r.key).startsWith("ai_shared_used:") ? { ...r, value: "0" } : r))
    .concat([{ key: "shared_ai_daily_limit", value: "99999", updated_at: "2026-01-01 00:00:00" }]);
  dump.tables.ai_usage = [];
  await ctx.runAsUser(A, () => dx.importAllData(JSON.parse(JSON.stringify(dump))));
  assert.equal(await ctx.runAsUser(A, () => settings.sharedAiUsedToday(now)), 2, "sayaç değişmedi");
  await assert.rejects(() => ctx.runAsUser(A, () => settings.consumeSharedAiQuota(now)), settings.AiDailyLimitError);
  assert.equal((await d.get<{ c: number }>("SELECT COUNT(*) AS c FROM ai_usage WHERE user_id = ?", [A]))?.c, 1, "harcama kaydı korundu");
  assert.equal(await asOwner(() => settings.getSharedAiDailyLimit()), 2);
  assert.equal((await ctx.runAsUser(A, () => settings.getAiSettings())).budgetUsd, 3, "izinli ayarlar yine yüklenir");
});

await test("başkasının kaydına bağlanan dosya reddedilir (hiçbir şey değişmez)", async () => {
  const dumpB = (await ctx.runAsUser(B, () => dx.exportAllData())) as unknown as { tables: Record<string, Record<string, unknown>[]> };
  dumpB.tables.transactions = [
    { id: 900001, mode: "real", asset_type: "bist", symbol: "THYAO", side: "buy", quantity: 1, price: 1, currency: "TRY", date: "2025-01-01", account_id: ownerAccId, fee: 0, fx_try: 1 },
  ];
  await assert.rejects(() => ctx.runAsUser(B, () => dx.importAllData(dumpB)), /bu hesaba ait olmayan/);
  assert.deepEqual(await ctx.runAsUser(B, () => portfolio.listTransactions()), []);
  assert.equal((await ctx.runAsUser(B, () => market.listWatchlist())).length, 1, "geri alındı");
  // Başka kullanıcının kayıt numarasıyla çakışan dosya da reddedilir
  const dumpB2 = (await ctx.runAsUser(B, () => dx.exportAllData())) as unknown as { tables: Record<string, Record<string, unknown>[]> };
  const bAcc = dumpB2.tables.accounts[0].id;
  dumpB2.tables.transactions = [
    { id: ownerTxId, mode: "real", asset_type: "bist", symbol: "THYAO", side: "buy", quantity: 1, price: 1, currency: "TRY", date: "2025-01-01", account_id: bAcc, fee: 0, fx_try: 1 },
  ];
  await assert.rejects(() => ctx.runAsUser(B, () => dx.importAllData(dumpB2)), /çakışıyor/);
  assert.deepEqual((await asOwner(() => portfolio.listTransactions())).map((t) => t.id), [ownerTxId]);
});

await test("arka plan: forEachUser her kullanıcıyı kendi bağlamında çalıştırır, birinin hatası diğerlerini durdurmaz", async () => {
  const seen: number[] = [];
  const out = await users.forEachUser("deneme", async (uid) => {
    seen.push(ctx.contextUserId()!);
    if (uid === A) throw new Error("A'da hata");
    return (await portfolio.listTransactions()).length;
  });
  assert.deepEqual(seen.slice(0, 3), [OWNER, A, B]);
  assert.equal(seen.length, 6, "sahip, A, B, E, C, D");
  assert.deepEqual(out, [1, 0, 0, 0, 0]);
});

await db.closeDb();
fs.rmSync(DIR, { recursive: true, force: true });
console.log(`\n${passed} test geçti.`);
