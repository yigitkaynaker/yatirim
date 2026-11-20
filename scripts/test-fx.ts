// İşlem tarihi kuruyla TL maliyet / K/Z ve "fiyat etkisi / kur etkisi" ayrımının birim testleri
// (ağ / veritabanı yok).
// ÇALIŞTIRMA: npm run test:fx
import assert from "node:assert/strict";
import { buildPositions, closeOnOrBefore, positionPnl, type PositionTx } from "../src/lib/positions";

let passed = 0;
function ok(name: string) {
  passed++;
  console.log(`  ✓ ${name}`);
}
const near = (a: number | null, b: number, msg: string, tol = 1e-6) =>
  assert.ok(a != null && Math.abs(a - b) <= tol, `${msg}: beklenen ${b}, bulunan ${a}`);

let nextId = 1;
const tx = (p: Partial<PositionTx> & Pick<PositionTx, "side" | "quantity" | "price" | "date">): PositionTx => ({
  id: nextId++,
  assetType: "foreign",
  symbol: "AAPL",
  currency: "USD",
  fxTry: null,
  ...p,
});
const rates = (usd: number | null) => (cur: string) => (cur === "TRY" ? 1 : cur === "USD" ? usd : null);

console.log("Kur etkisi");

// Örnek: 10 AAPL $100'dan, USDTRY 40 iken alındı; bugün fiyat yine $100, USDTRY 50.
{
  const [p] = buildPositions([tx({ side: "buy", quantity: 10, price: 100, date: "2026-05-20", fxTry: 40 })], rates(50));
  const b = positionPnl(p, "USD", 100, rates(50));
  near(b.pnl, 0, "USD K/Z");
  near(b.cost, 1000, "USD maliyet");
  near(b.costTry, 40_000, "TL maliyet alış kuruyla");
  near(b.valueTry, 50_000, "TL değer bugünkü kurla");
  near(b.pnlTry, 10_000, "TL K/Z");
  near(b.priceEffectTry, 0, "fiyat etkisi");
  near(b.fxEffectTry, 10_000, "kur etkisi");
  assert.equal(p.fxEstimated, false);
  ok("$100 → $100, kur 40 → 50: USD K/Z 0, TL K/Z +10.000 TL, tamamı kur etkisi");
}

// Fiyat da kur da hareket etti: $100 → $120, kur 40 → 50
{
  const [p] = buildPositions([tx({ side: "buy", quantity: 10, price: 100, date: "2026-05-20", fxTry: 40 })], rates(50));
  const b = positionPnl(p, "USD", 120, rates(50));
  near(b.pnl, 200, "USD K/Z");
  near(b.pnlTry, 20_000, "TL K/Z");
  near(b.priceEffectTry, 10_000, "fiyat etkisi = 200 $ × 50");
  near(b.fxEffectTry, 10_000, "kur etkisi = 1000 $ × (50 − 40)");
  near(b.priceEffectTry! + b.fxEffectTry!, b.pnlTry!, "toplam");
  ok("$100 → $120, kur 40 → 50: fiyat etkisi +10.000, kur etkisi +10.000");
}

// Kur düştüyse kur etkisi eksi olur
{
  const [p] = buildPositions([tx({ side: "buy", quantity: 2, price: 50, date: "2026-01-02", fxTry: 45 })], rates(42));
  const b = positionPnl(p, "USD", 60, rates(42));
  near(b.priceEffectTry, 20 * 42, "fiyat etkisi");
  near(b.fxEffectTry, 100 * (42 - 45), "kur etkisi");
  ok("kur düşünce kur etkisi negatif");
}

// Farklı kurlarla iki alış + kısmi satış: gerçekleşen TL K/Z satış günü kuruyla
{
  const txs = [
    tx({ side: "buy", quantity: 10, price: 100, date: "2026-01-10", fxTry: 40 }),
    tx({ side: "buy", quantity: 10, price: 200, date: "2026-03-10", fxTry: 45 }),
    tx({ side: "sell", quantity: 5, price: 180, date: "2026-06-10", fxTry: 50 }),
  ];
  const [p] = buildPositions(txs, rates(55));
  near(p.quantity, 15, "kalan adet");
  // TL maliyet 40.000 + 90.000 = 130.000; satılan 1/4 → 32.500 düşülür
  near(p.costTry, 97_500, "kalan TL maliyet");
  near(p.realizedTry, 5 * 180 * 50 - 32_500, "gerçekleşen TL K/Z (satış kuru 50)");
  near(p.realizedBy.get("USD")!, 900 - 750, "gerçekleşen USD K/Z değişmedi");
  const b = positionPnl(p, "USD", 150, rates(55));
  near(b.cost, 2250, "USD maliyet (ağırlıklı ortalama)");
  near(b.pnl, 0, "USD K/Z");
  near(b.pnlTry, 15 * 150 * 55 - 97_500, "TL K/Z");
  near(b.fxEffectTry, b.pnlTry!, "USD K/Z 0 → tamamı kur etkisi");
  ok("iki alış + kısmi satış: TL maliyet ve gerçekleşen K/Z işlem günü kurlarıyla");
}

// Kuru henüz bilinmeyen işlem: geçici olarak bugünkü kur, fxEstimated işaretli
{
  const [p] = buildPositions([tx({ side: "buy", quantity: 1, price: 100, date: "2026-02-02", fxTry: null })], rates(50));
  assert.equal(p.fxEstimated, true);
  const b = positionPnl(p, "USD", 100, rates(50));
  near(b.fxEffectTry, 0, "kur bilinmiyorsa kur etkisi 0");
  const [q] = buildPositions([tx({ side: "buy", quantity: 1, price: 100, date: "2026-02-02", fxTry: null })], rates(null));
  assert.equal(positionPnl(q, "USD", 100, rates(null)).pnlTry, null, "kur hiç yoksa TL K/Z hesaplanamaz");
  ok("kuru eksik işlem güncel kura düşer ve işaretlenir; kur yoksa TL K/Z null");
}

// TL varlık: kur etkisi yok, sonuçlar eskisiyle aynı
{
  const thy = (p: Partial<PositionTx> & Pick<PositionTx, "side" | "quantity" | "price" | "date">) =>
    tx({ assetType: "bist", symbol: "THYAO", currency: "TRY", fxTry: 1, ...p });
  const [p] = buildPositions([thy({ side: "buy", quantity: 100, price: 300, date: "2026-01-05" }), thy({ side: "sell", quantity: 40, price: 330, date: "2026-02-05" })], rates(50));
  near(p.realizedTry, 40 * 30, "gerçekleşen");
  const b = positionPnl(p, "TRY", 310, rates(50));
  near(b.pnlTry, 60 * 10, "TL K/Z");
  near(b.fxEffectTry, 0, "kur etkisi");
  ok("TRY varlıkta kur etkisi 0, K/Z değişmedi");
}

console.log("Geçmiş kur seçimi");
{
  const closes = [
    { date: "2026-05-14", close: 38.9 },
    { date: "2026-05-15", close: 39.1 }, // Cuma
    { date: "2026-05-18", close: 39.4 },
  ];
  assert.equal(closeOnOrBefore(closes, "2026-05-15"), 39.1);
  assert.equal(closeOnOrBefore(closes, "2026-05-17"), 39.1, "hafta sonu → Cuma kapanışı");
  assert.equal(closeOnOrBefore(closes, "2026-05-30"), 39.4);
  assert.equal(closeOnOrBefore(closes, "2026-05-01"), null);
  ok("tarihteki ya da öncesindeki son kapanış (hafta sonu → Cuma)");
}

console.log(`\n${passed} test geçti.`);
