// Teknik gösterge motoru ve sinyal kurallarının birim testleri (ağ / veritabanı yok).
// ÇALIŞTIRMA: npm run test:indicators
import assert from "node:assert/strict";
import { bollinger, ema, macd, recentCross, rsi, sma, volumeRatio } from "../src/lib/indicators";
import { evaluateSignals, indicatorRows, labelForScore, type TechnicalSnapshot } from "../src/lib/signalRules";

let passed = 0;
function ok(name: string) {
  passed++;
  console.log(`  ✓ ${name}`);
}
const near = (a: number | null, b: number, tol: number, msg?: string) =>
  assert.ok(a != null && Math.abs(a - b) <= tol, `${msg ?? ""} beklenen ${b}, bulunan ${a}`);

console.log("Göstergeler");

// SMA / EMA: elle hesaplanmış küçük örnekler
assert.deepEqual(sma([1, 2, 3, 4, 5], 3), [null, null, 2, 3, 4]);
// EMA(3): α = 0,5; ilk değer SMA(1,2,3) = 2; sonra 4·0,5 + 2·0,5 = 3; 10·0,5 + 3·0,5 = 6,5
assert.deepEqual(ema([1, 2, 3, 4, 10], 3), [null, null, 2, 3, 6.5]);
ok("SMA ve EMA elle hesaplanan değerlerle aynı");

// RSI(14): StockCharts'ın klasik Wilder örneği (cs-rsi tablosu).
const closes = [
  44.34, 44.09, 44.15, 43.61, 44.33, 44.83, 45.1, 45.42, 45.84, 46.08, 45.89, 46.03, 45.61, 46.28, 46.28, 46.0, 46.03, 46.41, 46.22, 45.64, 46.21,
  46.25, 45.71, 46.45, 45.78, 45.35, 44.03, 44.18, 44.22, 44.57, 43.42, 42.66, 43.13,
];
const r = rsi(closes, 14);
assert.equal(r[13], null);
// Elle: ilk 14 değişimde kazançlar 3,34, kayıplar 1,40 → ort. 0,238571 / 0,1 → RS 2,385714 → RSI 70,464
near(r[14], 100 - 100 / (1 + 3.34 / 14 / (1.4 / 14)), 1e-9, "RSI ilk değer (elle)");
near(r[14], 70.46, 0.01, "RSI ilk değer");
// StockCharts'ın yayımladığı değerler (ara ortalamaları yuvarladıkları için ±0,1 tolerans)
const published = [70.53, 66.32, 66.55, 69.41, 66.36, 57.97, 62.93, 63.26, 56.06, 62.38, 54.71, 50.42, 39.99, 41.46, 41.87, 45.46, 37.3, 33.08, 37.77];
published.forEach((v, k) => near(r[14 + k], v, 0.1, `RSI[${14 + k}]`));
// Sınırlar: sürekli yükseliş → 100, sürekli düşüş → 0
near(rsi(Array.from({ length: 30 }, (_, i) => i), 14).at(-1)!, 100, 1e-9);
near(rsi(Array.from({ length: 30 }, (_, i) => 30 - i), 14).at(-1)!, 0, 1e-9);
ok(`RSI(14) referansla aynı (ilk değer ${r[14]!.toFixed(2)}, son ${r.at(-1)!.toFixed(2)})`);

// MACD(12,26,9): doğrusal seride (x_t = t) n günlük EMA tam olarak (n−1)/2 geride kalır.
// MACD = EMA12 − EMA26 = (26−1)/2 − (12−1)/2 = 7; sinyal de 7, histogram 0.
const lin = Array.from({ length: 80 }, (_, i) => i);
const m = macd(lin);
assert.equal(m.macd[24], null);
near(m.macd[25], 7, 1e-9, "MACD ilk değer");
near(m.macd[79], 7, 1e-9);
assert.equal(m.signal[32], null);
near(m.signal[33], 7, 1e-9, "sinyal ilk değer");
near(m.histogram[79], 0, 1e-9);
// Elle: eğimi 2 olan seride MACD = 14
near(macd(lin.map((x) => 2 * x + 5)).macd[50], 14, 1e-9);
ok("MACD(12,26,9) analitik değerlerle aynı (doğrusal seride 7)");

// Bollinger(20,2): sabit seride bantlar = ortalama; 1..20 serisinde σ = √((20²−1)/12)
const bConst = bollinger(new Array(25).fill(10), 20, 2);
near(bConst.upper[24], 10, 1e-9);
near(bConst.lower[24], 10, 1e-9);
const b = bollinger(Array.from({ length: 20 }, (_, i) => i + 1), 20, 2);
const sd = Math.sqrt((20 * 20 - 1) / 12);
near(b.middle[19], 10.5, 1e-9);
near(b.upper[19], 10.5 + 2 * sd, 1e-9);
near(b.lower[19], 10.5 - 2 * sd, 1e-9);
ok(`Bollinger bantları doğru (σ=${sd.toFixed(4)})`);

// Hacim oranı
near(volumeRatio([...new Array(20).fill(100), 250], 20), 2.5, 1e-9);
assert.equal(volumeRatio([...new Array(20).fill(0), 250], 20), null);
assert.equal(volumeRatio([1, 2, 3], 20), null);
ok("hacim / ortalama oranı");

// Kesişim
assert.deepEqual(recentCross([1, 2, 3, 5], [2, 2.5, 4, 4], 3), { dir: 1, barsAgo: 0 });
assert.deepEqual(recentCross([5, 3, 3, 3], [4, 4, 4, 4], 3), { dir: -1, barsAgo: 2 });
assert.deepEqual(recentCross([5, 3, 3, 3, 3], [4, 4, 4, 4, 4], 3), { dir: 0, barsAgo: null });
ok("kesişim tespiti");

console.log("Sinyal kuralları");
const base: TechnicalSnapshot = {
  bars: 300,
  close: 100,
  changePct: 0.5,
  sma20: 100,
  sma50: 100,
  sma200: 100,
  ema20: 100,
  ema50: 100,
  ema200: 100,
  rsi: 50,
  macd: 0,
  macdSignal: 0,
  macdHist: 0,
  macdCross: { dir: 0, barsAgo: null },
  bbUpper: 110,
  bbMiddle: 100,
  bbLower: 90,
  smaCross: { dir: 0, barsAgo: null },
  volumeRatio: 1,
};
assert.equal(evaluateSignals(base).label, "Nötr");
const bull = evaluateSignals({ ...base, close: 120, sma50: 110, sma200: 100, rsi: 25, macd: 1, macdSignal: 0.5, macdCross: { dir: 1, barsAgo: 0 }, bbUpper: 130 });
assert.equal(bull.label, "Güçlü Al");
assert.ok(bull.reasons.every((x) => x.explain.length > 20));
assert.ok(bull.reasons.some((x) => x.id === "rsi_low"));
const bear = evaluateSignals({ ...base, close: 80, sma50: 90, sma200: 100, rsi: 75, macd: -1, macdSignal: 0, smaCross: { dir: -1, barsAgo: 2 }, bbLower: 70 });
assert.equal(bear.label, "Güçlü Sat");
assert.ok(bear.reasons.some((x) => x.id === "death_cross"));
assert.equal(evaluateSignals({ ...base, bars: 10 }).insufficient != null, true);
assert.equal(labelForScore(2), "Al");
assert.equal(labelForScore(-2), "Sat");
assert.equal(labelForScore(1), "Nötr");
ok(`kurallar: boğa → ${bull.label} (${bull.score}), ayı → ${bear.label} (${bear.score})`);

// Seans sürerken hacim kısmi: etiketlenir, düşük oran "az işlem" sayılmaz
{
  const partialLow = indicatorRows({ ...base, volumeRatio: 0.3, volumePartial: true }).find((r) => r.key === "volume")!;
  assert.match(partialLow.label, /gün içi, kısmi/);
  assert.doesNotMatch(partialLow.state, /ortalamadan az işlem/);
  const fullLow = indicatorRows({ ...base, volumeRatio: 0.3 }).find((r) => r.key === "volume")!;
  assert.equal(fullLow.label, "Hacim / ortalama");
  assert.match(fullLow.state, /az işlem/);
  const hi = evaluateSignals({ ...base, volumeRatio: 2, volumePartial: true, changePct: 1 }).reasons.find((r) => r.id === "volume_up");
  assert.ok(hi && /kısmi/.test(hi.title), "kısmi hacim eşiği aşarsa sinyal yine verilir");
  ok("gün içi kısmi hacim etiketlenir");
}

console.log(`\n${passed} test geçti.`);
