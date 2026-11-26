// Yardım katmanı testleri: kılavuz, sözlük ve ders içeriğinin bütünlüğü (kimlikler, iç
// bağlantılar, sözlük atıfları, ipucu terimleri) ve "İlk adımlar" kartının veri sorgusu
// (her iki veritabanı modunda). Ağ kullanmaz; geçici bir veri klasörü kullanır.
//   npm run test:help
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

if (!process.env.YATIRIM_DATA_DIR) process.env.YATIRIM_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "yatirim-help-"));

const { TERMS, hasTerm } = await import("../src/content/sozluk/terimler");
const { GUIDE_SECTIONS, guideLinks, guideTermRefs } = await import("../src/content/kilavuz/index");
const { LESSONS } = await import("../src/content/egitim/index");
const { resetDatabase } = await import("./test-db");
// Çok kullanıcılı mod: betik sahibin (kullanıcı 1) bağlamında çalışır.
(await import("../src/lib/userContext")).enterUserForScripts(1);

let passed = 0;
async function test(name: string, fn: () => void | Promise<void>) {
  await fn();
  passed++;
  console.log(`  ✓ ${name}`);
}

const ROOT = path.resolve(import.meta.dirname, "..");
const APP = path.join(ROOT, "src/app");

/** src/app altındaki statik sayfa yolları ("(grup)" klasörleri yol değildir) */
function pageRoutes(): Set<string> {
  const out = new Set<string>();
  const walk = (dir: string, parts: string[]) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      if (!e.isDirectory()) {
        if (e.name === "page.tsx") out.add("/" + parts.filter((p) => !p.startsWith("(")).join("/"));
        continue;
      }
      if (e.name === "api") continue;
      walk(path.join(dir, e.name), [...parts, e.name]);
    }
  };
  walk(APP, []);
  return out;
}

/** Bileşenlerde tanımlı sabit id="…" bağlantı noktaları */
function componentIds(): Set<string> {
  const ids = new Set<string>();
  const dir = path.join(ROOT, "src/components");
  const files = fs.readdirSync(dir, { recursive: true }) as string[];
  for (const f of files) {
    if (!f.endsWith(".tsx")) continue;
    for (const m of fs.readFileSync(path.join(dir, f), "utf8").matchAll(/\sid="([a-z0-9-]+)"/g)) ids.add(m[1]);
  }
  return ids;
}

const routes = pageRoutes();
const lessonSlugs = new Set(LESSONS.map((l) => l.slug));
const sectionIds = new Set(GUIDE_SECTIONS.map((s) => s.id));
const termIds = new Set<string>(TERMS.map((t) => t.id));
const fixedIds = componentIds();

/** İç bağlantı uygulamada karşılık buluyor mu (yol + #bölüm) */
function resolves(href: string): string | null {
  const u = new URL(href, "http://x");
  const p = u.pathname;
  const okPath = routes.has(p) || (p.startsWith("/egitim/") && lessonSlugs.has(p.slice("/egitim/".length)));
  if (!okPath) return `yol yok: ${p}`;
  const hash = decodeURIComponent(u.hash.slice(1));
  if (!hash) return null;
  if (p === "/kilavuz") return sectionIds.has(hash) ? null : `kılavuz bölümü yok: ${hash}`;
  if (p === "/sozluk") return termIds.has(hash) ? null : `sözlük terimi yok: ${hash}`;
  return fixedIds.has(hash) ? null : `bağlantı noktası yok: ${href}`;
}

console.log("İçerik");

await test("sözlük: yaklaşık 50 terim, benzersiz ve geçerli kimlikler, tek cümlelik ipucu", () => {
  assert.ok(TERMS.length >= 45, `terim sayısı ${TERMS.length}`);
  assert.equal(termIds.size, TERMS.length, "yinelenen terim kimliği");
  for (const t of TERMS) {
    assert.match(t.id, /^[a-z0-9-]+$/, t.id);
    assert.ok(t.short.endsWith("."), `${t.id}: ipucu nokta ile bitmeli`);
    assert.ok(t.short.split(/[.!?](\s|$)/).filter((x) => x && x.trim()).length <= 1, `${t.id}: ipucu tek cümle olmalı`);
    assert.ok(t.definition.length > 20 && t.example.includes("TL"), `${t.id}: tanım ve TL örneği`);
  }
});

await test("ipuçlarının kapsadığı terimler sözlükte var", () => {
  const required = ["ortalama-maliyet", "gerceklesmemis-kz", "gerceklesen-kz", "bugun", "kur-etkisi", "xirr", "makas", "stopaj", "komisyon", "temettu", "rsi", "sinyal-skoru", "risk-puani", "benchmark"];
  for (const id of required) assert.ok(hasTerm(id), id);
  // Bileşenlerde kullanılan her term="…" sözlükte olmalı (tip denetimine ek olarak)
  const dir = path.join(ROOT, "src/components");
  for (const f of fs.readdirSync(dir, { recursive: true }) as string[]) {
    if (!f.endsWith(".tsx")) continue;
    for (const m of fs.readFileSync(path.join(dir, f), "utf8").matchAll(/\bterm="([a-z0-9-]+)"/g)) assert.ok(hasTerm(m[1]), `${f}: ${m[1]}`);
  }
});

await test("kılavuz: 18 bölüm, benzersiz kimlik, her bölümde 'Uygulamada aç' ya da SSS", () => {
  assert.equal(GUIDE_SECTIONS.length, 18);
  assert.equal(sectionIds.size, GUIDE_SECTIONS.length);
  for (const s of GUIDE_SECTIONS) assert.ok(s.blocks.some((b) => b.type === "open" || b.type === "faq") || s.id === "guvenlik", s.id);
});

await test("kılavuzdaki sözlük atıfları geçerli", () => {
  const refs = guideTermRefs();
  assert.ok(refs.length > 20);
  for (const r of refs) assert.ok(hasTerm(r), r);
});

await test("tüm iç bağlantılar (kılavuz, sözlük, dersler) uygulamada karşılık buluyor", () => {
  const links = [
    ...guideLinks(),
    ...TERMS.flatMap((t) => ("more" in t && t.more ? [t.more.href] : [])),
    ...LESSONS.flatMap((l) => l.tryIt.map((x) => x.href)),
    ...[...termIds].map((id) => `/sozluk#${id}`),
  ];
  const bad = links.map((h) => resolves(h)).filter(Boolean);
  assert.deepEqual(bad, []);
  assert.ok(routes.has("/kilavuz") && routes.has("/sozluk"));
});

await test("yeni dersler: kayıtlı, testli, çizimli; 1. ders 'İlk adımlar' ile aynı", async () => {
  for (const slug of ["ucretler-ve-komisyon", "vergi-temelleri-stopaj", "cesitlendirme", "duygular-ve-asiri-islem"]) {
    const l = LESSONS.find((x) => x.slug === slug);
    assert.ok(l, slug);
    assert.equal(l.track, "temel");
    assert.ok(l.diagram, `${slug}: çizim`);
    assert.equal(l.quiz.length, 3);
    for (const q of l.quiz) assert.ok(q.answer >= 0 && q.answer < q.options.length);
    assert.ok(l.tryIt.length > 0);
  }
  const src = fs.readFileSync(path.join(ROOT, "src/components/FirstSteps.tsx"), "utf8");
  assert.ok(src.includes(`FIRST_LESSON_SLUG = "${LESSONS[0].slug}"`), "FIRST_LESSON_SLUG güncel değil");
});

await test("yatırım aracı bölümleri: her bölümde 2+ ders, benzersiz slug, geçerli testler", async () => {
  const { TRACKS } = await import("../src/content/egitim/types");
  assert.equal(lessonSlugs.size, LESSONS.length, "yinelenen ders slug'ı");
  for (const t of TRACKS) assert.ok(LESSONS.filter((l) => l.track === t.id).length >= (t.id === "temel" ? 4 : 2), t.id);
  for (const l of LESSONS.filter((x) => x.track && x.track !== "temel")) {
    assert.equal(l.quiz.length, 3, l.slug);
    for (const q of l.quiz) assert.ok(q.answer >= 0 && q.answer < q.options.length, l.slug);
    assert.ok(l.what.length >= 2 && l.steps.length >= 3 && l.mistakes.length >= 2 && l.tryIt.length > 0, l.slug);
  }
});

console.log("İlk adımlar (veritabanı)");
await resetDatabase();
const db = await import("../src/lib/db");
const { getOnboardingStatus } = await import("../src/lib/onboarding");

await test("boş veritabanında hiçbir madde işaretli değil", async () => {
  assert.deepEqual(await getOnboardingStatus(), { sanal: false, izleme: false, emirAlarm: false, bildirim: false });
});

await test("sanal işlem, izleme listesi, alarm ve abonelik eklenince maddeler işaretlenir", async () => {
  const d = await db.getDb();
  await d.run("INSERT INTO transactions (user_id, asset_type, symbol, side, quantity, price, currency, date, mode) VALUES (1, 'crypto', 'BTC', 'buy', 1, 100, 'USD', '2026-11-20', 'real')");
  assert.equal((await getOnboardingStatus()).sanal, false, "gerçek işlem sanal sayılmaz");
  await d.run("INSERT INTO transactions (user_id, asset_type, symbol, side, quantity, price, currency, date, mode) VALUES (1, 'crypto', 'BTC', 'buy', 0.5, 100, 'USD', '2026-11-20', 'virtual')");
  assert.equal((await getOnboardingStatus()).sanal, true);
  await d.run("INSERT INTO watchlist (user_id, asset_type, symbol) VALUES (1, 'crypto', 'ETH')");
  await d.run("INSERT INTO alarms (user_id, kind, asset_type, symbol, threshold) VALUES (1, 'price', 'crypto', 'ETH', 100)");
  await d.run("INSERT INTO push_subscriptions (user_id, endpoint, p256dh, auth) VALUES (1, 'https://push.example/abc', 'p', 'a')");
  assert.deepEqual(await getOnboardingStatus(), { sanal: true, izleme: true, emirAlarm: true, bildirim: true });
});

await db.closeDb();
console.log(`\n${passed} test geçti.`);
