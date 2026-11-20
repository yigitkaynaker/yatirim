// Temettü hak ediş mantığı (hak kullanım tarihinde elde tutulan adet), TEFAS sıfır fiyat
// ayıklaması, altın kaynağı ayrıştırması ve "bugün" değişimi birim testleri (ağ / veritabanı yok).
// ÇALIŞTIRMA: npm run test:sources
import assert from "node:assert/strict";
import { eligibleDividends, quantityHeldBefore, type HoldingTx } from "../src/lib/dividendLogic";
import { parseFundPrices, parseGenelparaEntry, parseIstanbulDateTime, parseLooseJson, parseTruncgilEntry } from "../src/lib/sourceParse";
import { dayChange, type PositionTx } from "../src/lib/positions";

let passed = 0;
function ok(name: string) {
  passed++;
  console.log(`  ✓ ${name}`);
}
const near = (a: number | null | undefined, b: number, msg: string, tol = 1e-6) =>
  assert.ok(a != null && Math.abs(a - b) <= tol, `${msg}: beklenen ${b}, bulunan ${a}`);

let id = 1;
const tx = (side: "buy" | "sell", quantity: number, date: string): HoldingTx => ({ id: id++, side, quantity, date });

console.log("Temettü hak edişi");
{
  const txs = [tx("buy", 100, "2025-01-10"), tx("sell", 40, "2025-06-16"), tx("buy", 10, "2025-06-17")];
  assert.equal(quantityHeldBefore(txs, "2025-01-10"), 0);
  assert.equal(quantityHeldBefore(txs, "2025-01-11"), 100);
  // Hak kullanım günü yapılan satış hakkı kaybettirmez
  assert.equal(quantityHeldBefore(txs, "2025-06-16"), 100);
  assert.equal(quantityHeldBefore(txs, "2025-06-17"), 60);
  assert.equal(quantityHeldBefore(txs, "2025-06-18"), 70);
  ok("hak kullanım tarihinden önceki günün sonundaki adet sayılır (o günkü alış/satış hariç)");
}
{
  const txs = [tx("buy", 50, "2025-03-01")];
  const ev = [
    { date: "2025-02-28", amount: 2 }, // alıştan önce: hak yok
    { date: "2025-03-01", amount: 2 }, // alış günü: hak yok
    { date: "2025-06-16", amount: 3.442029 }, // elde: 50 × 3,442029
    { date: "2099-01-01", amount: 5 }, // gelecekte: henüz yok
    { date: "2025-09-02", amount: 0 }, // geçersiz tutar
  ];
  const r = eligibleDividends(txs, ev, "2026-11-20");
  assert.equal(r.length, 1);
  assert.equal(r[0].date, "2025-06-16");
  assert.equal(r[0].quantity, 50);
  near(r[0].total, 50 * 3.442029, "toplam");
  ok("yalnızca elde tutulurken ve bugüne kadar ödenen temettüler önerilir");
}
{
  const txs = [tx("buy", 10, "2024-01-02"), tx("sell", 10, "2024-05-01"), tx("buy", 5, "2024-08-01")];
  const r = eligibleDividends(txs, [{ date: "2024-06-01", amount: 1 }, { date: "2024-09-01", amount: 1 }, { date: "2024-04-01", amount: 1 }], "2026-01-01");
  assert.deepEqual(
    r.map((x) => [x.date, x.quantity]),
    [
      ["2024-09-01", 5],
      ["2024-04-01", 10],
    ],
  );
  ok("tamamen satılıp yeniden alınan pozisyonda aradaki temettü önerilmez");
}

console.log("TEFAS");
{
  const list = [
    { fonKodu: "AFT", fonUnvan: "AK PORTFÖY YENİ TEKNOLOJİLER", tarih: "2026-11-18", fiyat: 0.838327 },
    { fonKodu: "AFT", fonUnvan: "AK PORTFÖY YENİ TEKNOLOJİLER", tarih: "2026-11-19", fiyat: 0.839415 },
    { fonKodu: "AFT", fonUnvan: "AK PORTFÖY YENİ TEKNOLOJİLER", tarih: "2026-11-20", fiyat: 0 },
  ];
  const f = parseFundPrices("AFT", list);
  assert.equal(f.history.length, 2);
  assert.equal(f.last?.date, "2026-11-19");
  assert.equal(f.last?.price, 0.839415);
  assert.equal(f.prev?.price, 0.838327);
  assert.equal(f.skipped, 1);
  assert.equal(f.name, "AK PORTFÖY YENİ TEKNOLOJİLER");
  ok("fiyatı 0 olan gün atlanır; son geçerli fiyat kullanılır");
}
{
  const f = parseFundPrices("TLY", [
    { fonKodu: "TLY", tarih: "2026-11-19", fiyat: 0 },
    { fonKodu: "TLY", tarih: "2026-11-20", fiyat: 0 },
  ]);
  assert.equal(f.last, null);
  assert.equal(f.prev, null);
  assert.equal(f.history.length, 0);
  ok("hep 0 dönen fonda fiyat yok (sıfır asla fiyat sayılmaz)");
}
{
  const f = parseFundPrices("ABC", [
    { fonKodu: "ABC", tarih: "2026-11-20", fiyat: 2 },
    { fonKodu: "ABC", tarih: "2026-11-18", fiyat: 1 },
    { fonKodu: "XYZ", tarih: "2026-11-19", fiyat: 99 },
    { fonKodu: "ABC", tarih: "bozuk", fiyat: 5 },
    { fonKodu: "ABC", tarih: "2026-11-19", fiyat: -3 },
    { fonKodu: "ABC", tarih: "2026-11-17", fiyat: "abc" },
  ]);
  assert.deepEqual(f.history.map((p) => p.date), ["2026-11-18", "2026-11-20"]);
  assert.equal(f.prev?.price, 1);
  assert.equal(parseFundPrices("ABC", null).last, null);
  assert.equal(parseFundPrices("ABC", "Erişim Engellendi").last, null);
  ok("sıralama, başka fon / bozuk tarih / eksi ve metin fiyat ayıklanır; beklenmeyen yanıt hata vermez");
}

console.log("Altın kaynakları");
{
  const cut = '{"Update_Date":"2026-11-20 15:54:02","CEYREKALTIN":{"Buying":9789,"Selling":9947,"Change":-0.29},"PAL":{"Buying":1482.58,"Sel';
  const d = parseLooseJson(cut);
  assert.equal(d.Update_Date, "2026-11-20 15:54:02");
  const c = parseTruncgilEntry(d.CEYREKALTIN);
  assert.deepEqual(c, { selling: 9947, buying: 9789, changePct: -0.29 });
  assert.equal(parseTruncgilEntry({ Buying: 0, Selling: 0, Change: 1 }), null);
  assert.equal(parseTruncgilEntry(d.PAL), null);
  assert.equal(parseIstanbulDateTime("2026-11-20 15:54:02"), Date.parse("2026-11-20T12:54:02Z"));
  ok("yarıda kesilen Truncgil yanıtı kurtarılır; 0 satış fiyatı geçersiz");
}
{
  assert.deepEqual(parseGenelparaEntry({ alis: "9395.28", satis: "9543.86", degisim: "-2.32" }), { selling: 9543.86, buying: 9395.28, changePct: -2.32 });
  assert.equal(parseGenelparaEntry({ alis: "0", satis: "0" }), null);
  ok("Genelpara (yedek) metin sayıları ayrıştırılır");
}

console.log("Bugün değişimi");
{
  const p = (side: "buy" | "sell", quantity: number, price: number, date: string, currency = "TRY", fxTry: number | null = 1): PositionTx => ({
    id: id++,
    assetType: "bist",
    symbol: "THYAO",
    side,
    quantity,
    price,
    currency,
    date,
    fxTry,
  });
  const one = () => 1;
  // Dünden 10 adet; önceki kapanış 100, şimdi 105 → +50 TL, %5
  let d = dayChange([p("buy", 10, 90, "2026-11-01")], "2026-11-20", 105, 100, 1, 1, one)!;
  near(d.changeTry, 50, "değişim");
  near(d.baseTry, 1000, "dayanak");
  // Bugün 102'den 5 adet daha alındı: +5×3 = 15 ek
  d = dayChange([p("buy", 10, 90, "2026-11-01"), p("buy", 5, 102, "2026-11-20")], "2026-11-20", 105, 100, 1, 1, one)!;
  near(d.changeTry, 65, "bugün alış dahil");
  // Bugün 4 adet 103'ten satıldı: kalan 6 × 5 + satılan 4 × 3 = 42
  d = dayChange([p("buy", 10, 90, "2026-11-01"), p("sell", 4, 103, "2026-11-20")], "2026-11-20", 105, 100, 1, 1, one)!;
  near(d.changeTry, 42, "bugün satış dahil");
  // USD varlık: fiyat 10 → 10, kur 40 → 41 → 1 × 10 × 1 = +10 TL
  d = dayChange([p("buy", 1, 9, "2026-11-01", "USD", 39)], "2026-11-20", 10, 10, 41, 40, (c) => (c === "USD" ? 41 : 1))!;
  near(d.changeTry, 10, "kur değişimi");
  assert.equal(dayChange([p("buy", 1, 9, "2026-11-01")], "2026-11-20", 10, null, 1, 1, one), null);
  ok("önceki kapanışa göre; bugünkü alış/satış ve kur değişimi hesaba katılır");
}

console.log(`\n${passed} test geçti.`);
