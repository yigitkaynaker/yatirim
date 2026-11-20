// Geliştirme paketi B birim testleri: alarm tetikleme / bekleme süresi, RSS ayrıştırma,
// rakam son kontrolü, zaman ağırlıklı getiri ve kıyaslama, risk ölçütleri, hedef dağılım,
// temettü bölünme düzeltmesi ve stopaj, "bugün" kenar durumu, günlük fiyat tazeliği,
// KAP başlangıç tarihi, bütçe ay aralığı. Ağ ve veritabanı kullanmaz.
//   npm run test:batchb
import assert from "node:assert/strict";
import { conditionMet, evaluateAlarm, describeRule, type AlarmRule, type InstrumentState } from "../src/lib/alarmLogic";
import { dedupeHeadlines, decodeEntities, parseRss, titleKey } from "../src/lib/rssParse";
import { extractNumbers, unverifiedNumbers } from "../src/lib/numberCheck";
import { dailyReturns, rebalance, rebase, returnSince, riskMetrics, stdev, twrIndex } from "../src/lib/perfMath";
import { netOfWithholding, unadjustForSplits } from "../src/lib/dividendLogic";
import { dayChange, type PositionTx } from "../src/lib/positions";
import { parseDecimal } from "../src/lib/format";
import { quoteUsable } from "../src/lib/prices";
import { kapFromMs } from "../src/lib/kap";
import { monthRangeUtc } from "../src/lib/aiClient";
import { moodLabel, parseFng } from "../src/lib/analytics";

let passed = 0;
function test(name: string, fn: () => void) {
  fn();
  passed++;
  console.log(`  ✓ ${name}`);
}
const near = (a: number | null | undefined, b: number, eps = 1e-6) => assert.ok(a != null && Math.abs(a - b) < eps, `${a} ≈ ${b}`);

// ---- Alarmlar -------------------------------------------------------------------------------
console.log("Alarm mantığı");
const MIN = 60_000;
const priceUp: AlarmRule = { kind: "price", direction: "up", threshold: 100, repeat: "every", cooldownMin: 30 };

test("fiyat eşiği: koşul ve yön", () => {
  assert.equal(conditionMet(priceUp, 100), true);
  assert.equal(conditionMet(priceUp, 99.99), false);
  assert.equal(conditionMet({ ...priceUp, direction: "down" }, 99), true);
  const day: AlarmRule = { kind: "day_change", direction: "both", threshold: 5, repeat: "every", cooldownMin: 0 };
  assert.equal(conditionMet(day, -5.2), true);
  assert.equal(conditionMet(day, 4.9), false);
  assert.equal(conditionMet({ ...day, direction: "down" }, 6), false);
  assert.equal(conditionMet({ kind: "volume_spike", direction: "up", threshold: 2, repeat: "once", cooldownMin: 0 }, 2.4), true);
});

test("koşul sürdükçe tek kez çalar; bozulup yeniden oluşunca bekleme süresi uygulanır", () => {
  let st: InstrumentState | undefined;
  const t0 = 1_000_000_000_000;
  let e = evaluateAlarm(priceUp, st, { value: 101 }, t0);
  assert.equal(e.fire, true);
  st = e.next;
  e = evaluateAlarm(priceUp, st, { value: 102 }, t0 + MIN); // hâlâ üstünde → çalmaz
  assert.equal(e.fire, false);
  st = e.next;
  e = evaluateAlarm(priceUp, st, { value: 95 }, t0 + 2 * MIN); // altına indi → yeniden kurulur
  assert.equal(e.fire, false);
  assert.equal(e.next.armed, true);
  st = e.next;
  e = evaluateAlarm(priceUp, st, { value: 101 }, t0 + 3 * MIN); // 30 dk dolmadı → çalmaz ama kurulu kalır
  assert.equal(e.fire, false);
  assert.equal(e.next.armed, true);
  st = e.next;
  e = evaluateAlarm(priceUp, st, { value: 101 }, t0 + 31 * MIN); // süre doldu, koşul sürüyor → çalar
  assert.equal(e.fire, true);
});

test("veri yoksa durum değişmez; tek sefer kuralı servis tarafında kapanır", () => {
  const st: InstrumentState = { armed: false, lastFiredAt: 5 };
  const e = evaluateAlarm(priceUp, st, { value: null }, 10);
  assert.equal(e.fire, false);
  assert.deepEqual(e.next, st);
});

test("teknik sinyal: ilk etiket kaydedilir, değişince çalar", () => {
  const rule: AlarmRule = { kind: "signal_change", direction: "both", threshold: null, repeat: "every", cooldownMin: 0 };
  let e = evaluateAlarm(rule, undefined, { label: "Nötr" }, 1);
  assert.equal(e.fire, false);
  assert.equal(e.next.label, "Nötr");
  e = evaluateAlarm(rule, e.next, { label: "Nötr" }, 2);
  assert.equal(e.fire, false);
  e = evaluateAlarm(rule, e.next, { label: "Al" }, 3);
  assert.equal(e.fire, true);
  assert.equal(e.fromLabel, "Nötr");
  assert.equal(e.next.label, "Al");
});

test("alarm açıklaması Türkçe", () => {
  assert.match(describeRule({ kind: "day_change", direction: "both", threshold: 5, repeat: "once", cooldownMin: 60 }, { name: "THYAO" }), /THYAO bir günde %5/);
});

// ---- RSS ------------------------------------------------------------------------------------
console.log("RSS ayrıştırma");
const GOOGLE = `<?xml version="1.0"?><rss version="2.0"><channel><title>x</title>
<item><title>THYAO Ve PGSUS İçin Kritik Anlaşma &amp; Kapasite - Finans Hattı</title><link>https://news.google.com/rss/articles/ABC?oc=5</link><pubDate>Fri, 20 Nov 2026 12:30:00 GMT</pubDate><source url="https://finanshatti.com">Finans Hattı</source></item>
<item><title><![CDATA[THY yolcu sayısını açıkladı - AA]]></title><link>https://news.google.com/rss/articles/DEF</link><pubDate>Fri, 20 Nov 2026 10:00:00 GMT</pubDate></item>
<item><title>Bağlantısız</title></item>
</channel></rss>`;
const YAHOO = `<rss version="2.0"><channel><item><title>Apple&#39;s AI push</title><link>https://finance.yahoo.com/a.html</link><pubDate>Fri, 20 Nov 2026 15:13:36 +0000</pubDate></item>
<item><title>THY yolcu sayısını açıkladı</title><link>https://example.com/dup</link><pubDate>Fri, 20 Nov 2026 09:00:00 +0000</pubDate></item></channel></rss>`;

test("Google başlığı ve yayıncı ayrılır, CDATA ve varlıklar çözülür", () => {
  const g = parseRss(GOOGLE, "Google Haberler");
  assert.equal(g.length, 2);
  assert.equal(g[0].title, "THYAO Ve PGSUS İçin Kritik Anlaşma & Kapasite");
  assert.equal(g[0].publisher, "Finans Hattı");
  assert.equal(g[0].publishedAt, Date.parse("2026-11-20T12:30:00Z"));
  assert.equal(g[1].title, "THY yolcu sayısını açıkladı");
  assert.equal(g[1].publisher, "AA");
  assert.equal(decodeEntities("a&#39;b&#x26;c"), "a'b&c");
});

test("Yahoo beslemesi ve başlığa göre tekilleştirme (en yeni önce)", () => {
  const all = [...parseRss(GOOGLE, "Google Haberler"), ...parseRss(YAHOO, "Yahoo Finance")];
  const d = dedupeHeadlines(all);
  assert.equal(d.length, 3);
  assert.equal(d[0].title, "Apple's AI push");
  assert.equal(d.filter((h) => titleKey(h.title) === titleKey("THY yolcu sayısını açıkladı")).length, 1);
});

// ---- Rakam kontrolü ---------------------------------------------------------------------------
console.log("Rakam son kontrolü");
test("Türkçe/İngilizce sayı okuma, tarih/saat ve küçük sayılar atlanır", () => {
  const n = extractNumbers("20.11.2026 15:40 itibarıyla 3 hisse, fiyat 1.234,56 TL ve %2,5; 2026 yılı");
  assert.deepEqual(n.map((x) => x.raw), ["1.234,56", "2,5"]);
});

test("araç sonucundaki değerler (yuvarlanmış) doğrulanır, uydurma rakam işaretlenir", () => {
  const tool = JSON.stringify({ fiyat: 312.456, kz_yuzde: 4.0312, deger_tl: 15234.5 });
  const out = "THYAO 312,46 TL (veri zamanı 20.11.2026 15:40). Kârınız %4,03, değer 15.234,5 TL. Hedef fiyat 400 TL olabilir.";
  assert.deepEqual(unverifiedNumbers(out, [tool]), ["400"]);
  assert.deepEqual(unverifiedNumbers("Değer 15.234 TL", [tool]), []); // %0,5 içinde
  assert.deepEqual(unverifiedNumbers("BTC 61,838.26 USD", ['{"fiyat":61838.26}']), []);
});

// ---- TWR ve kıyaslama --------------------------------------------------------------------------
console.log("Getiri ve kıyaslama");
test("para eklemek getiri sayılmaz (zaman ağırlıklı getiri)", () => {
  // 1. gün 1000 TL; 2. gün %10 artış (1100); 3. gün 1000 TL eklendi, fiyat sabit (2100); 4. gün %5 düşüş (1995)
  const idx = twrIndex(
    [
      { date: "2026-11-02", value: 1000 },
      { date: "2026-11-03", value: 1100 },
      { date: "2026-11-04", value: 2100 },
      { date: "2026-11-05", value: 1995 },
    ],
    [
      { date: "2026-11-02", amount: 1000 },
      { date: "2026-11-04", amount: 1000 },
    ],
  );
  near(idx[1].value, 110);
  near(idx[2].value, 110);
  near(idx[3].value, 104.5);
  const r = dailyReturns(idx);
  near(r[0], 0.1);
  near(r[2], -0.05);
});

test("satış (para çekme) da getiriyi bozmaz; boş önceki gün atlanır", () => {
  const idx = twrIndex(
    [
      { date: "2026-11-02", value: 0 },
      { date: "2026-11-03", value: 2000 },
      { date: "2026-11-04", value: 1100 },
    ],
    [
      { date: "2026-11-03", amount: 2000 },
      { date: "2026-11-04", amount: -1000 },
    ],
  );
  near(idx[1].value, 100);
  near(idx[2].value, 105); // (1100 + 1000) / 2000
});

test("kıyaslama 100'e endekslenir, eksik gün önceki kapanışla doldurulur", () => {
  const closes = [
    { date: "2026-11-01", close: 50 },
    { date: "2026-11-03", close: 55 },
    { date: "2026-11-05", close: 60 },
  ];
  const r = rebase(closes, ["2026-11-02", "2026-11-04", "2026-11-05"]);
  [100, 110, 120].forEach((v, i) => near(r[i], v));
  near(returnSince(closes, "2026-11-03"), (60 / 55 - 1) * 100);
});

// ---- Risk -------------------------------------------------------------------------------------
console.log("Risk ve hedef dağılım");
test("yoğunlaşma, ilk 3, döviz payı, oynaklık", () => {
  const m = riskMetrics(
    [
      { name: "THYAO", assetType: "bist", currency: "TRY", valueTry: 5000 },
      { name: "AAPL", assetType: "foreign", currency: "USD", valueTry: 3000 },
      { name: "Gram Altın", assetType: "gold", currency: "TRY", valueTry: 1000 },
      { name: "BTC", assetType: "crypto", currency: "USD", valueTry: 1000 },
    ],
    [0.01, -0.02, 0.015, 0, 0.01, -0.01, 0.02, -0.005, 0.003, 0.004],
  );
  assert.equal(m.largest?.name, "THYAO");
  near(m.largest!.pct, 50);
  near(m.top3Pct, 90);
  assert.equal(m.assetTypeCount, 4);
  near(m.foreignCurrencyPct, 40);
  near(m.hhi, 0.25 + 0.09 + 0.01 + 0.01);
  assert.equal(m.concentrationScore, 36);
  assert.equal(m.concentrationLabel, "orta");
  near(m.volatilityPct!, stdev([0.01, -0.02, 0.015, 0, 0.01, -0.01, 0.02, -0.005, 0.003, 0.004])! * Math.sqrt(252) * 100);
  assert.equal(riskMetrics([{ name: "X", assetType: "bist", currency: "TRY", valueTry: 1 }], [0.01]).volatilityPct, null);
});

test("dengeleme tutarları", () => {
  const rows = rebalance({ bist: 6000, gold: 4000 }, { bist: 50, gold: 30, fund: 20 });
  const by = Object.fromEntries(rows.map((r) => [r.key, r]));
  near(by.bist.adjustTry, -1000);
  near(by.gold.adjustTry, -1000);
  near(by.fund.adjustTry, 2000);
  near(by.bist.driftPct, 10);
});

// ---- Temettü ------------------------------------------------------------------------------------
console.log("Temettü");
test("bölünme sonrası düzeltilmiş tutar o günkü pay başına geri çevrilir", () => {
  const ev = unadjustForSplits(
    [
      { date: "2024-05-01", amount: 1 },
      { date: "2025-05-01", amount: 1 },
    ],
    [{ date: "2025-01-10", ratio: 2 }],
  );
  assert.equal(ev[0].amount, 2);
  assert.equal(ev[0].splitFactor, 2);
  assert.equal(ev[1].amount, 1);
});
test("stopaj sonrası net", () => {
  near(netOfWithholding(100, 15), 85);
  near(netOfWithholding(100, 0), 100);
});

// ---- Diğer düzeltmeler ---------------------------------------------------------------------------
console.log("Düzeltmeler");
const p = (side: "buy" | "sell", quantity: number, price: number, date: string): PositionTx =>
  ({ id: Math.random(), side, quantity, price, date, currency: "TRY", fxTry: 1 }) as unknown as PositionTx;
test("seans gününden sonra girilen işlem 'bugün'e sayılmaz", () => {
  const one = () => 1;
  const d = dayChange([p("buy", 10, 100, "2026-11-01"), p("buy", 5, 120, "2026-11-23")], "2026-11-20", 110, 100, 1, 1, one)!;
  near(d.changeTry, 100); // yalnızca eski 10 adet: 10 × (110 − 100)
  near(d.baseTry, 1000);
});
test("eksik tutar/miktar NaN olur (500 yerine Türkçe doğrulama hatası)", () => {
  assert.ok(Number.isNaN(parseDecimal(undefined)));
  assert.ok(Number.isNaN(parseDecimal(null)));
});
test("günlük fiyat (fon) birkaç günden eskiyse emir/alarm için kullanılmaz", () => {
  const now = Date.parse("2026-11-20T12:00:00Z");
  assert.equal(quoteUsable({ price: 1, stale: false, daily: true, sourceTime: now - 2 * 86_400_000 }, now), true);
  assert.equal(quoteUsable({ price: 1, stale: false, daily: true, sourceTime: now - 6 * 86_400_000 }, now), false);
  assert.equal(quoteUsable({ price: 1, stale: true, daily: false, sourceTime: now }, now), false);
  assert.equal(quoteUsable({ price: 1, stale: false, daily: false, sourceTime: null }, now), true);
});
test("KAP sorgu başlangıcı: son başarılıdan 1 gün önce, en fazla 7 gün", () => {
  const now = Date.parse("2026-11-20T12:00:00Z");
  const D = 86_400_000;
  assert.equal(kapFromMs(now, null, null), now - 3 * D);
  assert.equal(kapFromMs(now, now - 3 * D, null), now - 4 * D);
  assert.equal(kapFromMs(now, now - 30 * D, null), now - 7 * D);
  assert.equal(kapFromMs(now, now - 600_000, null), now - 600_000 - D);
  assert.equal(kapFromMs(now, null, now - 2 * D), now - 3 * D);
});
test("bütçe ayı İstanbul saatine göre [başlangıç, sonraki ay)", () => {
  assert.deepEqual(monthRangeUtc(new Date("2026-11-30T22:30:00Z")), { start: "2026-11-30 21:00:00", end: "2026-12-31 21:00:00" }); // İstanbul'da 1 Aralık
  assert.deepEqual(monthRangeUtc(new Date("2026-12-15T10:00:00Z")), { start: "2026-11-30 21:00:00", end: "2026-12-31 21:00:00" });
});
test("korku/açgözlülük ayrıştırma ve Türkçe etiket", () => {
  const l = parseFng('{"data":[{"value":"12","value_classification":"Extreme Fear","timestamp":"1795132800"},{"value":"60","value_classification":"Greed","timestamp":"1795046400"}]}');
  assert.equal(l.length, 2);
  assert.equal(l[1].value, 12); // eskiden yeniye
  assert.equal(moodLabel(12), "Aşırı Korku");
  assert.equal(moodLabel(50), "Nötr");
  assert.equal(moodLabel(80), "Aşırı Açgözlülük");
});

console.log(`\n${passed} test geçti.`);
