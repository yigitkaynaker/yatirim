// Sembol kataloğu ve kripto parite testleri: sembol biçimi ve geri uyumluluk (crypto:BTC aynen
// Binance USDT), TRY / USD para birimi, kataloğun sahte HTTP ile doldurulması (Binance + BtcTurk;
// listeden çıkanların silinmesi, kaynak hatasında eski satırların korunması), liste süzgeçleri,
// arama gruplama, TL paritelerinde portföy değerlemesi ve BtcTurk toplu fiyat isteği; TEFAS fon listesi,
// Nasdaq sembol dizini ve BIST hisse listesi ayrıştırma, tekillik (her sembol tek satır), fon türü süzgeci
// ve katalogdan eklenen fonun fiyatı / portföyü; Binance Vadeli (çarpanlı kontrat, spotla tekillik) ve Alpha
// (ayrıştırma, tekillik, hata halinde eski satırlar) satırları, fiyatı ve grafiği.
// Ağ kullanmaz (fetch sahte); geçici bir veri klasörü kullanır. İki modda da çalışır (npm run test:pg).
//   npm run test:catalog
// Gerçek uçlara küçük bir deneme (ağ gerekir): npm run test:catalog -- --canli
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const DIR = fs.mkdtempSync(path.join(os.tmpdir(), "yatirim-catalog-"));
if (!process.env.YATIRIM_DATA_DIR) process.env.YATIRIM_DATA_DIR = DIR;
const LIVE = process.argv.includes("--canli");

const { resetDatabase } = await import("./test-db");
const db = await import("../src/lib/db");
const assets = await import("../src/lib/assets");
const catalog = await import("../src/lib/catalog");
const market = await import("../src/lib/market");
const prices = await import("../src/lib/prices");
const portfolio = await import("../src/lib/portfolio");
(await import("../src/lib/userContext")).enterUserForScripts(1);

let passed = 0;
async function test(name: string, fn: () => void | Promise<void>) {
  await fn();
  passed++;
  console.log(`  ✓ ${name}`);
}
const near = (a: number | null | undefined, b: number, eps = 1e-6) => assert.ok(a != null && Math.abs(a - b) < eps, `${a} ≈ ${b}`);

// ---- Sahte HTTP ---------------------------------------------------------------------------------
const realFetch = globalThis.fetch;
const calls: string[] = [];
let routes: Record<string, unknown> = {};
function fakeFetch(input: string | URL | Request, init?: RequestInit): Promise<Response> {
  const url = String(input instanceof Request ? input.url : input);
  calls.push(url);
  for (const [prefix, route] of Object.entries(routes)) {
    if (url.startsWith(prefix)) {
      // İstek gövdesine göre yanıt (aynı URL, farklı POST gövdesi: TEFAS fon türleri)
      const body = typeof route === "function" ? (route as (b: unknown) => unknown)(init?.body ? JSON.parse(String(init.body)) : null) : route;
      if (body instanceof Error) return Promise.reject(body);
      if (typeof body === "string") return Promise.resolve(new Response(body, { status: 200, headers: { "Content-Type": "text/plain" } }));
      if (typeof body === "number") return Promise.resolve(new Response("{}", { status: body }));
      return Promise.resolve(new Response(JSON.stringify(body), { status: 200, headers: { "Content-Type": "application/json" } }));
    }
  }
  return Promise.reject(new Error(`ağ kapalı (test): ${url}`));
}
globalThis.fetch = fakeFetch as typeof fetch;

const BINANCE_INFO = {
  symbols: [
    { symbol: "BTCUSDT", status: "TRADING", baseAsset: "BTC", quoteAsset: "USDT", isSpotTradingAllowed: true },
    { symbol: "ETHUSDT", status: "TRADING", baseAsset: "ETH", quoteAsset: "USDT", isSpotTradingAllowed: true },
    { symbol: "SUSDT", status: "TRADING", baseAsset: "S", quoteAsset: "USDT", isSpotTradingAllowed: true },
    { symbol: "BTCTRY", status: "TRADING", baseAsset: "BTC", quoteAsset: "TRY", isSpotTradingAllowed: true },
    { symbol: "ETHBTC", status: "TRADING", baseAsset: "ETH", quoteAsset: "BTC", isSpotTradingAllowed: true },
    { symbol: "LUNAUSDT", status: "BREAK", baseAsset: "LUNA", quoteAsset: "USDT", isSpotTradingAllowed: true },
    { symbol: "币安人生USDT", status: "TRADING", baseAsset: "币安人生", quoteAsset: "USDT", isSpotTradingAllowed: true },
  ],
};
const BINANCE_MINI = [
  { symbol: "BTCUSDT", quoteVolume: "900000000" },
  { symbol: "ETHUSDT", quoteVolume: "1200000000" },
  { symbol: "SUSDT", quoteVolume: "1000" },
];
const BTCTURK_INFO = {
  data: {
    symbols: [
      { name: "BTCTRY", status: "TRADING", numerator: "BTC", denominator: "TRY", order: 1000 },
      { name: "ETHTRY", status: "TRADING", numerator: "ETH", denominator: "TRY", order: 1130 },
      { name: "BTCUSDT", status: "TRADING", numerator: "BTC", denominator: "USDT", order: 1001 },
      { name: "XYZTRY", status: "DELISTED", numerator: "XYZ", denominator: "TRY", order: 5 },
    ],
    currencies: [
      { symbol: "TRY", name: "Türk Lirası", currencyType: "FIAT" },
      { symbol: "BTC", name: "Bitcoin", currencyType: "CRYPTO" },
      { symbol: "ETH", name: "Ethereum", currencyType: "CRYPTO" },
    ],
  },
};
// TEFAS fon listesi (tür başına)
const fund = (fonKodu: string, fonUnvan: string, fonTurAciklama: string) => ({ fonKodu, fonUnvan, fonTurAciklama, tefasDurum: true, getiri1a: 1 });
const TEFAS_LIST: Record<string, unknown[]> = {
  YAT: [
    fund("AFT", "AK PORTFÖY YENİ TEKNOLOJİLER YABANCI HİSSE SENEDİ FONU", "Hisse Senedi Şemsiye Fonu"),
    fund("TTE", "İŞ PORTFÖY BIST TEKNOLOJİ AĞIRLIK SINIRLAMALI ENDEKSİ HİSSE SENEDİ FONU", "Hisse Senedi Şemsiye Fonu"),
    fund("MAC", "MARMARA CAPITAL PORTFÖY HİSSE SENEDİ FONU", "Hisse Senedi Şemsiye Fonu"),
    fund("AFT", "TEKRAR", "Hisse Senedi Şemsiye Fonu"), // aynı kod ikinci kez: tek satır
    fund("IPB", "İŞ PORTFÖY PARA PİYASASI FONU", "Para Piyasası Şemsiye Fonu"),
    fund("YAS", "YAPI KREDİ PORTFÖY KOÇ HOLDİNG İŞTİRAK VE HİSSE SENEDİ FONU", "Hisse Senedi Şemsiye Fonu"),
    fund("TOOLONG", "Geçersiz kod", "x"),
    { fonUnvan: "kodsuz" },
  ],
  EMK: ["AEA", "AEH", "AH1", "AH2", "AH3"].map((c) => fund(c, `AGESA HAYAT VE EMEKLİLİK ${c} FONU`, "Hisse Senedi Fonu")),
  BYF: ["LTK", "BOE", "MDL", "BND", "BLH"].map((c) => fund(c, `AK PORTFÖY ${c} BORSA YATIRIM FONU`, "Endeks Fon")),
};

// Nasdaq Trader sembol dizini: gerçek biçimde özel satırlar + eşiği (3000) aşacak kadar sentetik hisse
const letters = (n: number) => Array.from({ length: 4 }, (_, i) => String.fromCharCode(65 + (Math.floor(n / 26 ** i) % 26))).join("");
const NASDAQ_LISTED = [
  "Symbol|Security Name|Market Category|Test Issue|Financial Status|Round Lot Size|ETF|NextShares",
  "AAPL|Apple Inc. - Common Stock|Q|N|N|100|N|N",
  "ZZTT|Nasdaq Test Issue - Common Stock|Q|Y|N|100|N|N",
  "ABCDW|Abcd Corp - Warrant|S|N|N|100|N|N",
  "ABCDU|Abcd Corp - Units|S|N|N|100|N|N",
  "ABCDR|Abcd Corp - Rights|S|N|N|100|N|N",
  "ETFZ|Zeta Nasdaq 100 ETF|G|N|N|100|Y|N",
  "ADRZ|Adrz Ltd - American Depositary Shares|S|N|N|100|N|N",
  "RIVN|Rivian Automotive, Inc. - Class A Common Stock|Q|N|N|100|N|N",
  ...Array.from({ length: 3100 }, (_, i) => `Q${letters(i)}|Sentetik Şirket ${i} - Common Stock|${"QGS"[i % 3]}|N|N|100|${i % 10 === 0 ? "Y" : "N"}|N`),
  "File Creation Time: 1125202621:32|||||||",
].join("\r\n");
const OTHER_LISTED = [
  "ACT Symbol|Security Name|Exchange|CQS Symbol|ETF|Round Lot Size|Test Issue|NASDAQ Symbol",
  "BRK.B|Berkshire Hathaway Inc. Class B|N|BRK.B|N|100|N|BRK.B",
  "BF.B|Brown-Forman Corporation Class B Common Stock|N|BF.B|N|100|N|BF.B",
  "BAC$K|Bank of America Corporation Depositary Shares Preferred Series K|N|BACpK|N|100|N|BAC-K",
  "XYZ.U|Xyz Acquisition Corp Units|N|XYZ.U|N|100|N|XYZ=",
  "CBZZ|Cboe Only ETF|Z|CBZZ|Y|100|N|CBZZ",
  "RIVN|Rivian (yinelenen)|N|RIVN|N|100|N|RIVN",
  "PBT|Permian Basin Royalty Trust Units of Beneficial Interest|N|PBT|N|100|N|PBT",
  "SPYZ|Spyz S&P 500 ETF Trust|P|SPYZ|Y|100|N|SPYZ",
  "PFDX|Pfdx Corp 6.5% Fixed Rate Preferred Stock|N|PFDX|N|100|N|PFDX",
  "File Creation Time: 1125202621:32||||||",
].join("\r\n");

// İş Yatırım "Temel Değerler ve Oranlar" tablosu (en az 300 hisse gerekir)
const isyRow = (code: string, name: string, cap: string) =>
  `<tr><td><a href="/tr-tr/analiz/hisse/Sayfalar/sirket-karti.aspx?hisse=${code}">${code}</a></td><td>${name}</td><td>Sektör</td><td class="text-right">1,00</td><td class="text-right">${cap}</td><td class="text-right">1</td></tr>`;
const ISYATIRIM_HTML = `<html><body><table><tbody>${[
  isyRow("THYAO", "Türk Hava Yolları (başka ad)", "400.000,0"),
  isyRow("A1CAP", "A1 Capital ", "1.633,5"),
  isyRow("BUYUK", "Büyük &amp; Değerli A.Ş.", "900.000,0"),
  isyRow("A1CAP", "A1 Capital (yinelenen)", "1,0"),
  ...Array.from({ length: 320 }, (_, i) => isyRow(`S${letters(i)}`, `Sentetik ${i}`, `${i},0`)),
].join("")}</tbody></table></body></html>`;

function catalogRoutes() {
  return {
    "https://api.binance.com/api/v3/exchangeInfo": BINANCE_INFO,
    "https://api.binance.com/api/v3/ticker/24hr?type=MINI": BINANCE_MINI,
    "https://api.btcturk.com/api/v2/server/exchangeinfo": BTCTURK_INFO,
    "https://www.tefas.gov.tr/api/funds/fonGetiriBazliBilgiGetir": (b: { fonTipi?: string } | null) => ({ errorCode: null, resultList: TEFAS_LIST[b?.fonTipi ?? ""] ?? [] }),
    "https://www.nasdaqtrader.com/dynamic/SymDir/nasdaqlisted.txt": NASDAQ_LISTED,
    "https://www.nasdaqtrader.com/dynamic/SymDir/otherlisted.txt": OTHER_LISTED,
    "https://www.isyatirim.com.tr/tr-tr/analiz/hisse/Sayfalar/Temel-Degerler-Ve-Oranlar.aspx": ISYATIRIM_HTML,
  } as Record<string, unknown>;
}

await resetDatabase();

// ---- Sembol biçimi --------------------------------------------------------------------------------
console.log("Kripto sembol biçimi");

await test("geri uyumluluk: crypto:BTC aynen Binance BTC/USDT (USD)", () => {
  assert.deepEqual(assets.parseInstrumentId("crypto:BTC"), { type: "crypto", symbol: "BTC" });
  assert.deepEqual(assets.parseCryptoSymbol("BTC"), { base: "BTC", quote: "USDT", venue: "BINANCE" });
  assert.equal(assets.cryptoCurrency("BTC"), "USD");
  assert.equal(assets.normalizeSymbol("crypto", "btcusdt"), "BTC");
  assert.equal(assets.normalizeSymbol("crypto", "BTC-USD"), "BTC");
  assert.equal(assets.normalizeSymbol("crypto", "ETH"), "ETH");
  assert.equal(assets.normalizeSymbol("crypto", "USDT"), "USDT");
  assert.equal(assets.displaySymbol("crypto", "BTC"), "BTC");
});

await test("TL paritesi ve BtcTurk: kanonik biçim", () => {
  assert.equal(assets.normalizeSymbol("crypto", "btc/try"), "BTC-TRY");
  assert.equal(assets.normalizeSymbol("crypto", "BTC_TRY"), "BTC-TRY");
  assert.equal(assets.normalizeSymbol("crypto", "BTC-TRY@BINANCE"), "BTC-TRY");
  assert.equal(assets.normalizeSymbol("crypto", "BTC@BINANCE"), "BTC");
  assert.equal(assets.normalizeSymbol("crypto", "btc@btcturk"), "BTC@BTCTURK");
  assert.equal(assets.normalizeSymbol("crypto", "BTC-TRY@BTCTURK"), "BTC@BTCTURK");
  assert.equal(assets.normalizeSymbol("crypto", "BTCTRY@BTCTURK"), "BTC@BTCTURK");
  assert.equal(assets.normalizeSymbol("crypto", "BTC/USDT@BTCTURK"), "BTC-USDT@BTCTURK");
  assert.deepEqual(assets.parseCryptoSymbol("BTC@BTCTURK"), { base: "BTC", quote: "TRY", venue: "BTCTURK" });
  assert.deepEqual(assets.parseCryptoSymbol("ETH-USDT@BTCTURK"), { base: "ETH", quote: "USDT", venue: "BTCTURK" });
  assert.equal(assets.cryptoCurrency("BTC-TRY"), "TRY");
  assert.equal(assets.cryptoCurrency("BTC@BTCTURK"), "TRY");
  assert.equal(assets.cryptoCurrency("BTC-USDT@BTCTURK"), "USD");
  assert.equal(assets.defaultCurrencyFor("crypto", "BTC-TRY"), "TRY");
  assert.equal(assets.defaultCurrencyFor("crypto", "BTC"), "USD");
  assert.equal(assets.displaySymbol("crypto", "BTC-TRY"), "BTC/TRY");
  assert.equal(assets.displaySymbol("crypto", "BTC@BTCTURK"), "BTC/TRY (BtcTurk)");
  assert.equal(assets.cryptoBase("ETH@BTCTURK"), "ETH");
  // Tek harfli coinler (S, W…) artık geçerli; bilinmeyen borsa ve kotasyon geçersiz
  assert.ok(assets.parseInstrumentId("crypto:S"));
  assert.equal(assets.parseInstrumentId("crypto:BTC@KRAKEN"), null);
  assert.equal(assets.parseInstrumentId("crypto:BTC-EUR"), null);
  assert.equal(assets.parseInstrumentId("crypto:BTC-TRY@BTCTURK")?.symbol, "BTC@BTCTURK");
});

await test("kategori ve endeks yardımcıları", () => {
  assert.equal(assets.defaultCategory("foreign", "GC=F"), "emtia");
  assert.equal(assets.defaultCategory("foreign", "^GSPC"), "endeks");
  assert.equal(assets.defaultCategory("foreign", "AAPL"), "hisse");
  assert.equal(assets.defaultCategory("bist", "XU030"), "endeks");
  assert.equal(assets.defaultCategory("bist", "THYAO"), "bist");
  assert.ok(assets.isIndexInstrument("bist", "XU100"));
  assert.ok(!assets.isIndexInstrument("bist", "THYAO"));
});

// ---- Katalog doldurma -----------------------------------------------------------------------------
console.log("Sembol kataloğu");

await test("sahte HTTP ile doldurma: Binance USDT+TRY, BtcTurk TRY+USDT, statik listeler", async () => {
  routes = catalogRoutes();
  const r = await catalog.refreshCatalog();
  assert.equal(r.binance, 4); // BTC, ETH, S (USDT) + BTC (TRY); BREAK, BTC kotasyonu ve geçersiz taban elenir
  assert.equal(r.btcturk, 3);
  assert.ok(r.static > 300, `statik: ${r.static}`);
  assert.deepEqual(r.tefas, { YAT: 5, EMK: 5, BYF: 5 });
  assert.equal(typeof r.nasdaq, "number");
  assert.equal(typeof r.bist, "number");
  const conn = await db.getDb();
  const btc = await conn.get<{ name: string; currency: string; category: string; exchange: string }>(
    "SELECT name, currency, category, exchange FROM symbol_catalog WHERE asset_type = 'crypto' AND symbol = 'BTC'",
  );
  assert.deepEqual({ ...btc }, { name: "Bitcoin", currency: "USD", category: "kripto", exchange: "Binance" }); // ad BtcTurk'ten
  const bt = await conn.get<{ currency: string }>("SELECT currency FROM symbol_catalog WHERE symbol = 'BTC@BTCTURK'");
  assert.equal(bt?.currency, "TRY");
  assert.ok(await conn.get("SELECT 1 FROM symbol_catalog WHERE symbol = 'BTC-USDT@BTCTURK'"));
  assert.ok(await conn.get("SELECT 1 FROM symbol_catalog WHERE asset_type = 'foreign' AND symbol = 'SI=F' AND category = 'emtia'"));
  assert.ok(await conn.get("SELECT 1 FROM symbol_catalog WHERE asset_type = 'bist' AND symbol = 'XU030' AND category = 'endeks'"));
});

await test("kripto listesi: hacim sırası ve borsa süzgeçleri, sayfalama", async () => {
  const all = await catalog.listCatalog("kripto", { pageSize: 50 });
  assert.equal(all.total, 7);
  assert.deepEqual(all.items.slice(0, 2).map((i) => i.symbol), ["ETH", "BTC"]); // ETH hacmi daha büyük
  assert.deepEqual((await catalog.listCatalog("kripto", { venue: "binance-try" })).items.map((i) => i.symbol), ["BTC-TRY"]);
  assert.deepEqual((await catalog.listCatalog("kripto", { venue: "btcturk" })).items.map((i) => i.symbol), ["BTC@BTCTURK", "BTC-USDT@BTCTURK", "ETH@BTCTURK"]);
  const usdt = await catalog.listCatalog("kripto", { venue: "binance-usdt", pageSize: 5 });
  assert.equal(usdt.total, 3);
  const p1 = await catalog.listCatalog("bist", { pageSize: 10, page: 1 });
  assert.equal(p1.items.length, 10);
  assert.equal(p1.page, 1);
  assert.ok(p1.total > 100);
  assert.deepEqual((await catalog.listCatalog("bist", { pageSize: 5 })).items.map((i) => i.symbol), ["THYAO", "ASELS", "GARAN", "AKBNK", "ISCTR"], "statik sıra korunur");
  const q = await catalog.listCatalog("kripto", { q: "bitcoin" });
  assert.ok(q.items.every((i) => i.symbol.startsWith("BTC")) && q.total === 4, JSON.stringify(q.items.map((i) => i.symbol)));
  const tr = await catalog.listCatalog("bist", { q: "türk hava" });
  assert.equal(tr.items[0]?.symbol, "THYAO"); // Türkçe harfler ASCII ile eşleşir
});

await test("yenileme: listeden çıkan parite silinir; kaynak hata verirse eski satırlar korunur", async () => {
  await new Promise((r) => setTimeout(r, 1100)); // updated_at saniye çözünürlüklü
  routes = catalogRoutes();
  routes["https://api.binance.com/api/v3/exchangeInfo"] = { symbols: BINANCE_INFO.symbols.filter((s) => s.symbol !== "SUSDT") };
  routes["https://api.btcturk.com/api/v2/server/exchangeinfo"] = 503;
  const r = await catalog.refreshCatalog();
  assert.equal(r.binance, 3);
  assert.match(String(r.btcturk), /hata/);
  const conn = await db.getDb();
  assert.equal(await conn.get("SELECT 1 FROM symbol_catalog WHERE symbol = 'S'"), undefined);
  assert.ok(await conn.get("SELECT 1 FROM symbol_catalog WHERE symbol = 'BTC@BTCTURK'"), "BtcTurk satırları korunmalı");
  // Binance ana uç 451 → ayna (data-api.binance.vision)
  routes = { "https://api.binance.com/": 451, ...catalogRoutes() }; // önce eşleşir
  routes["https://data-api.binance.vision/api/v3/exchangeInfo"] = BINANCE_INFO;
  routes["https://data-api.binance.vision/api/v3/ticker/24hr?type=MINI"] = BINANCE_MINI;
  calls.length = 0;
  const r2 = await catalog.refreshCatalog();
  assert.equal(r2.binance, 4);
  assert.ok(calls.some((u) => u.startsWith("https://data-api.binance.vision/api/v3/exchangeInfo")));
});

// ---- Binance Vadeli ve Alpha (spotta olmayan coinler) ------------------------------------------
console.log("Binance Vadeli ve Alpha");

const extra = await import("../src/lib/binanceExtra");
const perp = (base: string, quote = "USDT", over: Record<string, unknown> = {}) => ({
  symbol: `${base}${quote}`,
  status: "TRADING",
  contractType: "PERPETUAL",
  baseAsset: base,
  quoteAsset: quote,
  underlyingType: "COIN",
  ...over,
});
// En az 100 kontrat gerekir: sentetik FUTA, FUTB… (spotta yok → vadeli satırı)
const FILLER = Array.from({ length: 110 }, (_, i) => perp(`FUT${letters(i)}`));
const FAPI_INFO = {
  symbols: [
    perp("BTC"), // spotta var → satır yok
    perp("ETH", "USDC"), // spotta var → satır yok
    perp("1000PEPE"), // PEPE spotta yok → PEPE@BINANCE-F (çarpan 1000)
    perp("PEPE", "USDC"), // aynı coin: USDT kontrat tercih edilir
    perp("1000000MOG"),
    perp("1INCH"), // rakamla başlayan gerçek ad (çarpan değil)
    perp("BTCDOM", "USDT", { underlyingType: "INDEX" }), // endeks → yok
    perp("XYZ", "USDT", { status: "SETTLING" }), // işlemde değil → yok
    perp("QTR", "USDT", { contractType: "CURRENT_QUARTER", symbol: "QTRUSDT_261225" }), // teslimli → yok
    perp("龙虾"), // Latin dışı → yok
    perp("SHARE"), // Alpha'da da var: vadeli önce gelir
    ...FILLER,
  ],
};
const FAPI_TICKERS = [
  { symbol: "1000PEPEUSDT", lastPrice: "0.0123", priceChangePercent: "5", closeTime: Date.now(), quoteVolume: "9000000" },
  { symbol: "PEPEUSDC", lastPrice: "0.0000124", priceChangePercent: "4", closeTime: Date.now(), quoteVolume: "10" },
  { symbol: "1000000MOGUSDT", lastPrice: "0.35", priceChangePercent: "-2", closeTime: Date.now(), quoteVolume: "500" },
  { symbol: "1INCHUSDT", lastPrice: "0.2", priceChangePercent: "1", closeTime: Date.now(), quoteVolume: "100" },
  { symbol: "BTCUSDT_261225", lastPrice: "100000", priceChangePercent: "1", closeTime: Date.now(), quoteVolume: "1" },
  { symbol: "OLDUSDT", lastPrice: "1", priceChangePercent: "0", closeTime: Date.now() - 5 * 86_400_000, quoteVolume: "1" },
];
const ALPHA_URL = "https://www.binance.com/bapi/defi/v1/public/wallet-direct/buw/wallet/cex/alpha/all/token/list";
const alphaTok = (alphaId: string, symbol: string, over: Record<string, unknown> = {}) => ({
  alphaId,
  symbol,
  name: `${symbol} Token`,
  chainName: "BSC",
  price: "0.05",
  percentChange24h: "-1.5",
  volume24h: "1000",
  offline: false,
  fullyDelisted: false,
  stockState: false,
  rwaInfo: null,
  cexCoinName: "",
  ...over,
});
const ALPHA_LIST = {
  code: "000000",
  data: [
    alphaTok("ALPHA_1287", "SHARE"), // vadelide var → Alpha satırı yok
    alphaTok("ALPHA_10", "NEWT", { price: "0.0000123", volume24h: "5000" }),
    alphaTok("ALPHA_11", "up", { volume24h: "10" }), // küçük harf → UP; aynı sembol: hacmi büyük olan seçilir
    alphaTok("ALPHA_12", "UP", { volume24h: "99", name: "Up Büyük" }),
    alphaTok("ALPHA_13", "BTC"), // spotta var
    alphaTok("ALPHA_14", "Fartcoin", { cexCoinName: "ETH" }), // spotta listeli (cexCoinName) → yok
    alphaTok("ALPHA_15", "TSLAon", { stockState: true, rwaInfo: {} }), // tokenlaştırılmış hisse → yok
    alphaTok("ALPHA_16", "GONE", { offline: true }),
    alphaTok("ALPHA_17", "$PAAL"), // baştaki $ atılır
    alphaTok("ALPHA_18", "哈基米"),
    alphaTok("ALPHA_19", "PEPE"), // vadelide var
    ...Array.from({ length: 60 }, (_, i) => alphaTok(`ALPHA_${100 + i}`, `ALP${letters(i)}`)),
  ],
};
function extraRoutes() {
  return {
    ...catalogRoutes(),
    "https://fapi.binance.com/fapi/v1/exchangeInfo": FAPI_INFO,
    "https://fapi.binance.com/fapi/v1/ticker/24hr": FAPI_TICKERS,
    [ALPHA_URL]: ALPHA_LIST,
  } as Record<string, unknown>;
}

await test("sembol biçimi: @BINANCE-F ve @BINANCE-ALPHA (yalnız USDT), gidiş-dönüş", () => {
  assert.deepEqual(assets.parseCryptoSymbol("RATS@BINANCE-F"), { base: "RATS", quote: "USDT", venue: "BINANCE-F" });
  assert.deepEqual(assets.parseCryptoSymbol("SHARE@BINANCE-ALPHA"), { base: "SHARE", quote: "USDT", venue: "BINANCE-ALPHA" });
  assert.equal(assets.cryptoSymbol("RATS", "USDT", "BINANCE-F"), "RATS@BINANCE-F");
  for (const s of ["RATS@BINANCE-F", "SHARE@BINANCE-ALPHA", "BTC", "BTC-TRY", "BTC@BTCTURK", "BTC-USDT@BTCTURK"]) {
    const c = assets.parseCryptoSymbol(s)!;
    assert.equal(assets.cryptoSymbol(c.base, c.quote, c.venue), s);
    assert.equal(assets.parseInstrumentId(`crypto:${s}`)?.symbol, s);
  }
  assert.equal(assets.normalizeSymbol("crypto", "rats@binance_f"), "RATS@BINANCE-F");
  assert.equal(assets.normalizeSymbol("crypto", "RATSUSDT@BINANCE-F"), "RATS@BINANCE-F");
  assert.equal(assets.normalizeSymbol("crypto", "share/usdt@binance-alpha"), "SHARE@BINANCE-ALPHA");
  assert.equal(assets.parseInstrumentId("crypto:BTC-TRY@BINANCE-F"), null, "vadelide TL paritesi yok");
  assert.equal(assets.parseInstrumentId("crypto:BTC@BINANCE-X"), null);
  assert.equal(assets.cryptoCurrency("RATS@BINANCE-F"), "USD");
  assert.equal(assets.displaySymbol("crypto", "RATS@BINANCE-F"), "RATS (Vadeli)");
  assert.equal(assets.displaySymbol("crypto", "SHARE@BINANCE-ALPHA"), "SHARE (Alpha)");
  assert.equal(assets.cryptoBase("SHARE@BINANCE-ALPHA"), "SHARE");
});

await test("çarpan önekleri: 1000PEPE, 1MBABYDOGE, 1000000MOG; 1INCH, 0G, 1000S değil", () => {
  assert.deepEqual(extra.splitMultiplier("1000PEPE"), { coin: "PEPE", mult: 1000 });
  assert.deepEqual(extra.splitMultiplier("1000SHIB"), { coin: "SHIB", mult: 1000 });
  assert.deepEqual(extra.splitMultiplier("1MBABYDOGE"), { coin: "BABYDOGE", mult: 1_000_000 });
  assert.deepEqual(extra.splitMultiplier("1000000MOG"), { coin: "MOG", mult: 1_000_000 });
  for (const s of ["1INCH", "0G", "2Z", "4", "1000S", "BTC"]) assert.deepEqual(extra.splitMultiplier(s), { coin: s, mult: 1 });
});

await test("vadeli kontrat listesi ve fiyatları: süzgeç, coin başına tek kontrat, fiyat / çarpan", () => {
  const { contracts, raw } = extra.parseFuturesExchangeInfo(FAPI_INFO);
  assert.equal(raw, FAPI_INFO.symbols.length - 3); // endeks, SETTLING ve çeyreklik sayılmaz
  assert.equal(contracts.get("PEPE")?.pair, "1000PEPEUSDT"); // USDT kontrat USDC'ye tercih edilir
  assert.equal(contracts.get("MOG")?.mult, 1_000_000);
  assert.ok(contracts.has("1INCH") && !contracts.has("BTCDOM") && !contracts.has("XYZ") && !contracts.has("QTR") && !contracts.has("龙虾"));
  const t = extra.parseFuturesTickers(FAPI_TICKERS);
  near(t.get("PEPE")?.price, 0.0000123, 1e-12);
  assert.equal(t.get("PEPE")?.pair, "1000PEPEUSDT");
  near(t.get("MOG")?.price, 0.00000035, 1e-14);
  near(t.get("1INCH")?.price, 0.2);
  assert.ok(!t.has("BTC") && !t.has("OLD"), "teslimli ve kapanmış kontrat yok");
});

await test("Alpha token listesi: kapanmış / hisse / Latin dışı elenir, aynı sembolde hacmi büyük olan", () => {
  const { tokens, raw } = extra.parseAlphaTokens(ALPHA_LIST);
  assert.equal(raw, ALPHA_LIST.data.length - 1); // offline hariç
  assert.equal(tokens.get("UP")?.alphaId, "ALPHA_12");
  assert.equal(tokens.get("UP")?.name, "Up Büyük");
  assert.ok(tokens.has("PAAL") && !tokens.has("TSLAON") && !tokens.has("GONE") && !tokens.has("哈基米"));
  assert.equal(tokens.get("FARTCOIN")?.cexCoin, "ETH");
  near(tokens.get("NEWT")?.price, 0.0000123, 1e-12);
});

await test("katalog: vadeli ve Alpha yalnız spotta olmayan coinler, her coin bir kez; süzgeçler", async () => {
  await new Promise((r) => setTimeout(r, 1100));
  routes = extraRoutes();
  const r = await catalog.refreshCatalog();
  assert.equal(r.binanceFutures, 110 + 4); // sentetik + PEPE, MOG, 1INCH, SHARE
  const futSyms = new Set<string>();
  for (let p = 0; p < 3; p++) for (const i of (await catalog.listCatalog("kripto", { venue: "binance-futures", pageSize: 50, page: p })).items) futSyms.add(i.symbol);
  assert.equal(futSyms.size, 114);
  assert.ok(futSyms.has("PEPE@BINANCE-F") && futSyms.has("MOG@BINANCE-F") && futSyms.has("SHARE@BINANCE-F") && futSyms.has("1INCH@BINANCE-F"));
  assert.ok(!futSyms.has("BTC@BINANCE-F") && !futSyms.has("ETH@BINANCE-F") && !futSyms.has("BTCDOM@BINANCE-F"));
  const fut = await catalog.listCatalog("kripto", { venue: "binance-futures", pageSize: 5 });
  assert.equal(fut.items[0].symbol, "PEPE@BINANCE-F", "hacim sırası");
  assert.equal(fut.items[0].exchange, "Binance Vadeli · 1000PEPEUSDT kontratı");
  assert.equal(fut.items[0].currency, "USD");
  const alpha = await catalog.listCatalog("kripto", { venue: "binance-alpha", pageSize: 50 });
  const alphaSyms = [...alpha.items, ...(await catalog.listCatalog("kripto", { venue: "binance-alpha", pageSize: 50, page: 1 })).items].map((i) => i.symbol);
  assert.equal(r.binanceAlpha, 60 + 3); // sentetik + NEWT, UP, PAAL
  assert.equal(alpha.total, 63);
  assert.equal(alphaSyms[0], "NEWT@BINANCE-ALPHA");
  assert.ok(alphaSyms.includes("UP@BINANCE-ALPHA") && alphaSyms.includes("PAAL@BINANCE-ALPHA"));
  for (const s of ["SHARE", "BTC", "PEPE", "FARTCOIN", "TSLAON", "GONE"]) assert.ok(!alphaSyms.includes(`${s}@BINANCE-ALPHA`), s);
  assert.equal(alpha.items[0].exchange, "Binance Alpha · BSC");
  assert.equal(alpha.items[0].name, "NEWT Token");
  // Vadeli ile Alpha kesişmez; spot coinler ikisinde de yok
  const futBases = new Set([...futSyms].map((s) => assets.cryptoBase(s)));
  assert.ok(alphaSyms.every((s) => !futBases.has(assets.cryptoBase(s))));
  assert.match(catalog.refreshSummary(r), /Binance Vadeli 114, Binance Alpha 63/);
  // Diğer süzgeçler etkilenmez
  assert.equal((await catalog.listCatalog("kripto", { venue: "binance-usdt" })).total, 3);
});

await test("yenileme: vadeli / Alpha ucu hata verirse ya da eksik gelirse eski satırlar korunur", async () => {
  await new Promise((r) => setTimeout(r, 1100));
  const conn = await db.getDb();
  const count = async (src: string) => Number((await conn.get<{ c: number }>("SELECT COUNT(*) AS c FROM symbol_catalog WHERE source = ?", [src]))?.c);
  const before = [await count("binance-futures"), await count("binance-alpha")];
  routes = extraRoutes();
  routes["https://fapi.binance.com/fapi/v1/exchangeInfo"] = { symbols: FAPI_INFO.symbols.slice(0, 20) }; // 100'den az
  routes[ALPHA_URL] = 403; // veri merkezi engeli
  const r = await catalog.refreshCatalog();
  assert.match(String(r.binanceFutures), /eksik/);
  assert.match(String(r.binanceAlpha), /hata/);
  assert.deepEqual([await count("binance-futures"), await count("binance-alpha")], before);
});

await test("fiyat: vadeli tek toplu istek (1 coin fiyatı), Alpha listeden; grafik çarpana bölünür; portföy", async () => {
  (globalThis as { __yatirimPrices?: unknown }).__yatirimPrices = undefined;
  routes = {
    "https://fapi.binance.com/fapi/v1/ticker/24hr": FAPI_TICKERS,
    [ALPHA_URL]: ALPHA_LIST,
    "https://fapi.binance.com/fapi/v1/klines": [
      [Date.now() - 2 * 86_400_000, "0.011", "0.013", "0.010", "0.012", "1000", Date.now() - 86_400_000, "0"],
      [Date.now() - 86_400_000, "0.012", "0.013", "0.011", "0.0123", "2000", Date.now() + 60_000, "0"],
    ],
    "https://www.binance.com/bapi/defi/v1/public/alpha-trade/klines": {
      code: "000000",
      success: true,
      data: [[String(Date.now() - 86_400_000), "0.04", "0.06", "0.03", "0.05", "10", String(Date.now() + 60_000), "0"]],
    },
  };
  calls.length = 0;
  const q = await prices.getQuotes([
    { type: "crypto", symbol: "PEPE@BINANCE-F" },
    { type: "crypto", symbol: "MOG@BINANCE-F" },
    { type: "crypto", symbol: "UP@BINANCE-ALPHA" },
    { type: "crypto", symbol: "NOPE@BINANCE-F" },
  ]);
  near(q[0].price, 0.0000123, 1e-12);
  assert.deepEqual([q[0].currency, q[0].source, q[0].stale], ["USD", "Binance Vadeli", false]);
  near(q[1].price, 0.00000035, 1e-14);
  near(q[2].price, 0.05);
  assert.deepEqual([q[2].source, q[2].name], ["Binance Alpha", "Up Büyük"]);
  assert.equal(q[3].price, null);
  assert.ok(prices.quoteUsable(q[0]));
  assert.equal(calls.filter((u) => u.startsWith("https://fapi.binance.com/fapi/v1/ticker/24hr")).length, 1, "vadeli tek istek");
  assert.equal(calls.filter((u) => u.includes("alpha/all/token/list")).length, 1, "Alpha tek istek");
  const ch = await market.getChart("crypto", "PEPE@BINANCE-F", "1A");
  assert.ok(calls.some((u) => u.includes("klines?symbol=1000PEPEUSDT")));
  near(ch.points[ch.points.length - 1].value, 0.0000123, 1e-12);
  assert.equal(ch.currency, "USD");
  const ca = await market.getChart("crypto", "UP@BINANCE-ALPHA", "1A");
  assert.ok(calls.some((u) => u.includes("alpha-trade/klines?symbol=ALPHA_12USDT")));
  near(ca.points[0].value, 0.05);
  await portfolio.recordTransaction(
    await portfolio.parseTransactionInput({ mode: "virtual", assetType: "crypto", symbol: "pepe@binance-f", side: "buy", quantity: "1000000", price: "0,00001", currency: "USD", date: "2026-11-20" }),
    { fxTry: 40 },
  );
  const h = (await portfolio.getPortfolio("virtual")).holdings.find((x) => x.symbol === "PEPE@BINANCE-F");
  assert.ok(h, "vadeli coin portföyde");
  assert.equal(h.currency, "USD");
});

await test("arama: katalog eşleşmeleri kategori başına sınırlı, kripto 6 sınırı yok; gruplama", async () => {
  const res = await catalog.searchCatalog("btc", 15);
  const syms = res.filter((r) => r.category === "kripto").map((r) => r.symbol);
  assert.equal(syms[0], "BTC"); // tam sembol eşleşmesi önce
  assert.ok(syms.length >= 4, syms.join(","));
  const many = await catalog.searchCatalog("a", 15);
  assert.ok(many.filter((r) => r.category === "bist").length <= 15);
  const grouped = market.groupResults([
    { category: "hisse" as const, n: 1 },
    { category: "kripto" as const, n: 2 },
    { category: "altin" as const, n: 3 },
    { category: "kripto" as const, n: 4 },
    { category: "emtia" as const, n: 5 },
  ]);
  assert.deepEqual(grouped.map((g) => g.n), [1, 2, 4, 3, 5]); // grup sırası: ilk görünüş
  assert.deepEqual(market.mapYahoo("SPY", "ETF"), { assetType: "foreign", symbol: "SPY", category: "etf" });
  assert.deepEqual(market.mapYahoo("SI=F", "FUTURE"), { assetType: "foreign", symbol: "SI=F", category: "emtia" });
  assert.deepEqual(market.mapYahoo("^GDAXI", "INDEX"), { assetType: "foreign", symbol: "^GDAXI", category: "endeks" });
  assert.deepEqual(market.mapYahoo("XU030.IS", "INDEX"), { assetType: "bist", symbol: "XU030", category: "endeks" });
  assert.equal(market.mapYahoo("AAPL", "EQUITY")?.category, "hisse");
});

await test("Yahoo'da bulunan sembol kataloğa eklenir (statik kayıt ezilmez)", async () => {
  await catalog.rememberSearchHit({ assetType: "foreign", symbol: "RIVN", name: "Rivian Automotive", exchange: "NASDAQ", currency: "USD", category: "hisse" });
  await catalog.rememberSearchHit({ assetType: "foreign", symbol: "AAPL", name: "Başka Ad", exchange: "X", currency: "USD", category: "hisse" });
  const hisse = await catalog.listCatalog("hisse", { q: "rivian" });
  assert.equal(hisse.items[0]?.symbol, "RIVN");
  assert.equal((await catalog.catalogEntry("foreign", "AAPL"))?.name, "Apple");
});

// ---- Tam listeler: TEFAS, ABD, BIST ---------------------------------------------------------------
console.log("Tam listeler ve tekillik");

await test("TEFAS fon listesi ayrıştırma: geçersiz kod atlanır, kod başına tek satır, tür etiketi", () => {
  const rows = catalog.parseTefasFundList("YAT", { resultList: TEFAS_LIST.YAT });
  assert.deepEqual(rows.map((r) => r.symbol), ["AFT", "IPB", "MAC", "TTE", "YAS"]);
  const aft = rows.find((r) => r.symbol === "AFT")!;
  assert.equal(aft.name, "AK PORTFÖY YENİ TEKNOLOJİLER YABANCI HİSSE SENEDİ FONU"); // ilk geçiş
  assert.equal(aft.exchange, "Yatırım fonu · Hisse Senedi Şemsiye Fonu");
  assert.deepEqual([aft.asset_type, aft.category, aft.currency, aft.source], ["fund", "fon", "TRY", "tefas-yat"]);
  assert.equal(catalog.parseTefasFundList("EMK", { resultList: TEFAS_LIST.EMK })[0].exchange, "Emeklilik fonu (BES) · Hisse Senedi Fonu");
  assert.deepEqual(catalog.parseTefasFundList("BYF", null), []);
  assert.deepEqual(catalog.parseTefasFundList("BYF", { resultList: "bozuk" }), []);
});

await test("Nasdaq sembol dizini: deneme, varant, birim, hak, imtiyazlı ve Cboe elenir; BRK.B → BRK-B; yinelenen tek", () => {
  const rows = catalog.parseUsSymbolDirectory(NASDAQ_LISTED, OTHER_LISTED, new Set(["AAPL", "BRK-B"]));
  const by = new Map(rows.map((r) => [r.symbol, r]));
  for (const s of ["AAPL", "BRK-B", "ZZTT", "ABCDW", "ABCDU", "ABCDR", "BAC$K", "BAC-K", "XYZ-U", "CBZZ", "PFDX"]) assert.ok(!by.has(s), `${s} alınmamalı`);
  assert.equal(rows.filter((r) => r.symbol === "RIVN").length, 1);
  assert.deepEqual({ ...by.get("RIVN") }, { ...by.get("RIVN"), name: "Rivian Automotive, Inc. Class A", exchange: "Nasdaq", category: "hisse" });
  assert.equal(by.get("BF-B")?.exchange, "NYSE");
  assert.equal(by.get("BF-B")?.name, "Brown-Forman Corporation Class B");
  assert.equal(by.get("ETFZ")?.category, "etf");
  assert.deepEqual([by.get("SPYZ")?.category, by.get("SPYZ")?.exchange], ["etf", "NYSE Arca"]);
  assert.ok(by.has("ADRZ"), "ADR alınır");
  assert.ok(by.has("PBT"), "royalty trust birimleri alınır");
  assert.ok(rows.length > 3000);
  assert.throws(() => catalog.parseUsSymbolDirectory("bozuk|başlık\nA|B", OTHER_LISTED), /biçimi/);
});

await test("BIST hisse listesi: piyasa değerine göre sıra, statik semboller atlanır, HTML karakterleri çözülür", () => {
  const rows = catalog.parseIsYatirimStocks(ISYATIRIM_HTML, new Set(["THYAO"]));
  assert.deepEqual(rows.slice(0, 2).map((r) => [r.symbol, r.name]), [["BUYUK", "Büyük & Değerli A.Ş."], ["A1CAP", "A1 Capital"]]);
  assert.equal(rows.filter((r) => r.symbol === "A1CAP").length, 1);
  assert.ok(!rows.some((r) => r.symbol === "THYAO"));
  assert.deepEqual(catalog.parseIsYatirimStocks("<html>sayfa değişti</html>"), []);
});

await test("katalog: fonlar, ABD ve BIST tam listeleri; her sembol tek satır, statik ad ve sıra korunur", async () => {
  const conn = await db.getDb();
  const dup = await conn.all("SELECT asset_type, symbol, COUNT(*) AS c FROM symbol_catalog GROUP BY asset_type, symbol HAVING COUNT(*) > 1");
  assert.deepEqual(dup, []);
  assert.equal((await catalog.catalogEntry("foreign", "AAPL"))?.name, "Apple"); // statik ad ezilmez
  assert.equal((await catalog.catalogEntry("foreign", "BRK-B"))?.name, "Berkshire Hathaway B");
  assert.equal((await catalog.catalogEntry("bist", "THYAO"))?.name, "Türk Hava Yolları");
  assert.equal((await catalog.catalogEntry("foreign", "SPYZ"))?.category, "etf");
  assert.equal((await catalog.catalogEntry("bist", "A1CAP"))?.exchange, "Borsa İstanbul");
  const etf = await catalog.listCatalog("etf", { pageSize: 5 });
  assert.ok(etf.total > 300, `etf: ${etf.total}`);
  assert.equal(etf.items[0].symbol, "SPY"); // statik (popüler) liste önce
  assert.equal((await catalog.listCatalog("hisse", { q: "rivian" })).items[0]?.symbol, "RIVN");
});

await test("Fonlar listesi: tüm TEFAS fonları, tür süzgeci, arama; aramada fon görünür", async () => {
  const all = await catalog.listCatalog("fon", { pageSize: 50 });
  assert.equal(all.total, 15);
  assert.ok(all.items.every((i) => i.assetType === "fund" && i.instrument === `fund:${i.symbol}`));
  assert.deepEqual((await catalog.listCatalog("fon", { fundKind: "emk" })).items.map((i) => i.symbol), ["AEA", "AEH", "AH1", "AH2", "AH3"]);
  assert.equal((await catalog.listCatalog("fon", { fundKind: "byf" })).total, 5);
  assert.equal((await catalog.listCatalog("fon", { fundKind: "bilinmeyen" })).total, 15); // geçersiz süzgeç yok sayılır
  assert.equal((await catalog.listCatalog("fon", { q: "is portfoy" })).total, 2); // Türkçe harfler ASCII ile
  assert.equal((await catalog.listCatalog("fon", { q: "aft" })).items[0]?.symbol, "AFT");
  const s = await catalog.searchCatalog("marmara");
  assert.ok(s.some((x) => x.instrument === "fund:MAC"));
});

await test("yenileme: fon kaynağı hata verirse eski fonlar korunur; az satır gelen liste budanmaz; bilinen fon eklenir", async () => {
  await new Promise((r) => setTimeout(r, 1100));
  const conn = await db.getDb();
  await conn.run("INSERT INTO funds (code, name, last_price, last_date) VALUES ('ZZZ', 'ESKİ BİR FON', 1.5, '2026-01-02')");
  routes = catalogRoutes();
  routes["https://www.tefas.gov.tr/api/funds/fonGetiriBazliBilgiGetir"] = (b: { fonTipi?: string } | null) =>
    b?.fonTipi === "EMK" ? new Error("TEFAS kapalı") : { resultList: (TEFAS_LIST[b?.fonTipi ?? ""] ?? []).filter((f) => (f as { fonKodu?: string }).fonKodu !== "YAS") };
  routes["https://www.nasdaqtrader.com/dynamic/SymDir/otherlisted.txt"] = "ACT Symbol|Security Name|Exchange|CQS Symbol|ETF|Round Lot Size|Test Issue|NASDAQ Symbol\n";
  const r = await catalog.refreshCatalog();
  assert.equal(r.tefas.YAT, 4);
  assert.match(String(r.tefas.EMK), /hata/);
  assert.equal(typeof r.nasdaq, "number"); // yalnızca nasdaqlisted yine de 3000'i aşar
  assert.equal(await catalog.catalogEntry("foreign", "SPYZ"), null, "otherlisted.txt.den çıkan ETF silinir");
  assert.equal(await conn.get("SELECT 1 FROM symbol_catalog WHERE asset_type = 'fund' AND symbol = 'YAS'"), undefined, "listeden çıkan fon silinir");
  assert.equal((await catalog.listCatalog("fon", { fundKind: "emk" })).total, 5, "EMK satırları korunmalı");
  assert.equal((await catalog.catalogEntry("fund", "ZZZ"))?.name, "ESKİ BİR FON");
  assert.equal((await catalog.catalogEntry("fund", "AFT"))?.exchange, "Yatırım fonu · Hisse Senedi Şemsiye Fonu");
  // ABD listesi şüpheli derecede kısa gelirse (eşik altı) eski satırlar korunur
  routes["https://www.nasdaqtrader.com/dynamic/SymDir/nasdaqlisted.txt"] = NASDAQ_LISTED.split("\r\n").slice(0, 20).join("\r\n");
  const r2 = await catalog.refreshCatalog();
  assert.match(String(r2.nasdaq), /eksik/);
  assert.ok(await catalog.catalogEntry("foreign", "ETFZ"), "ABD satırları korunmalı");
  routes = catalogRoutes();
  await catalog.refreshCatalog();
});

await test("ABD: HTTPS bot koruması (200 + HTML) verirse dizin FTP'den alınır; FTP de olmazsa eski satırlar korunur", async () => {
  await new Promise((r) => setTimeout(r, 1100));
  // nasdaqtrader.com Imperva'nın arkasında: Node isteklerine çoğu zaman 200 + sorgu sayfası döner
  const challenge = '<html style="height:100%"><head><META NAME="ROBOTS" CONTENT="NOINDEX, NOFOLLOW"></head><body><iframe>Request unsuccessful. Incapsula incident ID: 1-2</iframe></body></html>';
  routes = catalogRoutes();
  routes["https://www.nasdaqtrader.com/dynamic/SymDir/nasdaqlisted.txt"] = challenge;
  routes["https://www.nasdaqtrader.com/dynamic/SymDir/otherlisted.txt"] = new Error("fetch failed");
  const ftp: string[] = [];
  const files: Record<string, string> = { "/symboldirectory/nasdaqlisted.txt": NASDAQ_LISTED, "/symboldirectory/otherlisted.txt": OTHER_LISTED };
  const r = await catalog.refreshCatalog({ fetchFtp: async (f) => (ftp.push(f), files[f] ?? "") });
  assert.equal(typeof r.nasdaq, "number", String(r.nasdaq));
  assert.deepEqual(ftp.sort(), Object.keys(files));
  assert.ok(await catalog.catalogEntry("foreign", "SPYZ"), "otherlisted.txt FTP'den yazılır");
  assert.equal((await (await db.getDb()).get<{ c: number }>("SELECT COUNT(*) AS c FROM symbol_catalog WHERE source = 'nasdaq'"))?.c, r.nasdaq);
  // FTP ve GitHub aynası da olmazsa kaynak hata döner; ABD satırları varken anlık görüntü yazılmaz, satırlar silinmez
  let snapshotLoads = 0;
  const r2 = await catalog.refreshCatalog({ fetchFtp: async () => challenge, loadUsSnapshot: async () => (snapshotLoads++, null) });
  assert.match(String(r2.nasdaq), /(nasdaq|other)listed\.txt alınamadı \(HTTPS: (.*bot koruması.*|fetch failed); FTP: sembol dizini değil; GitHub: ağ kapalı/);
  assert.equal(snapshotLoads, 0);
  assert.equal(r2.usSnapshot, undefined);
  assert.equal(r2.bist, r.bist, "sonraki kaynak etkilenmez");
  assert.ok(await catalog.catalogEntry("foreign", "SPYZ"), "ABD satırları korunmalı");
  routes = catalogRoutes();
});

// GitHub aynası Nasdaq Trader dosyalarının CSV kopyasıdır (fazladan "Company Name" sütunu, tırnaklı alanlar)
const toMirrorCsv = (pipe: string) =>
  pipe
    .split("\r\n")
    .map((line, i) => {
      const f = line.split("|");
      f.splice(1, 0, i === 0 ? "Company Name" : (f[1] ?? ""));
      return f.map((x) => (/[",]/.test(x) ? `"${x.replace(/"/g, '""')}"` : x)).join(",");
    })
    .join("\n");

await test("CSV → | biçimi: tırnaklı alan, virgül, kaçış, CRLF", () => {
  assert.equal(catalog.csvToPipe('a,b,c\r\n"x, y","say ""hi""",z\n1,,3'), 'a|b|c\nx, y|say "hi"|z\n1||3');
  assert.equal(catalog.csvToPipe('h1,h2\n"a|b",c\n'), "h1|h2\na/b|c");
});

await test("ABD: HTTPS ve FTP olmazsa dizin GitHub aynasından (CSV) alınır", async () => {
  await new Promise((r) => setTimeout(r, 1100));
  routes = catalogRoutes();
  routes["https://www.nasdaqtrader.com/dynamic/SymDir/nasdaqlisted.txt"] = "<html>Incapsula</html>";
  routes["https://www.nasdaqtrader.com/dynamic/SymDir/otherlisted.txt"] = new Error("fetch failed");
  routes[catalog.US_MIRROR["nasdaqlisted.txt"]] = toMirrorCsv(NASDAQ_LISTED);
  routes[catalog.US_MIRROR["otherlisted.txt"]] = toMirrorCsv(OTHER_LISTED);
  const statics = new Set(catalog.staticRows().filter((x) => x.asset_type === "foreign").map((x) => x.symbol));
  const direct = catalog.parseUsSymbolDirectory(NASDAQ_LISTED, OTHER_LISTED, statics);
  const r = await catalog.refreshCatalog({ fetchFtp: async () => Promise.reject(new Error("FTP bağlantısı kapandı")), loadUsSnapshot: async () => null });
  assert.equal(r.nasdaq, direct.length, String(r.nasdaq));
  assert.equal((await catalog.catalogEntry("foreign", "RIVN"))?.name, "Rivian Automotive, Inc. Class A", "virgüllü ad bozulmaz");
  assert.equal((await catalog.catalogEntry("foreign", "SPYZ"))?.category, "etf");
  assert.equal((await catalog.catalogEntry("foreign", "BF-B"))?.exchange, "NYSE");
  routes = catalogRoutes();
});

await test("ABD: hiçbir ağ kaynağı olmazsa ve katalogda ABD listesi yoksa gömülü anlık görüntü yazılır", async () => {
  await new Promise((r) => setTimeout(r, 1100));
  const conn = await db.getDb();
  await conn.run("DELETE FROM symbol_catalog WHERE source = 'nasdaq'");
  routes = catalogRoutes();
  delete routes["https://www.nasdaqtrader.com/dynamic/SymDir/nasdaqlisted.txt"];
  delete routes["https://www.nasdaqtrader.com/dynamic/SymDir/otherlisted.txt"];
  const noFtp = async () => Promise.reject(new Error("FTP zaman aşımı"));
  const snap: import("../src/lib/catalog").UsSnapshot = {
    generatedAt: "2026-11-26T12:00:00.000Z",
    source: "test",
    rows: [
      ["AAPL", "Apple (statik listede: atlanır)", "Nasdaq", 0],
      ["SNPA", "Snapshot A Corp", "Nasdaq", 0],
      ["SNPE", "Snapshot ETF", "NYSE Arca", 1],
      ["bad symbol", "Geçersiz", "NYSE", 0],
    ],
  };
  const r = await catalog.refreshCatalog({ fetchFtp: noFtp, loadUsSnapshot: async () => snap });
  assert.equal(r.nasdaq, 2);
  assert.equal(r.usSnapshot, snap.generatedAt);
  assert.match(catalog.refreshSummary(r), /ABD 2 \(yedek liste 2026-11-26\)/);
  assert.equal((await catalog.catalogEntry("foreign", "SNPE"))?.category, "etf");
  assert.equal((await catalog.catalogEntry("foreign", "AAPL"))?.name, "Apple", "statik satır ezilmez");
  // Gömülü (uygulamayla gelen) gerçek anlık görüntü açılabiliyor ve tam liste içeriyor
  await new Promise((r) => setTimeout(r, 1100));
  await conn.run("DELETE FROM symbol_catalog WHERE source = 'nasdaq'");
  const r2 = await catalog.refreshCatalog({ fetchFtp: noFtp });
  assert.ok(typeof r2.nasdaq === "number" && r2.nasdaq > 8000, String(r2.nasdaq));
  assert.ok(r2.usSnapshot);
  assert.equal((await catalog.catalogEntry("foreign", "QQQM"))?.category, "etf");
  assert.equal((await catalog.catalogEntry("foreign", "BRK-A"))?.category, "hisse");
  assert.equal(await catalog.catalogEntry("foreign", "SNPA"), null, "yeni görüntüde olmayan satır budanır");
  // Ağ geri gelince gerçek liste yazılır, anlık görüntü satırları budanır (budama saniye çözünürlüklü)
  await new Promise((r) => setTimeout(r, 1100));
  routes = catalogRoutes();
  const r3 = await catalog.refreshCatalog();
  assert.equal(r3.usSnapshot, undefined);
  assert.equal(await catalog.catalogEntry("foreign", "QQQM"), null);
  assert.ok(await catalog.catalogEntry("foreign", "SPYZ"));
});

await test("katalogdan seçilen fon: fiyatı TEFAS'tan gelir, portföye eklenir", async () => {
  routes = {
    "https://www.tefas.gov.tr/api/funds/fonFiyatBilgiGetir": (b: { fonKodu?: string } | null) => ({
      resultList: [
        { fonKodu: b?.fonKodu, fonUnvan: "AGESA HAYAT VE EMEKLİLİK AH1 FONU", tarih: "2026-11-24", fiyat: 2 },
        { fonKodu: b?.fonKodu, fonUnvan: "AGESA HAYAT VE EMEKLİLİK AH1 FONU", tarih: "2026-11-25", fiyat: 2.1 },
      ],
    }),
  };
  const item = (await catalog.listCatalog("fon", { q: "ah1" })).items[0];
  assert.equal(item.instrument, "fund:AH1");
  const [q] = await prices.getQuotes([{ type: item.assetType, symbol: item.symbol }]);
  assert.deepEqual([q.price, q.currency, q.source], [2.1, "TRY", "TEFAS"]);
  near(q.changePct, 5);
  await portfolio.recordTransaction(
    await portfolio.parseTransactionInput({ mode: "virtual", assetType: item.assetType, symbol: item.symbol, side: "buy", quantity: "100", price: "2", currency: "TRY", date: "2026-11-20" }),
  );
  const h = (await portfolio.getPortfolio("virtual")).holdings.find((x) => x.symbol === "AH1");
  near(h?.valueTry, 210);
});

// ---- Fiyat ve portföy ---------------------------------------------------------------------------
console.log("TL / USD pariteleri: fiyat ve portföy");

await test("BtcTurk tek toplu ticker isteği; Binance TRY paritesi TL, USDT paritesi USD", async () => {
  routes = {
    "https://api.btcturk.com/api/v2/ticker": {
      data: [
        { pair: "BTCTRY", last: 4_010_000, dailyPercent: 2.5, open: 3_912_195, timestamp: Date.now() },
        { pair: "ETHTRY", last: 150_000, dailyPercent: -1, open: 151_515, timestamp: Date.now() },
        { pair: "BTCUSDT", last: 100_100, dailyPercent: 1, open: 99_108, timestamp: Date.now() },
      ],
    },
    "https://api.binance.com/api/v3/ticker/24hr": [
      { symbol: "BTCUSDT", lastPrice: "100000", priceChangePercent: "1.5", closeTime: Date.now() },
      { symbol: "BTCTRY", lastPrice: "4000000", priceChangePercent: "2", closeTime: Date.now() },
    ],
  };
  calls.length = 0;
  const q = await prices.getQuotes([
    { type: "crypto", symbol: "BTC" },
    { type: "crypto", symbol: "BTC-TRY" },
    { type: "crypto", symbol: "BTC@BTCTURK" },
    { type: "crypto", symbol: "ETH@BTCTURK" },
    { type: "crypto", symbol: "BTC-USDT@BTCTURK" },
  ]);
  assert.deepEqual(q.map((x) => [x.id, x.price, x.currency, x.source]), [
    ["crypto:BTC", 100_000, "USD", "Binance"],
    ["crypto:BTC-TRY", 4_000_000, "TRY", "Binance"],
    ["crypto:BTC@BTCTURK", 4_010_000, "TRY", "BtcTurk"],
    ["crypto:ETH@BTCTURK", 150_000, "TRY", "BtcTurk"],
    ["crypto:BTC-USDT@BTCTURK", 100_100, "USD", "BtcTurk"],
  ]);
  near(q[2].prevClose, 3_912_195);
  assert.equal(calls.filter((u) => u.startsWith("https://api.btcturk.com/api/v2/ticker")).length, 1, "BtcTurk tek istek");
  // Binance: tek toplu istek (20'li grup), sembol listesiyle
  assert.equal(calls.filter((u) => u.startsWith("https://api.binance.com/api/v3/ticker/24hr?symbols=")).length, 1);
});

await test("Binance toplu ticker 20'li gruplara bölünür (ağırlık 2'şer)", async () => {
  const bases = Array.from({ length: 45 }, (_, i) => `C${i}`);
  routes = {
    "https://api.binance.com/api/v3/ticker/24hr": bases.map((b) => ({ symbol: `${b}USDT`, lastPrice: "1", priceChangePercent: "0", closeTime: Date.now() })),
  };
  calls.length = 0;
  await prices.getQuotes(bases.map((b) => ({ type: "crypto" as const, symbol: b })));
  const batch = calls.filter((u) => u.includes("ticker/24hr?symbols="));
  assert.equal(batch.length, 3);
  for (const u of batch) assert.ok(JSON.parse(decodeURIComponent(u.split("symbols=")[1])).length <= 20);
});

await test("portföy: TL paritesi TL ile, USDT paritesi kurla değerlenir; K/Z doğru", async () => {
  // Kur ve fiyatlar önbellekte taze (ağ yok)
  const conn = await db.getDb();
  const now = Date.now();
  for (const [key, price, cur] of [
    ["yahoo:USDTRY=X", 40, "TRY"],
    ["binance:BTCUSDT", 100_000, "USD"],
    ["binance:BTCTRY", 4_000_000, "TRY"],
    ["btcturk:BTCTRY", 4_010_000, "TRY"],
  ] as const) {
    await conn.run(
      `INSERT INTO price_cache (key, price, currency, change_pct, source_time, fetched_at) VALUES (?, ?, ?, 0, ?, ?)
       ON CONFLICT(key) DO UPDATE SET price = excluded.price, currency = excluded.currency, fetched_at = excluded.fetched_at`,
      [key, price, cur, now, now + 60 * 60_000],
    );
  }
  (globalThis as { __yatirimPrices?: unknown }).__yatirimPrices = undefined; // bellek önbelleğini boşalt
  routes = {};
  const add = async (symbol: string, price: string, currency: string, fxTry?: number) =>
    await portfolio.recordTransaction(
      await portfolio.parseTransactionInput({ mode: "virtual", assetType: "crypto", symbol, side: "buy", quantity: "0,5", price, currency, date: "2026-01-05" }),
      fxTry ? { fxTry } : {},
    );
  await add("BTC-TRY", "3800000", "TRY");
  await add("btc@btcturk", "3900000", "TRY");
  await add("BTC", "90000", "USD", 38);
  const p = await portfolio.getPortfolio("virtual");
  const h = (sym: string) => p.holdings.find((x) => x.symbol === sym)!;
  assert.equal(h("BTC-TRY").currency, "TRY");
  near(h("BTC-TRY").valueTry, 2_000_000);
  near(h("BTC-TRY").pnlTry, 100_000);
  assert.equal(h("BTC@BTCTURK").currency, "TRY");
  near(h("BTC@BTCTURK").valueTry, 2_005_000);
  near(h("BTC@BTCTURK").pnlTry, 55_000);
  assert.equal(h("BTC").currency, "USD");
  near(h("BTC").value, 50_000);
  near(h("BTC").valueTry, 2_000_000); // 50.000 USD × 40
  near(h("BTC").costTry, 45_000 * 38);
  // Üç ayrı pozisyon (aynı coin, farklı parite/borsa)
  assert.equal(p.holdings.filter((x) => x.assetType === "crypto" && x.symbol.startsWith("BTC")).length, 3);
});

await test("izleme listesi, alarm ve emir yeni sembolleri kabul eder", async () => {
  const w = await market.addWatch("crypto", "eth@btcturk", "Ethereum");
  assert.equal(w.instrument, "crypto:ETH@BTCTURK");
  const w2 = await market.addWatch("foreign", "SI=F", "Gümüş");
  assert.equal(w2.instrument, "foreign:SI=F");
  const alarms = await import("../src/lib/alarms");
  const a = await alarms.createAlarm({ assetType: "crypto", symbol: "BTC-TRY", kind: "price", direction: "up", threshold: "5000000" });
  assert.equal(a.symbol, "BTC-TRY");
  const orders = await import("../src/lib/orders");
  const o = await orders.createOrder({ mode: "virtual", assetType: "crypto", symbol: "BTC@BTCTURK", side: "buy", condition: "lte", triggerPrice: "3000000", entryBy: "quantity", quantity: "0,1" });
  assert.equal(o.symbol, "BTC@BTCTURK");
});

// ---- Gerçek uçlar (isteğe bağlı) ---------------------------------------------------------------
if (LIVE) {
  console.log("Gerçek uçlar (küçük deneme)");
  globalThis.fetch = realFetch;
  await test("canlı: Binance + BtcTurk katalog doldurma", async () => {
    const r = await catalog.refreshCatalog();
    console.log("    sonuç:", JSON.stringify(r));
    const rows = await (await db.getDb()).all<{ category: string; source: string; c: number }>(
      "SELECT category, source, COUNT(*) AS c FROM symbol_catalog GROUP BY category, source ORDER BY category, source",
    );
    console.log("    " + rows.map((x) => `${x.category}/${x.source}: ${x.c}`).join(", "));
    assert.ok(typeof r.binance === "number" || typeof r.btcturk === "number");
  });
  await test("canlı: vadeli ve Alpha fiyatı ve grafiği", async () => {
    // Sahte testlerden kalan bellek önbellekleri
    Object.assign(globalThis, { __yatirimFutures: null, __yatirimAlpha: null, __yatirimPrices: undefined });
    for (const venue of ["binance-futures", "binance-alpha"]) {
      const it = (await catalog.listCatalog("kripto", { venue, pageSize: 5 })).items[0];
      if (!it) {
        console.log(`    ${venue}: satır yok`);
        continue;
      }
      const [q] = await prices.getQuotes([{ type: "crypto", symbol: it.symbol }]);
      const ch = await market.getChart("crypto", it.symbol, "1A");
      console.log(`    ${it.symbol} (${it.exchange}): ${q.price} ${q.currency} ${q.source}, grafik ${ch.points.length} nokta, son ${ch.points.at(-1)?.value}`);
      assert.ok(q.price != null && q.price > 0 && ch.points.length > 0);
    }
  });
}

await db.closeDb();
globalThis.fetch = realFetch;
console.log(`\n${passed} test geçti.`);
