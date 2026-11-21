// Geliştirme paketi C testleri: XIRR bilinen değerler, komisyonun maliyete ve gerçekleşen K/Z'ye
// girmesi, CSV gidiş-dönüş (dışa aktar → boş veritabanına içe aktar → aynı pozisyonlar; mükerrer
// ve hatalı satır), C öncesi veritabanının "Ana hesap"a geçişi (toplamlar değişmeden) ve
// yedekleme / geri yükleme bütünlüğü. Ağ kullanmaz; geçici bir veri klasörü kullanır.
//   npm run test:batchc
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";

const DIR = fs.mkdtempSync(path.join(os.tmpdir(), "yatirim-batchc-"));
process.env.YATIRIM_DATA_DIR = DIR;

const { xirr, annualReturn, transactionFlows } = await import("../src/lib/xirr");
const { buildPositions, positionPnl } = await import("../src/lib/positions");
const csv = await import("../src/lib/csv");
const db = await import("../src/lib/db");
const portfolio = await import("../src/lib/portfolio");
const accounts = await import("../src/lib/accounts");
const io = await import("../src/lib/importExport");
const backup = await import("../src/lib/backup");
const { maxDrawdown } = await import("../src/lib/perfMath");

let passed = 0;
async function test(name: string, fn: () => void | Promise<void>) {
  await fn();
  passed++;
  console.log(`  ✓ ${name}`);
}
const near = (a: number | null | undefined, b: number, eps = 1e-6) => assert.ok(a != null && Math.abs(a - b) < eps, `${a} ≈ ${b}`);

/** Veritabanını tamamen sıfırlar (aynı klasörde yeni, boş dosya). */
function freshDb() {
  db.closeDb();
  for (const ext of ["", "-wal", "-shm"]) fs.rmSync(db.dbPath() + ext, { force: true });
  fs.rmSync(db.backupDir(), { recursive: true, force: true });
}

/** Hesap + enstrüman başına miktar / TL maliyet / gerçekleşen K/Z (ağ olmadan, işlem kurlarıyla) */
function holdingsSnapshot() {
  const names = accounts.accountNames();
  const txs = portfolio.activeTransactions("real");
  const out: Record<string, { q: number; cost: number; realized: number; fees: number }> = {};
  for (const p of buildPositions(txs, () => null)) {
    const key = `${names.get(p.accountId!) ?? "?"}|${p.assetType}:${p.symbol}`;
    out[key] = { q: Number(p.quantity.toFixed(8)), cost: Number(p.costTry.toFixed(4)), realized: Number(p.realizedTry.toFixed(4)), fees: Number(p.feesTry.toFixed(4)) };
  }
  return out;
}

// ---- XIRR ---------------------------------------------------------------------------------
console.log("Yıllık getiri (XIRR)");

await test("bir yılda %10: −1000 → +1100 (365 gün)", () => {
  near(xirr([{ date: "2021-01-01", amount: -1000 }, { date: "2022-01-01", amount: 1100 }]), 0.1, 1e-9);
});

await test("Excel belgesindeki örnek: %37,34", () => {
  const r = xirr([
    { date: "2008-01-01", amount: -10000 },
    { date: "2008-03-01", amount: 2750 },
    { date: "2008-10-30", amount: 4250 },
    { date: "2009-02-15", amount: 3250 },
    { date: "2009-04-01", amount: 2750 },
  ]);
  near(r, 0.373362535, 1e-6);
});

await test("iki yılda 4 kat → yıllık %100; zarar → eksi; tek yönlü akış → null", () => {
  near(xirr([{ date: "2020-01-01", amount: -100 }, { date: "2021-12-31", amount: 400 }]), 1.0, 1e-9);
  near(xirr([{ date: "2021-01-01", amount: -1000 }, { date: "2022-01-01", amount: 900 }]), -0.1, 1e-9);
  assert.equal(xirr([{ date: "2021-01-01", amount: -1000 }, { date: "2022-01-01", amount: -5 }]), null);
});

await test("paranın zamanı önemli: yıl sonunda eklenen para aynı kârla daha yüksek yıllık getiri verir", () => {
  // 1000 başta + 1000 yıl ortasında, sonunda 2200 → para ağırlıklı getiri %10'dan yüksek (ikinci para yarım yıl çalıştı)
  const r = xirr([
    { date: "2021-01-01", amount: -1000 },
    { date: "2021-07-02", amount: -1000 },
    { date: "2022-01-01", amount: 2200 },
  ])!;
  assert.ok(r > 0.13 && r < 0.14, `r=${r}`);
});

await test("30 günden kısa sürede yıllık getiri gösterilmez; işlem akışları komisyon içerir", () => {
  const a = annualReturn([{ date: "2026-11-01", amount: -100 }, { date: "2026-11-10", amount: 110 }]);
  assert.equal(a.pct, null);
  assert.match(a.note ?? "", /30/);
  const f = transactionFlows(
    [
      { side: "buy", quantity: 10, price: 100, fee: 5, currency: "TRY", fxTry: 1, date: "2025-01-01" },
      { side: "sell", quantity: 10, price: 110, fee: 5, currency: "USD", fxTry: 2, date: "2025-06-01" },
    ],
    () => null,
  )!;
  assert.deepEqual(f.map((x) => x.amount), [-1005, 2190]);
});

await test("Newton kök olmayan düz bölgeye yakınsarsa ikiye bölmeye geçilir", () => {
  // Bu akışlarda Newton ~%-90'da durur ama NPV sıfır değildir; eskiden null dönüyordu.
  const day = (n: number) => new Date(Date.UTC(2000, 0, 1) + n * 86_400_000).toISOString().slice(0, 10);
  const flows = [
    { date: day(0), amount: -741 },
    { date: day(1604), amount: 1435 },
    { date: day(4788), amount: -3209 },
    { date: day(5549), amount: 27 },
  ];
  const r = xirr(flows);
  assert.ok(r != null, "çözüm bulunmalı");
  // Kök çok dik bir bölgede (%-80 ile %-90 arası): iki yanında NPV'nin işareti değişmeli
  const t0 = Date.parse(`${flows[0].date}T00:00:00Z`);
  const npv = (x: number) => flows.reduce((s, f) => s + f.amount / Math.pow(1 + x, (Date.parse(`${f.date}T00:00:00Z`) - t0) / 86_400_000 / 365), 0);
  assert.ok(r > -0.9 && r < -0.8, `r=${r}`);
  assert.ok(npv(r - 1e-6) > 0 && npv(r + 1e-6) < 0, `npv(r±)=${npv(r - 1e-6)}, ${npv(r + 1e-6)}`);
});

await test("1 yıldan kısa: toplam getiri + uyarılı yıllık; aşırı değer 'anlamlı değil'", () => {
  const a = annualReturn([{ date: "2026-01-01", amount: -1000 }, { date: "2026-03-02", amount: 1100 }]);
  assert.equal(a.short, true);
  near(a.totalPct, 10, 1e-9);
  assert.ok(a.pct != null && a.pct > 70 && a.pct < 90, `pct=${a.pct}`);
  assert.match(a.note ?? "", /yıllıklandırılmış/);
  const b = annualReturn([{ date: "2026-01-01", amount: -1000 }, { date: "2026-02-05", amount: 2000 }]);
  assert.equal(b.pct, null);
  near(b.totalPct, 100, 1e-9);
  assert.match(b.note ?? "", /anlamlı değil \(süre çok kısa\)/);
  const c = annualReturn([{ date: "2021-01-01", amount: -1000 }, { date: "2022-01-01", amount: 1100 }]);
  assert.equal(c.short, false);
  assert.equal(c.note, null);
  near(c.pct, 10, 1e-6);
});

await test("en büyük düşüş", () => {
  near(maxDrawdown([100, 120, 90, 130, 104]), 25);
  assert.equal(maxDrawdown([]), null);
});

// ---- Komisyon ------------------------------------------------------------------------------
console.log("Komisyon");

await test("komisyon alışta maliyete, satışta gelire yansır (TL ve döviz)", () => {
  const base = { assetType: "bist" as const, symbol: "THYAO", currency: "TRY", fxTry: 1, accountId: 1 };
  const [p] = buildPositions(
    [
      { ...base, id: 1, side: "buy", quantity: 100, price: 10, fee: 5, date: "2025-01-02" },
      { ...base, id: 2, side: "sell", quantity: 50, price: 12, fee: 3, date: "2025-03-02" },
    ],
    () => 1,
  );
  near(p.costTry, 502.5);
  near(p.realizedTry, 600 - 3 - 502.5);
  near(p.feesTry, 8);
  assert.equal(p.sales.length, 1);
  near(p.sales[0].feeTry, 3);
  const b = positionPnl(p, "TRY", 12, () => 1);
  near(b.cost! / p.quantity, 10.05, 1e-9); // ortalama maliyet komisyon dahil
  const [u] = buildPositions([{ ...base, id: 3, currency: "USD", fxTry: 40, side: "buy", quantity: 2, price: 50, fee: 1, date: "2025-01-02" }], () => 45);
  near(u.costTry, 101 * 40);
});

await test("hesap varsayılan oranı ve açık komisyon (veritabanı)", () => {
  freshDb();
  const acc = accounts.createAccount({ name: "Midas", feePct: "0,2" });
  const tx = portfolio.createTransaction(
    portfolio.parseTransactionInput({ mode: "real", accountId: acc.id, assetType: "bist", symbol: "ASELS", side: "buy", quantity: "100", price: "50", currency: "TRY", date: "2025-02-03" }),
  );
  near(tx.fee, 10); // 5000 × %0,2
  const t2 = portfolio.parseTransactionInput({ mode: "real", accountId: acc.id, assetType: "bist", symbol: "ASELS", side: "buy", quantity: "1", price: "50", currency: "TRY", date: "2025-02-03", fee: "0" });
  assert.equal(t2.fee, 0);
  const t3 = portfolio.parseTransactionInput({ mode: "real", accountId: acc.id, assetType: "bist", symbol: "ASELS", side: "buy", quantity: "10", price: "50", currency: "TRY", date: "2025-02-03", feePct: "1" });
  near(t3.fee, 5);
  assert.throws(() => portfolio.parseTransactionInput({ mode: "real", assetType: "bist", symbol: "ASELS", side: "buy", quantity: "1", price: "1", currency: "TRY", date: "2025-02-03", fee: "5" }), /Komisyon/);
  // Pozisyonlar hesap başına: Ana hesapta olmayan ASELS satılamaz.
  const main = accounts.defaultAccount();
  assert.throws(
    () => portfolio.createTransaction(portfolio.parseTransactionInput({ mode: "real", accountId: main.id, assetType: "bist", symbol: "ASELS", side: "sell", quantity: "1", price: "50", currency: "TRY", date: "2025-03-03" })),
    /eldekinden fazla/,
  );
});

// ---- CSV ---------------------------------------------------------------------------------
console.log("CSV");

await test("Excel-TR biçimi: BOM, ';', ondalık virgül, gg.aa.yyyy; tırnak ve okuma", () => {
  const text = csv.toCsv(["Tarih", "Not", "Fiyat"], [[csv.trDate("2025-03-04"), 'a;b "c"', 1234.5]]);
  assert.ok(text.startsWith("﻿"));
  assert.equal(text, '﻿Tarih;Not;Fiyat\r\n04.03.2025;"a;b ""c""";1234,5\r\n');
  assert.deepEqual(csv.parseCsv(text), [["Tarih", "Not", "Fiyat"], ["04.03.2025", 'a;b "c"', "1234,5"]]);
  assert.equal(csv.parseNumberLoose("1.234,56"), 1234.56);
  assert.equal(csv.parseNumberLoose("1,234.56"), 1234.56);
  assert.equal(csv.parseNumberLoose("10.000"), 10000);
  assert.equal(csv.parseNumberLoose("0.2385"), 0.2385);
  assert.equal(csv.parseNumberLoose("₺12,5"), 12.5);
  assert.equal(csv.parseDateLoose("4.3.2025"), "2025-03-04");
  assert.equal(csv.parseDateLoose("2025-03-04"), "2025-03-04");
  assert.equal(csv.parseDateLoose("31.02.2025"), null);
  assert.equal(csv.detectDelimiter("a,b,c\n1,2,3"), ",");
});

await test("CSV formül enjeksiyonu: = + - @ sekme ile başlayan metne ' eklenir, sayılar sayı kalır", () => {
  const text = csv.toCsv(["A", "B"], [["=HYPERLINK(\"x\")", -12.5], ["+1", "@SUM(A1)"], ["-cmd", "\tx"], ["THYAO", "Not"]]);
  const rows = csv.parseCsv(text);
  assert.deepEqual(rows.slice(1), [
    ["'=HYPERLINK(\"x\")", "-12,5"],
    ["'+1", "'@SUM(A1)"],
    ["'-cmd", "'\tx"],
    ["THYAO", "Not"],
  ]);
});

await test("sayı okuma: 0.500 binlik sayılmaz; 1.234 Türkçe okunur ama belirsiz işaretlenir", () => {
  assert.equal(csv.parseNumberLoose("0.500"), 0.5);
  assert.equal(csv.parseNumberLoose("0,500"), 0.5);
  assert.equal(csv.parseNumberLoose("-0.250"), -0.25);
  assert.equal(csv.parseNumberLoose("1.234"), 1234);
  assert.equal(csv.parseNumberLoose("1,234"), 1.234);
  assert.equal(csv.isAmbiguousNumber("1.234"), true);
  assert.equal(csv.isAmbiguousNumber("1,234"), true);
  assert.equal(csv.isAmbiguousNumber("0.500"), false);
  assert.equal(csv.isAmbiguousNumber("1.234,5"), false);
  assert.equal(csv.isAmbiguousNumber("12,5"), false);
});

let exported = "";
let before: ReturnType<typeof holdingsSnapshot> = {};
await test("dışa aktar → boş veritabanına içe aktar → aynı pozisyonlar", () => {
  freshDb();
  const midas = accounts.createAccount({ name: "Midas", feePct: "0,1" });
  const banka = accounts.createAccount({ name: "Banka" });
  const main = accounts.defaultAccount();
  const add = (o: Record<string, unknown>, fx?: number) =>
    portfolio.recordTransaction(portfolio.parseTransactionInput({ mode: "real", currency: "TRY", ...o }), { fxTry: fx ?? null });
  add({ accountId: main.id, assetType: "bist", symbol: "THYAO", side: "buy", quantity: "100", price: "245,5", date: "2025-03-12", fee: "12,25", note: "İlk; noktalı \"virgül\"" });
  add({ accountId: midas.id, assetType: "bist", symbol: "THYAO", side: "buy", quantity: "50", price: "288", date: "2025-09-02" });
  add({ accountId: main.id, assetType: "bist", symbol: "THYAO", side: "sell", quantity: "40", price: "312,25", date: "2026-02-10", fee: "6" });
  add({ accountId: midas.id, assetType: "foreign", symbol: "AAPL", side: "buy", quantity: "5", price: "198,4", currency: "USD", date: "2025-04-22", fee: "1" }, 37.95);
  add({ accountId: midas.id, assetType: "foreign", symbol: "AAPL", side: "sell", quantity: "2", price: "231,1", currency: "USD", date: "2026-01-15", fee: "1" }, 43.05);
  add({ accountId: banka.id, assetType: "gold", symbol: "GRAM", side: "buy", quantity: "20", price: "3410", date: "2025-05-09" });
  add({ accountId: banka.id, assetType: "fund", symbol: "AFT", side: "buy", quantity: "1200", price: "0,238517", date: "2025-10-14", note: "=2+3 @x" });
  before = holdingsSnapshot();
  exported = io.exportTransactionsCsv();
  assert.ok(exported.startsWith("﻿"), "BOM");
  assert.ok(exported.split("\r\n")[0].includes(";"), "; ayırıcı");
  assert.match(exported, /245,5;/);
  assert.match(exported, /12\.03\.2025;Ana hesap;/);

  freshDb(); // yepyeni veritabanı (yalnızca "Ana hesap")
  const pv = io.previewImport(exported, { createAccounts: true });
  assert.equal(pv.counts.invalid, 0, JSON.stringify(pv.rows.filter((r) => r.errors.length).map((r) => r.errors)));
  assert.equal(pv.counts.valid, 7);
  assert.deepEqual(pv.unknownAccounts.sort(), ["Banka", "Midas"]);
  assert.equal(portfolio.activeTransactions("real").length, 0, "önizleme hiçbir şey kaydetmez");
  assert.equal(accounts.listAccounts().length, 1, "önizleme hesap da oluşturmaz");
  const r = io.commitImport(exported, { createAccounts: true });
  assert.equal(r.inserted, 7);
  assert.deepEqual(holdingsSnapshot(), before);
  const note = portfolio.activeTransactions("real").find((t) => t.note?.startsWith("İlk"))!.note;
  assert.equal(note, 'İlk; noktalı "virgül"');
  assert.match(exported, /;'=2\+3 @x\r\n/, "formül koruması");
  assert.equal(portfolio.activeTransactions("real").find((t) => t.symbol === "AFT")!.note, "=2+3 @x", "içe aktarmada ' geri alınır");
});

await test("aynı dosya ikinci kez: hepsi mükerrer, hiçbir şey eklenmez", () => {
  const r = io.commitImport(exported, { createAccounts: true });
  assert.equal(r.inserted, 0);
  assert.equal(r.skippedDuplicates, 7);
  assert.deepEqual(holdingsSnapshot(), before);
});

await test("hatalı satır önizlemede gösterilir; kayıt atomik (hiçbiri eklenmez)", () => {
  const n = portfolio.activeTransactions("real").length;
  const bad = [
    "Tarih;Hesap;Tür;Sembol;Yön;Miktar;Fiyat;Para birimi",
    "01.06.2026;Ana hesap;BIST hissesi;KCHOL;Alış;10;172,1;TRY",
    "32.13.2026;Ana hesap;BIST hissesi;SISE;Alış;abc;38,6;TRY",
    "02.06.2026;Ana hesap;BIST hissesi;TUPRS;Satış;5;150;TRY",
  ].join("\n");
  const pv = io.previewImport(bad);
  assert.equal(pv.counts.total, 3);
  assert.equal(pv.rows[0].errors.length, 0);
  assert.ok(pv.rows[1].errors.some((e) => /Tarih/.test(e)) && pv.rows[1].errors.some((e) => /Miktar/.test(e)));
  assert.ok(pv.rows[2].errors.some((e) => /fazla satış/.test(e)), pv.rows[2].errors.join());
  assert.throws(() => io.commitImport(bad), /hiçbir satır kaydedilmedi/);
  assert.equal(portfolio.activeTransactions("real").length, n);
});

await test("başka kurum dosyası: sütun eşleme ve varsayılan tür", () => {
  const other = ["İşlem Tarihi,Hisse,İşlem Tipi,Adet,Fiyat", "2026-06-03,KCHOL,ALIM,10,172.1", "2026-06-04,KCHOL,Satım,4,180.5"].join("\n");
  // "ALIM" / "Satım" tanınır; eşleme otomatik
  const pv = io.previewImport(other, { defaultAssetType: "bist" });
  assert.equal(pv.counts.valid, 2, JSON.stringify(pv.rows.map((r) => r.errors)));
  assert.equal(pv.rows[0].price, 172.1);
  assert.equal(pv.rows[0].symbol, "KCHOL");
  assert.equal(pv.rows[0].account, null);
  // elle eşleme: sütunları farklı yerlerde göster
  const pv2 = io.previewImport("x;y;z;w;v\n05.06.2026;THYAO;S;1;300", { mapping: { date: 0, symbol: 1, side: 2, quantity: 3, price: 4 }, defaultAssetType: "bist" });
  assert.equal(pv2.rows[0].side, "sell");
  assert.equal(pv2.counts.valid, 1);
});

await test("dosyada aynı satır iki kez: ikisi de eklenir; yeniden yüklemede ikisi de mükerrer", () => {
  const n = portfolio.activeTransactions("real").length;
  const twice = [
    "Tarih;Hesap;Tür;Sembol;Yön;Miktar;Fiyat;Para birimi",
    "08.06.2026;Ana hesap;BIST hissesi;EREGL;Alış;10;45,2;TRY",
    "08.06.2026;Ana hesap;BIST hissesi;EREGL;Alış;10;45,2;TRY",
  ].join("\n");
  const pv = io.previewImport(twice);
  assert.equal(pv.counts.valid, 2);
  assert.equal(pv.counts.duplicate, 0);
  assert.ok(pv.rows.every((r) => r.info.some((x) => /dosyada 2 kez var/.test(x))), JSON.stringify(pv.rows.map((r) => r.info)));
  assert.equal(io.commitImport(twice).inserted, 2);
  assert.equal(portfolio.activeTransactions("real").length, n + 2);
  const again = io.commitImport(twice);
  assert.equal(again.inserted, 0);
  assert.equal(again.skippedDuplicates, 2);
  // Üç kez geçen satır: veritabanında 2 tane var → yalnızca biri yeni
  const thrice = io.previewImport(twice + "\n08.06.2026;Ana hesap;BIST hissesi;EREGL;Alış;10;45,2;TRY");
  assert.equal(thrice.counts.duplicate, 2);
  assert.equal(thrice.counts.valid, 1);
});

await test("belirsiz sayı önizlemede uyarı olarak gösterilir (kaydı engellemez)", () => {
  const pv = io.previewImport(["Tarih;Hesap;Tür;Sembol;Yön;Miktar;Fiyat;Para birimi", "09.06.2026;Ana hesap;BIST hissesi;SISE;Alış;1.250;0.500;TRY"].join("\n"));
  assert.equal(pv.counts.invalid, 0);
  assert.equal(pv.rows[0].quantity, 1250);
  assert.equal(pv.rows[0].price, 0.5);
  assert.equal(pv.rows[0].warnings.length, 1, JSON.stringify(pv.rows[0].warnings));
  assert.match(pv.rows[0].warnings[0], /Belirsiz sayı: Miktar "1\.250"/);
});

await test("işlemde hesap: ad ya da numara; bulunamazsa varsayılana düşmez, hata verir", () => {
  const main = accounts.defaultAccount();
  const other = accounts.createAccount({ name: "Deneme Kurum" });
  const base = { mode: "real", assetType: "bist", symbol: "THYAO", side: "buy", quantity: "1", price: "10", currency: "TRY", date: "2026-06-10" };
  assert.equal(portfolio.parseTransactionInput({ ...base, account: other.id }).accountId, other.id);
  assert.equal(portfolio.parseTransactionInput({ ...base, account: String(other.id) }).accountId, other.id);
  assert.equal(portfolio.parseTransactionInput({ ...base, account: "deneme kurum" }).accountId, other.id);
  assert.equal(portfolio.parseTransactionInput(base).accountId, main.id);
  assert.throws(() => portfolio.parseTransactionInput({ ...base, account: 9999 }), /hesap yok/);
  assert.throws(() => portfolio.parseTransactionInput({ ...base, account: "Olmayan" }), /hesap yok/);
});

// ---- Geçiş -------------------------------------------------------------------------------
console.log("Şema geçişi");

await test("C öncesi veritabanı 'Ana hesap'a taşınır, toplamlar değişmez, önce yedek alınır", () => {
  freshDb();
  fs.mkdirSync(db.dataDir(), { recursive: true });
  const raw = new DatabaseSync(db.dbPath());
  for (const sql of db.MIGRATION_SQL.slice(0, 8)) raw.exec(sql);
  raw.exec("PRAGMA user_version = 8");
  const ins = raw.prepare("INSERT INTO transactions (mode, asset_type, symbol, side, quantity, price, currency, date, fx_try) VALUES (?,?,?,?,?,?,?,?,?)");
  ins.run("real", "bist", "THYAO", "buy", 100, 245.5, "TRY", "2025-03-12", 1);
  ins.run("real", "bist", "THYAO", "sell", 40, 312.25, "TRY", "2026-02-10", 1);
  ins.run("real", "foreign", "AAPL", "buy", 5, 198.4, "USD", "2025-04-22", 37.95);
  ins.run("virtual", "bist", "SISE", "buy", 250, 38.6, "TRY", "2026-03-04", 1);
  raw.prepare("INSERT INTO dividends (mode, asset_type, symbol, ex_date, per_share, quantity, amount, currency, fx_try) VALUES ('real','bist','THYAO','2025-06-10',3.1,100,263.5,'TRY',1)").run();
  raw.prepare("INSERT INTO orders (mode, asset_type, symbol, side, condition, trigger_price, trigger_currency, quantity) VALUES ('real','bist','THYAO','sell','gte',400,'TRY',10)").run();
  const preRows = raw.prepare("SELECT * FROM transactions WHERE mode = 'real'").all() as Record<string, unknown>[];
  raw.close();
  const pre = buildPositions(
    preRows.map((r) => ({ id: r.id as number, assetType: r.asset_type as "bist", symbol: r.symbol as string, side: r.side as "buy", quantity: r.quantity as number, price: r.price as number, currency: r.currency as string, date: r.date as string, fxTry: r.fx_try as number })),
    () => null,
  ).map((p) => ({ s: p.symbol, q: p.quantity, c: p.costTry, r: p.realizedTry }));

  const conn = db.getDb(); // geçişi çalıştırır
  assert.equal((conn.prepare("PRAGMA user_version").get() as { user_version: number }).user_version, db.SCHEMA_VERSION);
  const accs = accounts.listAccounts();
  assert.deepEqual(accs.map((a) => [a.id, a.name, a.includeInTotal]), [[1, "Ana hesap", true]]);
  const txs = portfolio.activeTransactions("real");
  assert.ok(txs.every((t) => t.accountId === 1 && t.fee === 0));
  assert.ok(portfolio.activeTransactions("virtual").every((t) => t.accountId === null));
  const post = buildPositions(txs, () => null).map((p) => ({ s: p.symbol, q: p.quantity, c: p.costTry, r: p.realizedTry }));
  assert.deepEqual(post, pre);
  assert.equal((conn.prepare("SELECT account_id FROM dividends").get() as { account_id: number }).account_id, 1);
  assert.equal((conn.prepare("SELECT account_id FROM orders").get() as { account_id: number }).account_id, 1);
  assert.ok(
    backup.listBackups().some((b) => b.kind === "gecis-oncesi"),
    "geçiş öncesi yedek",
  );
  // Eski şemalı yedek: geçici kopyada geçişler çalışır, sütun denetimi geçer
  const old = backup.listBackups().find((b) => b.kind === "gecis-oncesi")!;
  assert.equal(backup.validateBackupFile(path.join(db.backupDir(), old.name)).schemaVersion, 8);
});

await test("pozisyon notu: stop alarmında satış planı hatırlatılır", async () => {
  const notes = await import("../src/lib/notes");
  notes.saveNote({ mode: "real", assetType: "bist", symbol: "THYAO", why: "Uzun vade", exitPlan: "250 altında çıkarım", targetPrice: "360", stopPrice: "250" });
  assert.match(notes.noteReminder("bist", "THYAO", "down", 250) ?? "", /Stop fiyatınıza geldi.*250 altında çıkarım.*Uzun vade/);
  assert.match(notes.noteReminder("bist", "THYAO", "up", 360) ?? "", /Hedef/);
  assert.equal(notes.noteReminder("bist", "THYAO", "down", 240), null);
  assert.throws(() => notes.saveNote({ mode: "real", assetType: "bist", symbol: "THYAO", targetPrice: "200", stopPrice: "250" }), /Stop/);
  assert.equal(notes.saveNote({ mode: "real", assetType: "bist", symbol: "THYAO" }), null); // boş → silinir
});

// ---- Yedek / geri yükleme --------------------------------------------------------------------
console.log("Yedekleme");

await test("yedek al, doğrula, sonradan eklenen işlem geri yüklemede geri alınır", () => {
  const n0 = portfolio.activeTransactions("real").length;
  const b = backup.createBackup("elle");
  const check = backup.validateBackupFile(path.join(db.backupDir(), b.name));
  assert.equal(check.transactions, n0 + portfolio.listTransactions("virtual").length);
  assert.equal(check.schemaVersion, db.SCHEMA_VERSION);

  portfolio.createTransaction(
    portfolio.parseTransactionInput({ mode: "real", assetType: "bist", symbol: "ASELS", side: "buy", quantity: "10", price: "60", currency: "TRY", date: "2026-07-01" }),
  );
  assert.equal(portfolio.activeTransactions("real").length, n0 + 1);

  const staged = backup.stageUpload(new Uint8Array(fs.readFileSync(path.join(db.backupDir(), b.name))));
  const r = backup.restoreFromFile(path.join(db.backupDir(), "yukleme", staged.token));
  assert.equal(r.before.kind, "geri-yukleme-oncesi");
  assert.equal(portfolio.activeTransactions("real").length, n0);
  const ic = db.getDb().prepare("PRAGMA integrity_check").get() as { integrity_check: string };
  assert.equal(ic.integrity_check, "ok");
  // geri yükleme öncesi yedekte eklenen işlem duruyor
  assert.equal(backup.validateBackupFile(path.join(db.backupDir(), r.before.name)).transactions, check.transactions + 1);
});

await test("geçersiz dosya reddedilir; en fazla 14 yedek tutulur", () => {
  assert.throws(() => backup.stageUpload(new TextEncoder().encode("merhaba".repeat(200))), /SQLite/);
  const junk = path.join(DIR, "bos.db");
  const j = new DatabaseSync(junk);
  j.exec("CREATE TABLE x (a); INSERT INTO x VALUES (1);");
  j.close();
  assert.throws(() => backup.validateBackupFile(junk), /yatırım uygulaması yedeği değil|eksik/);
  // Tablo adları doğru ama sütunlar eksik (güncel şema sürümü): reddedilir
  const hollow = path.join(DIR, "oyuk.db");
  const h = new DatabaseSync(hollow);
  h.exec("CREATE TABLE transactions (id INTEGER PRIMARY KEY, date TEXT); CREATE TABLE settings (key TEXT); CREATE TABLE orders (id INTEGER); CREATE TABLE portfolio_snapshots (id INTEGER); CREATE TABLE accounts (id INTEGER);");
  h.exec(`PRAGMA user_version = ${db.SCHEMA_VERSION}`);
  h.close();
  assert.throws(() => backup.validateBackupFile(hollow), /beklenen sütunlar eksik.*transactions/);
  assert.deepEqual(fs.readdirSync(DIR).filter((n) => n.includes("dogrula")), [], "geçici kopya silinir");
  for (let i = 0; i < 16; i++) backup.createBackup("elle");
  assert.equal(backup.listBackups().length, backup.KEEP_BACKUPS);
});

db.closeDb();
fs.rmSync(DIR, { recursive: true, force: true });
console.log(`\n${passed} test geçti.`);
