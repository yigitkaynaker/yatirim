import "server-only";
import { background } from "./background";
import { detached, getDb, sqlNow } from "./db";
import {
  BIST_INDICES,
  cryptoSymbol,
  defaultCategory,
  GOLD_KINDS,
  instrumentId,
  isValidSymbol,
  type AssetType,
  type CatalogCategory,
  type CryptoQuote,
} from "./assets";
import { BIST_INDEX_NAMES, BIST_STOCKS, COMMODITIES, FX_CURRENCIES, US_ETFS, US_STOCKS, WORLD_INDICES } from "./catalogData";
import { ftpGetText } from "./ftp";
import { BROWSER_UA } from "./http";

// Sembol kataloğu (symbol_catalog tablosu; paylaşımlı, kullanıcıya özel değil). Piyasa sayfasındaki
// ayrı listeler (Kripto, BIST, ABD Hisseleri, ETF, Endeksler, Emtia, Döviz, Altın, Fonlar) ve arama
// buradan okunur. Kaynaklar:
//   - Binance Spot: /api/v3/exchangeInfo (TRADING durumundaki USDT ve TRY pariteleri; ağırlık 20) ve
//     sıralama için /api/v3/ticker/24hr?type=MINI (sembolsüz; ağırlık 80) — günde bir kez.
//   - BtcTurk: /api/v2/server/exchangeinfo (TRY ve USDT çiftleri ve coin adları; tek istek).
//   - Derlenmiş statik liste (catalogData.ts) + altın türleri; Yahoo aramasında bulunan yabancı
//     semboller de (kategori etiketiyle) eklenir.
//   - TEFAS: /api/funds/fonGetiriBazliBilgiGetir (fon türü başına bir istek: YAT yatırım, EMK
//     emeklilik (BES), BYF borsa yatırım fonu) — TEFAS'taki tüm fonlar. Daha önce doğrulanmış ama
//     listede olmayan fonlar (funds tablosu) da eklenir.
//   - Nasdaq Trader sembol dizini (nasdaqlisted.txt + otherlisted.txt): Nasdaq, NYSE, NYSE Arca ve
//     NYSE American'daki tüm hisse ve ETF'ler (deneme kağıtları, varant, birim, hak, imtiyazlı pay hariç).
//     HTTPS ucu Imperva bot korumasının arkasında (çoğu zaman 200 + HTML sorgu sayfası döner); dizin
//     değilse aynı dosyalar ftp.nasdaqtrader.com'dan, o da olmazsa GitHub'daki düzenli güncellenen
//     aynadan (datasets/nasdaq-listings aylık, datasets/nyse-other-listings günlük; CSV) alınır.
//     Hiçbiri olmazsa ve katalogda ABD listesi yoksa uygulamayla gelen anlık görüntü
//     (data/usSymbolsSnapshot.ts; scripts/generate-us-symbols.ts ile üretilir) yazılır.
//   - İş Yatırım "Temel Değerler ve Oranlar" sayfası: Borsa İstanbul'daki tüm hisseler (piyasa
//     değerine göre sıralı). Midas'taki BIST / ABD hisseleri, ETF ve TEFAS fonları bu tam listelerin
//     alt kümesidir; ayrı satır açılmaz.
// Tekillik: (asset_type, symbol) birincil anahtardır; her enstrüman tek satırdır. Tam listeler statik
// listedeki sembolleri atlar (derlenmiş ad ve sıra korunur), aynı sembol iki dosyada geçerse bir kez yazılır.
// Yenileme: yavaş nöbet görevi ("katalog", günde bir) ve yerel zamanlayıcı; katalog boşsa ilk
// listede tembel doldurma. Bir kaynak hata verirse (ya da şüpheli derecede az satır dönerse) o
// kaynağın eski satırları korunur.

const FETCH_TIMEOUT_MS = 20_000;
const BINANCE_BASES = ["https://api.binance.com", "https://data-api.binance.vision"];
const BTCTURK_EXCHANGEINFO = "https://api.btcturk.com/api/v2/server/exchangeinfo";
const TEFAS_FUND_LIST = "https://www.tefas.gov.tr/api/funds/fonGetiriBazliBilgiGetir";
const NASDAQ_LISTED = "https://www.nasdaqtrader.com/dynamic/SymDir/nasdaqlisted.txt";
const OTHER_LISTED = "https://www.nasdaqtrader.com/dynamic/SymDir/otherlisted.txt";
const NASDAQ_FTP_HOST = "ftp.nasdaqtrader.com";
const NASDAQ_FTP_DIR = "/symboldirectory/";
/** GitHub aynası (Nasdaq Trader dosyalarının CSV kopyası; kimlik doğrulamasız, veri merkezi IP'lerinden erişilebilir) */
export const US_MIRROR: Record<string, string> = {
  "nasdaqlisted.txt": "https://raw.githubusercontent.com/datasets/nasdaq-listings/main/data/nasdaq-listed-symbols.csv",
  "otherlisted.txt": "https://raw.githubusercontent.com/datasets/nyse-other-listings/main/data/other-listed.csv",
};
const ISYATIRIM_STOCKS = "https://www.isyatirim.com.tr/tr-tr/analiz/hisse/Sayfalar/Temel-Degerler-Ve-Oranlar.aspx";

/** TEFAS fon türleri ve katalog kaynağı adları (fon türü süzgeci kaynağa göre çalışır) */
export const FUND_KINDS = ["YAT", "EMK", "BYF"] as const;
export type FundKind = (typeof FUND_KINDS)[number];
export const FUND_KIND_LABEL: Record<FundKind, string> = { YAT: "Yatırım fonu", EMK: "Emeklilik fonu (BES)", BYF: "Borsa yatırım fonu" };
const fundSource = (k: FundKind) => `tefas-${k.toLowerCase()}`;
/** funds tablosundaki (daha önce doğrulanmış) ama TEFAS listesinde olmayan fonlar; budanmaz */
const KNOWN_FUND_SOURCE = "tefas-bilinen";
/** Tam listeler: bu sayının altında satır gelirse kaynak bozuk sayılır (eski satırlar korunur) */
const MIN_ROWS = { tefas: 1, nasdaq: 3000, isyatirim: 300 } as const;
/** Katalog bu süreden eskiyse yeniden doldurulur */
export const CATALOG_MAX_AGE_MS = 24 * 3600_000;

export interface CatalogItem {
  instrument: string;
  assetType: AssetType;
  symbol: string;
  name: string;
  /** Borsa / kaynak etiketi: Binance, BtcTurk, Borsa İstanbul, NASDAQ… */
  exchange: string;
  /** Fiyatın para birimi (USD, TRY…) */
  currency: string;
  category: CatalogCategory;
}

interface CatalogRow {
  asset_type: AssetType;
  symbol: string;
  name: string;
  exchange: string;
  currency: string;
  category: CatalogCategory;
  source: string;
  sort_rank: number;
}

/** Arama metni: küçük harf, Türkçe harfler ASCII'ye (PG ve SQLite'ta aynı LIKE davranışı için) */
export function searchKey(text: string): string {
  return text
    .toLocaleLowerCase("tr-TR")
    .replace(/[çğıöşüâîû]/g, (c) => ({ ç: "c", ğ: "g", ı: "i", ö: "o", ş: "s", ü: "u", â: "a", î: "i", û: "u" })[c] ?? c)
    .replace(/\s+/g, " ")
    .trim();
}

function toItem(r: Pick<CatalogRow, "asset_type" | "symbol" | "name" | "exchange" | "currency" | "category">): CatalogItem {
  return {
    instrument: instrumentId(r.asset_type, r.symbol),
    assetType: r.asset_type,
    symbol: r.symbol,
    name: r.name ?? r.symbol,
    exchange: r.exchange ?? "",
    currency: r.currency ?? "",
    category: r.category,
  };
}

// ---- Statik kısım ---------------------------------------------------------------------

export function staticRows(): CatalogRow[] {
  const rows: CatalogRow[] = [];
  const add = (asset_type: AssetType, list: readonly (readonly [string, string])[], category: CatalogCategory, exchange: string, currency: string) =>
    list.forEach(([symbol, name], i) => rows.push({ asset_type, symbol, name, exchange, currency, category, source: "static", sort_rank: i }));
  add("bist", BIST_STOCKS, "bist", "Borsa İstanbul", "TRY");
  add("bist", BIST_INDEX_NAMES.filter(([s]) => (BIST_INDICES as readonly string[]).includes(s)), "endeks", "Borsa İstanbul", "TRY");
  add("foreign", WORLD_INDICES, "endeks", "Endeks", "USD");
  // Endeks listesinde önce BIST, sonra dünya endeksleri
  for (const r of rows) if (r.category === "endeks" && r.asset_type === "foreign") r.sort_rank += 100;
  add("foreign", US_STOCKS, "hisse", "ABD", "USD");
  add("foreign", US_ETFS, "etf", "ABD", "USD");
  add("foreign", COMMODITIES, "emtia", "Vadeli (COMEX/NYMEX/CBOT)", "USD");
  add("fx", FX_CURRENCIES, "doviz", "Döviz", "TRY");
  add("gold", GOLD_KINDS.map((k) => [k.symbol, k.label] as const), "altin", "Kuyumcu", "TRY");
  // Endekslerde para birimi yerine puan: yabancı endekslerin birimi kaynağa göre değişir
  for (const r of rows) if (r.category === "endeks" && r.asset_type === "foreign") r.currency = "";
  return rows;
}

// ---- Kripto borsaları -------------------------------------------------------------------

type FetchJson = (url: string, init?: { json?: unknown }) => Promise<unknown>;
type FetchText = (url: string) => Promise<string>;
/** FTP sunucusundaki dosya yolu → metin (testlerde sahte) */
type FetchFtp = (file: string) => Promise<string>;

async function defaultFetchJson(url: string, init: { json?: unknown } = {}): Promise<unknown> {
  const res = await fetch(url, {
    method: init.json !== undefined ? "POST" : "GET",
    headers: init.json !== undefined ? { "Content-Type": "application/json", Accept: "application/json, text/plain, */*", "User-Agent": BROWSER_UA } : undefined,
    body: init.json !== undefined ? JSON.stringify(init.json) : undefined,
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    cache: "no-store",
  });
  if (!res.ok) throw Object.assign(new Error(`HTTP ${res.status}`), { status: res.status });
  return await res.json();
}

/** Metin / HTML kaynakları (tarayıcı benzeri başlıklarla; büyük dosyalar için daha uzun süre) */
async function defaultFetchText(url: string): Promise<string> {
  const res = await fetch(url, {
    headers: { "User-Agent": BROWSER_UA, Accept: "text/html, text/plain, */*", "Accept-Language": "tr-TR,tr;q=0.9,en;q=0.8" },
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS * 2),
    cache: "no-store",
  });
  if (!res.ok) throw Object.assign(new Error(`HTTP ${res.status}`), { status: res.status });
  return await res.text();
}

/** Binance ana uç noktası, engellenirse (451/403) herkese açık piyasa verisi aynası */
async function binanceJson(path: string, fetchJson: FetchJson): Promise<unknown> {
  let lastErr: unknown = null;
  for (const base of BINANCE_BASES) {
    try {
      return await fetchJson(`${base}${path}`);
    } catch (err) {
      lastErr = err;
      const status = (err as { status?: number }).status;
      // Hız sınırı / IP yasağı: aynaya geçmek de yük bindirir, bugünlük bırak
      if (status === 429 || status === 418) break;
    }
  }
  throw new Error(`Binance katalog alınamadı (${(lastErr as Error)?.message ?? lastErr})`);
}

interface BinanceSymbolInfo {
  symbol: string;
  status: string;
  baseAsset: string;
  quoteAsset: string;
  isSpotTradingAllowed?: boolean;
}

const VALID_BASE = /^[A-Z0-9]{1,15}$/;

/** Binance USDT ve TRY spot pariteleri (sıralama: 24 saatlik USDT işlem hacmi) */
export async function fetchBinanceCatalog(names: Map<string, string>, fetchJson: FetchJson = defaultFetchJson): Promise<CatalogRow[]> {
  const info = (await binanceJson("/api/v3/exchangeInfo?permissions=SPOT&symbolStatus=TRADING&showPermissionSets=false", fetchJson)) as { symbols?: BinanceSymbolInfo[] };
  const symbols = (info.symbols ?? []).filter(
    (s) => s.status === "TRADING" && (s.quoteAsset === "USDT" || s.quoteAsset === "TRY") && VALID_BASE.test(s.baseAsset) && s.isSpotTradingAllowed !== false,
  );
  if (symbols.length === 0) throw new Error("Binance katalog boş geldi");
  // Hacim sıralaması isteğe bağlı: alınamazsa alfabetik
  const volume = new Map<string, number>();
  try {
    const mini = (await binanceJson("/api/v3/ticker/24hr?type=MINI", fetchJson)) as { symbol: string; quoteVolume: string }[];
    for (const t of Array.isArray(mini) ? mini : []) {
      const v = Number(t.quoteVolume);
      if (Number.isFinite(v)) volume.set(t.symbol, v);
    }
  } catch (err) {
    console.warn("[katalog] Binance hacim sıralaması alınamadı:", (err as Error).message);
  }
  const usdtRank = new Map<string, number>();
  symbols
    .filter((s) => s.quoteAsset === "USDT")
    .sort((a, b) => (volume.get(b.symbol) ?? 0) - (volume.get(a.symbol) ?? 0) || a.baseAsset.localeCompare(b.baseAsset))
    .forEach((s, i) => usdtRank.set(s.baseAsset, i));
  return symbols.map((s) => {
    const quote = s.quoteAsset as CryptoQuote;
    const base = usdtRank.get(s.baseAsset) ?? 5000;
    return {
      asset_type: "crypto" as const,
      symbol: cryptoSymbol(s.baseAsset, quote, "BINANCE"),
      name: names.get(s.baseAsset) ?? s.baseAsset,
      exchange: "Binance",
      currency: quote === "TRY" ? "TRY" : "USD",
      category: "kripto" as const,
      source: "binance",
      sort_rank: base * 4 + (quote === "USDT" ? 0 : 1),
    };
  });
}

interface BtcTurkInfo {
  data?: {
    symbols?: { name: string; status: string; numerator: string; denominator: string; order?: number }[];
    currencies?: { symbol: string; name?: string; currencyType?: string }[];
  };
}

/** BtcTurk TRY ve USDT çiftleri + coin adları (Binance satırlarında da kullanılır) */
export async function fetchBtcTurkCatalog(fetchJson: FetchJson = defaultFetchJson): Promise<{ rows: CatalogRow[]; names: Map<string, string> }> {
  const info = (await fetchJson(BTCTURK_EXCHANGEINFO)) as BtcTurkInfo;
  const names = new Map<string, string>();
  for (const c of info.data?.currencies ?? []) {
    if (c.currencyType === "CRYPTO" && c.name && VALID_BASE.test(c.symbol)) names.set(c.symbol, c.name);
  }
  const symbols = (info.data?.symbols ?? []).filter(
    (s) => s.status === "TRADING" && (s.denominator === "TRY" || s.denominator === "USDT") && VALID_BASE.test(s.numerator),
  );
  if (symbols.length === 0) throw new Error("BtcTurk katalog boş geldi");
  const rows = symbols.map((s, i) => {
    const quote = s.denominator as CryptoQuote;
    return {
      asset_type: "crypto" as const,
      symbol: cryptoSymbol(s.numerator, quote, "BTCTURK"),
      name: names.get(s.numerator) ?? s.numerator,
      exchange: "BtcTurk",
      currency: quote === "TRY" ? "TRY" : "USD",
      category: "kripto" as const,
      source: "btcturk",
      // BtcTurk'ün kendi sıralaması (order); BtcTurk satırları Binance'ten sonra gelir
      sort_rank: 100_000 + (s.order ?? 9000 + i) * 2 + (quote === "TRY" ? 0 : 1),
    };
  });
  return { rows, names };
}

// ---- TEFAS fonları ----------------------------------------------------------------------

/** fonGetiriBazliBilgiGetir isteği (getiri sütunları istenmese de uç nokta bu alanları bekler) */
function tefasListPayload(kind: FundKind) {
  return {
    dil: "TR",
    fonTipi: kind,
    kurucuKodu: null,
    sfonTurKod: null,
    fonTurAciklama: null,
    islem: 1,
    fonTurKod: null,
    fonGrubu: null,
    donemGetiri1a: "1",
    donemGetiri3a: "1",
    donemGetiri6a: "1",
    donemGetiri1y: "1",
    donemGetiriyb: "1",
    donemGetiri3y: "1",
    donemGetiri5y: "1",
    basTarih: null,
    bitTarih: null,
    calismaTipi: 2,
    getiriOrani: "1",
  };
}

/** TEFAS fon listesi yanıtı → katalog satırları (geçersiz kodlar atlanır, kod başına tek satır). Saf fonksiyon. */
export function parseTefasFundList(kind: FundKind, body: unknown): CatalogRow[] {
  const list = (body as { resultList?: unknown } | null)?.resultList;
  const byCode = new Map<string, { name: string; group: string }>();
  for (const r of Array.isArray(list) ? (list as Record<string, unknown>[]) : []) {
    if (!r || typeof r !== "object") continue;
    const code = typeof r.fonKodu === "string" ? r.fonKodu.trim().toUpperCase() : "";
    if (!/^[A-Z0-9]{3}$/.test(code) || byCode.has(code)) continue;
    const name = typeof r.fonUnvan === "string" && r.fonUnvan.trim() ? r.fonUnvan.replace(/\s+/g, " ").trim() : code;
    const group = typeof r.fonTurAciklama === "string" ? r.fonTurAciklama.replace(/\s+/g, " ").trim() : "";
    byCode.set(code, { name, group });
  }
  const base = FUND_KINDS.indexOf(kind) * 10_000;
  return [...byCode.entries()]
    .sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0))
    .map(([code, f], i) => ({
      asset_type: "fund" as const,
      symbol: code,
      name: f.name.slice(0, 160),
      exchange: [FUND_KIND_LABEL[kind], f.group].filter(Boolean).join(" · ").slice(0, 100),
      currency: "TRY",
      category: "fon" as const,
      source: fundSource(kind),
      sort_rank: base + i,
    }));
}

export async function fetchTefasCatalog(kind: FundKind, fetchJson: FetchJson = defaultFetchJson): Promise<CatalogRow[]> {
  const rows = parseTefasFundList(kind, await fetchJson(TEFAS_FUND_LIST, { json: tefasListPayload(kind) }));
  if (rows.length < MIN_ROWS.tefas) throw new Error(`TEFAS ${kind} listesi boş geldi`);
  return rows;
}

// ---- ABD hisseleri ve ETF'ler (Nasdaq Trader sembol dizini) ------------------------------------

const US_EXCHANGES: Record<string, { label: string; tier: number }> = {
  // nasdaqlisted.txt "Market Category": Q Global Select, G Global Market, S Capital Market
  "NASDAQ:Q": { label: "Nasdaq", tier: 0 },
  "NASDAQ:G": { label: "Nasdaq", tier: 1 },
  "NASDAQ:S": { label: "Nasdaq", tier: 2 },
  // otherlisted.txt "Exchange": N NYSE, P NYSE Arca, A NYSE American (Z Cboe, V IEX alınmaz)
  N: { label: "NYSE", tier: 0 },
  P: { label: "NYSE Arca", tier: 1 },
  A: { label: "NYSE American", tier: 2 },
};

/** Varant, birim, hak, imtiyazlı pay, tahvil / not: alınmaz ("American Depositary Shares" alınır) */
const US_EXCLUDE = /\b(warrants?|units?(?! of beneficial)|rights?|preferred|preference|notes?|bonds?|debentures?|subordinated|when[- ]issued|strats)\b|\d\s?%/i;

function cleanUsName(name: string): string {
  return name
    .replace(/\s+-\s+/g, " ")
    .replace(/[,(]?\s*each represent.*$/i, "")
    .replace(/\b(common stock|ordinary shares|common shares|shares of beneficial interest)\b\.?/gi, "")
    .replace(/\s+/g, " ")
    .replace(/[\s,-]+$/, "")
    .trim();
}

/**
 * nasdaqlisted.txt + otherlisted.txt (| ayrılmış) → ABD hisse / ETF satırları. Yahoo biçimi: BRK.B → BRK-B.
 * Statik listede olan semboller (`skip`) atlanır; aynı sembol iki dosyada geçerse ilk geçiş alınır. Saf fonksiyon.
 */
export function parseUsSymbolDirectory(nasdaqListed: string, otherListed: string, skip: ReadonlySet<string> = new Set()): CatalogRow[] {
  const out = new Map<string, { name: string; etf: boolean; exchange: string; tier: number }>();
  const read = (text: string, nasdaq: boolean) => {
    const lines = text.split(/\r?\n/);
    const header = (lines[0] ?? "").split("|").map((h) => h.trim());
    const col = (n: string) => header.indexOf(n);
    const iSym = col(nasdaq ? "Symbol" : "ACT Symbol");
    const iName = col("Security Name");
    const iTest = col("Test Issue");
    const iEtf = col("ETF");
    const iEx = col(nasdaq ? "Market Category" : "Exchange");
    if (iSym < 0 || iName < 0 || iTest < 0 || iEtf < 0 || iEx < 0) throw new Error("Nasdaq sembol dizini biçimi değişmiş");
    for (const line of lines.slice(1)) {
      if (!line || line.startsWith("File Creation Time")) continue;
      const f = line.split("|");
      const raw = (f[iSym] ?? "").trim();
      const name = (f[iName] ?? "").trim();
      if (f[iTest] === "Y" || !name) continue;
      const ex = US_EXCHANGES[nasdaq ? `NASDAQ:${f[iEx]}` : (f[iEx] ?? "")];
      if (!ex) continue;
      // Yalnızca sade semboller ve tek harfli pay sınıfı (BRK.B); $ (imtiyazlı), .U/.W/.R/.WS vb. alınmaz
      if (!/^[A-Z]{1,6}(\.[A-Z])?$/.test(raw) || /\.[UWR]$/.test(raw)) continue;
      const etf = f[iEtf] === "Y";
      if (!etf && US_EXCLUDE.test(name)) continue;
      const symbol = raw.replace(".", "-");
      if (skip.has(symbol) || out.has(symbol)) continue;
      out.set(symbol, { name: cleanUsName(name) || symbol, etf, exchange: ex.label, tier: ex.tier });
    }
  };
  read(nasdaqListed, true);
  read(otherListed, false);
  return [...out.entries()]
    .sort((a, b) => a[1].tier - b[1].tier || (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0))
    .map(([symbol, r], i) => ({
      asset_type: "foreign" as const,
      symbol,
      name: r.name.slice(0, 120),
      exchange: r.exchange,
      currency: "USD",
      category: r.etf ? ("etf" as const) : ("hisse" as const),
      source: "nasdaq",
      // Statik (popüler) liste önce gelir
      sort_rank: 10_000 + i,
    }));
}

const defaultFetchFtp: FetchFtp = (file) => ftpGetText(NASDAQ_FTP_HOST, file);

/** Sembol dizini başlığıyla başlıyor mu (bot koruması 200 durum koduyla HTML sorgu sayfası döndürebilir) */
const isSymbolDirectory = (text: string) => /^(Symbol|ACT Symbol)\|/.test(text.replace(/^﻿/, ""));

/** CSV (RFC 4180: tırnaklı alan, "" kaçışı) → | ayrılmış metin (Nasdaq Trader dosya biçimi; GitHub aynası için) */
export function csvToPipe(csv: string): string {
  const out: string[] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  const endRow = () => {
    row.push(field);
    out.push(row.map((f) => f.replace(/\|/g, "/")).join("|"));
    row = [];
    field = "";
  };
  for (let i = 0; i < csv.length; i++) {
    const c = csv[i];
    if (quoted) {
      if (c === '"' && csv[i + 1] === '"') {
        field += '"';
        i++;
      } else if (c === '"') quoted = false;
      else field += c;
    } else if (c === '"') quoted = true;
    else if (c === ",") {
      row.push(field);
      field = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && csv[i + 1] === "\n") i++;
      endRow();
    } else field += c;
  }
  if (field || row.length) endRow();
  return out.join("\n");
}

/**
 * Önce HTTPS; yanıt hata ya da dizin dışı bir sayfaysa (Imperva) aynı dosya FTP'den; o da olmazsa
 * GitHub aynasından (CSV → | biçimi). Hepsi başarısızsa her denemenin nedeniyle hata verir.
 */
async function loadSymbolFile(url: string, fetchText: FetchText, fetchFtp: FetchFtp): Promise<string> {
  const file = url.slice(url.lastIndexOf("/") + 1);
  let reason: string;
  try {
    const text = await fetchText(url);
    if (isSymbolDirectory(text)) return text;
    reason = "sembol dizini yerine başka bir sayfa (bot koruması)";
  } catch (err) {
    reason = (err as Error).message;
  }
  let ftpReason: string;
  try {
    const text = await fetchFtp(`${NASDAQ_FTP_DIR}${file}`);
    if (isSymbolDirectory(text)) return text;
    ftpReason = "sembol dizini değil";
  } catch (err) {
    ftpReason = (err as Error).message;
  }
  let mirrorReason = "ayna yok";
  const mirror = US_MIRROR[file];
  if (mirror) {
    try {
      const text = csvToPipe(await fetchText(mirror));
      if (isSymbolDirectory(text)) return text;
      mirrorReason = "sembol dizini değil";
    } catch (err) {
      mirrorReason = (err as Error).message;
    }
  }
  throw new Error(`Nasdaq ${file} alınamadı (HTTPS: ${reason}; FTP: ${ftpReason}; GitHub: ${mirrorReason})`);
}

export async function fetchUsCatalog(skip: ReadonlySet<string>, fetchText: FetchText = defaultFetchText, fetchFtp: FetchFtp = defaultFetchFtp): Promise<CatalogRow[]> {
  const [a, b] = await Promise.all([loadSymbolFile(NASDAQ_LISTED, fetchText, fetchFtp), loadSymbolFile(OTHER_LISTED, fetchText, fetchFtp)]);
  const rows = parseUsSymbolDirectory(a, b, skip);
  if (rows.length < MIN_ROWS.nasdaq) throw new Error(`Nasdaq sembol dizini eksik geldi (${rows.length})`);
  return rows;
}

// ---- ABD anlık görüntüsü (son çare) ---------------------------------------------------------------

/** Uygulamayla gelen ABD sembol listesi: [sembol, ad, borsa, ETF mi (1/0)], borsa kademesine göre sıralı */
export interface UsSnapshot {
  /** Üretildiği an (ISO) ve kaynak */
  generatedAt: string;
  source: string;
  rows: [string, string, string, 0 | 1][];
}
type LoadUsSnapshot = () => Promise<UsSnapshot | null>;

/** Satırları anlık görüntü biçimine çevirir (scripts/generate-us-symbols.ts) */
export function toUsSnapshot(rows: CatalogRow[], source: string, generatedAt = new Date().toISOString()): UsSnapshot {
  return { generatedAt, source, rows: rows.map((r) => [r.symbol, r.name, r.exchange, r.category === "etf" ? 1 : 0]) };
}

/** Anlık görüntü → katalog satırları (statik listedekiler atlanır). Saf fonksiyon. */
export function usSnapshotRows(snap: UsSnapshot, skip: ReadonlySet<string> = new Set()): CatalogRow[] {
  return snap.rows
    .filter(([symbol]) => !skip.has(symbol) && isValidSymbol("foreign", symbol))
    .map(([symbol, name, exchange, etf], i) => ({
      asset_type: "foreign" as const,
      symbol,
      name,
      exchange,
      currency: "USD",
      category: etf ? ("etf" as const) : ("hisse" as const),
      source: "nasdaq",
      sort_rank: 10_000 + i,
    }));
}

/** Gömülü (gzip + base64) anlık görüntüyü açar; yalnızca gerektiğinde yüklenir */
const defaultLoadUsSnapshot: LoadUsSnapshot = async () => {
  const [{ US_SYMBOLS_SNAPSHOT_GZ }, { gunzipSync }] = await Promise.all([import("./data/usSymbolsSnapshot"), import("node:zlib")]);
  return JSON.parse(gunzipSync(Buffer.from(US_SYMBOLS_SNAPSHOT_GZ, "base64")).toString("utf8")) as UsSnapshot;
};

// ---- Borsa İstanbul tüm hisseler (İş Yatırım) ----------------------------------------------------

const HTML_ENTITIES: Record<string, string> = { amp: "&", quot: '"', apos: "'", lt: "<", gt: ">", nbsp: " " };
function decodeHtml(s: string): string {
  return s.replace(/&(#\d+|#x[0-9a-f]+|[a-z]+);/gi, (m, e: string) =>
    e[0] === "#" ? String.fromCodePoint(e[1] === "x" || e[1] === "X" ? parseInt(e.slice(2), 16) : Number(e.slice(1))) : (HTML_ENTITIES[e.toLowerCase()] ?? m),
  );
}

/**
 * "Temel Değerler ve Oranlar" sayfasındaki tablo → BIST hisse satırları (piyasa değerine göre sıralı).
 * Satır: kod | ad | sektör | kapanış | piyasa değeri (mn TL) | … Statik listedekiler (`skip`) atlanır. Saf fonksiyon.
 */
export function parseIsYatirimStocks(html: string, skip: ReadonlySet<string> = new Set()): CatalogRow[] {
  const re = /<tr><td><a href="[^"]*sirket-karti\.aspx\?hisse=([A-Z0-9]{2,10})">[^<]*<\/a><\/td><td>([^<]*)<\/td><td>([^<]*)<\/td><td[^>]*>[^<]*<\/td><td[^>]*>([^<]*)<\/td>/g;
  const out = new Map<string, { name: string; cap: number }>();
  for (const m of html.matchAll(re)) {
    const symbol = m[1];
    if (out.has(symbol) || skip.has(symbol)) continue;
    const cap = Number(m[4].trim().replace(/\./g, "").replace(",", "."));
    out.set(symbol, { name: decodeHtml(m[2]).replace(/\s+/g, " ").trim() || symbol, cap: Number.isFinite(cap) ? cap : 0 });
  }
  return [...out.entries()]
    .sort((a, b) => b[1].cap - a[1].cap || (a[0] < b[0] ? -1 : 1))
    .map(([symbol, r], i) => ({
      asset_type: "bist" as const,
      symbol,
      name: r.name.slice(0, 120),
      exchange: "Borsa İstanbul",
      currency: "TRY",
      category: "bist" as const,
      source: "isyatirim",
      sort_rank: 10_000 + i,
    }));
}

export async function fetchBistCatalog(skip: ReadonlySet<string>, fetchText: FetchText = defaultFetchText): Promise<CatalogRow[]> {
  const rows = parseIsYatirimStocks(await fetchText(ISYATIRIM_STOCKS), skip);
  if (rows.length < MIN_ROWS.isyatirim) throw new Error(`BIST hisse listesi eksik geldi (${rows.length})`);
  return rows;
}

// ---- Yazma ------------------------------------------------------------------------------

const COLS = "asset_type, symbol, name, exchange, currency, category, source, sort_rank, search, updated_at";

async function upsertRows(rows: CatalogRow[], now: string) {
  if (rows.length === 0) return;
  const db = await getDb();
  const valid = rows.filter((r) => isValidSymbol(r.asset_type, r.symbol));
  for (let i = 0; i < valid.length; i += 200) {
    const chunk = valid.slice(i, i + 200);
    const params = chunk.flatMap((r) => [r.asset_type, r.symbol, r.name, r.exchange, r.currency, r.category, r.source, r.sort_rank, searchKey(`${r.symbol} ${r.name}`), now]);
    await db.run(
      `INSERT INTO symbol_catalog (${COLS}) VALUES ${chunk.map(() => "(?, ?, ?, ?, ?, ?, ?, ?, ?, ?)").join(", ")}
       ON CONFLICT (asset_type, symbol) DO UPDATE SET name = excluded.name, exchange = excluded.exchange, currency = excluded.currency,
         category = excluded.category, source = excluded.source, sort_rank = excluded.sort_rank, search = excluded.search, updated_at = excluded.updated_at`,
      params,
    );
  }
}

/** Kaynağın bu yenilemede gelmeyen (listeden çıkmış) satırlarını siler */
async function pruneSource(source: string, now: string) {
  await (await getDb()).run("DELETE FROM symbol_catalog WHERE source = ? AND updated_at < ?", [source, now]);
}

export interface CatalogRefreshResult {
  binance: number | string;
  btcturk: number | string;
  /** TEFAS fon türü başına satır sayısı ya da hata metni */
  tefas: Record<FundKind, number | string>;
  nasdaq: number | string;
  /** ABD listesi ağdan alınamayıp gömülü anlık görüntüden yazıldıysa görüntünün tarihi (ISO) */
  usSnapshot?: string;
  bist: number | string;
  static: number;
  total: number;
}

/** Bir kaynağı çekip yazar ve listeden çıkanları budar; hata verirse eski satırlar korunur (hata metni döner). */
async function refreshSource(label: string, source: string, load: () => Promise<CatalogRow[]>, now: string): Promise<number | string> {
  try {
    const rows = await load();
    await (await getDb()).tx(async () => {
      await upsertRows(rows, now);
      await pruneSource(source, now);
    });
    return rows.length;
  } catch (err) {
    console.warn(`[katalog] ${label}:`, (err as Error).message);
    return `hata: ${(err as Error).message}`;
  }
}

/** funds tablosundaki (daha önce doğrulanmış) fonlardan katalogda olmayanlar: TEFAS listesi satırlarını ezmez */
async function addKnownFunds(now: string) {
  const db = await getDb();
  const rows = await db.all<{ code: string; name: string | null }>(
    "SELECT code, name FROM funds WHERE code NOT IN (SELECT symbol FROM symbol_catalog WHERE asset_type = 'fund')",
  );
  for (const r of rows) {
    if (!isValidSymbol("fund", r.code)) continue;
    await db.run(
      `INSERT INTO symbol_catalog (${COLS}) VALUES ('fund', ?, ?, 'TEFAS', 'TRY', 'fon', ?, 90000, ?, ?) ON CONFLICT (asset_type, symbol) DO NOTHING`,
      [r.code, r.name ?? r.code, KNOWN_FUND_SOURCE, searchKey(`${r.code} ${r.name ?? ""}`), now],
    );
  }
}

/** Statik listedeki semboller (tam listeler bunları atlar: derlenmiş ad ve sıra korunur) */
function staticSymbols(rows: CatalogRow[], assetType: AssetType): Set<string> {
  return new Set(rows.filter((r) => r.asset_type === assetType).map((r) => r.symbol));
}

/**
 * Kataloğu yeniler: statik liste + Binance + BtcTurk + TEFAS fonları + ABD hisse/ETF + BIST hisseleri.
 * Bir kaynak hata verirse o kaynağın eski satırları korunur (sonuçta hata metni döner).
 * fetchJson / fetchText / fetchFtp testlerde sahte HTTP / FTP için verilir.
 */
export async function refreshCatalog(
  opts: { fetchJson?: FetchJson; fetchText?: FetchText; fetchFtp?: FetchFtp; loadUsSnapshot?: LoadUsSnapshot } = {},
): Promise<CatalogRefreshResult> {
  const fetchJson = opts.fetchJson ?? defaultFetchJson;
  const fetchText = opts.fetchText ?? defaultFetchText;
  const fetchFtp = opts.fetchFtp ?? defaultFetchFtp;
  const now = sqlNow();
  const st = staticRows();
  await (await getDb()).tx(async () => {
    await upsertRows(st, now);
    await pruneSource("static", now);
  });

  let names = new Map<string, string>();
  let btcturk: number | string;
  try {
    const bt = await fetchBtcTurkCatalog(fetchJson);
    names = bt.names;
    await (await getDb()).tx(async () => {
      await upsertRows(bt.rows, now);
      await pruneSource("btcturk", now);
    });
    btcturk = bt.rows.length;
  } catch (err) {
    btcturk = `hata: ${(err as Error).message}`;
    console.warn("[katalog] BtcTurk:", (err as Error).message);
  }

  let binance: number | string;
  try {
    const rows = await fetchBinanceCatalog(names, fetchJson);
    await (await getDb()).tx(async () => {
      await upsertRows(rows, now);
      await pruneSource("binance", now);
    });
    binance = rows.length;
  } catch (err) {
    binance = `hata: ${(err as Error).message}`;
    console.warn("[katalog] Binance:", (err as Error).message);
  }

  const tefas = {} as Record<FundKind, number | string>;
  for (const kind of FUND_KINDS) tefas[kind] = await refreshSource(`TEFAS ${kind}`, fundSource(kind), () => fetchTefasCatalog(kind, fetchJson), now);
  try {
    await addKnownFunds(now);
  } catch (err) {
    console.warn("[katalog] bilinen fonlar:", (err as Error).message);
  }
  let nasdaq = await refreshSource("Nasdaq", "nasdaq", () => fetchUsCatalog(staticSymbols(st, "foreign"), fetchText, fetchFtp), now);
  let usSnapshot: string | undefined;
  if (typeof nasdaq === "string") {
    // Ağ kaynaklarının hiçbiri olmadı: katalogda ABD listesi yoksa (ya da eksikse) gömülü anlık görüntü
    // yazılır (eski ama dolu liste); varsa mevcut satırlar korunur. Ertesi gün ağdan yeniden denenir.
    const have = await (await getDb()).get<{ c: number }>("SELECT COUNT(*) AS c FROM symbol_catalog WHERE source = 'nasdaq'");
    if (Number(have?.c ?? 0) < MIN_ROWS.nasdaq) {
      try {
        const snap = await (opts.loadUsSnapshot ?? defaultLoadUsSnapshot)();
        if (snap) {
          const networkError = nasdaq;
          const n = await refreshSource("Nasdaq (anlık görüntü)", "nasdaq", async () => usSnapshotRows(snap, staticSymbols(st, "foreign")), now);
          if (typeof n === "number") {
            console.warn(`[katalog] ABD listesi ağdan alınamadı, gömülü anlık görüntü (${snap.generatedAt.slice(0, 10)}) yazıldı: ${networkError}`);
            nasdaq = n;
            usSnapshot = snap.generatedAt;
          }
        }
      } catch (err) {
        console.warn("[katalog] ABD anlık görüntüsü:", (err as Error).message);
      }
    }
  }
  const bist = await refreshSource("BIST", "isyatirim", () => fetchBistCatalog(staticSymbols(st, "bist"), fetchText), now);

  const total = (await (await getDb()).get<{ c: number }>("SELECT COUNT(*) AS c FROM symbol_catalog"))?.c ?? 0;
  gc.__yatirimCatalogAt = Date.now();
  return { binance, btcturk, tefas, nasdaq, ...(usSnapshot ? { usSnapshot } : {}), bist, static: st.length, total: Number(total) };
}

/** Yenileme sonucunun kısa özeti (nöbet / zamanlayıcı günlüğü) */
export function refreshSummary(r: CatalogRefreshResult): string {
  const short = (v: number | string) => (typeof v === "number" ? String(v) : "hata");
  return `Binance ${short(r.binance)}, BtcTurk ${short(r.btcturk)}, TEFAS ${FUND_KINDS.map((k) => `${k} ${short(r.tefas[k])}`).join("/")}, ABD ${short(r.nasdaq)}${r.usSnapshot ? ` (yedek liste ${r.usSnapshot.slice(0, 10)})` : ""}, BIST ${short(r.bist)}, toplam ${r.total}`;
}

// ---- Tembel doldurma ------------------------------------------------------------------------

const gc = globalThis as unknown as { __yatirimCatalogAt?: number; __yatirimCatalogJob?: Promise<unknown> | null };

/** Katalog hiç doldurulmamışsa (ya da kripto kısmı boşsa) doldurur; eşzamanlı çağrılar tek işi bekler. */
export async function ensureCatalog(opts: { waitMs?: number } = {}): Promise<void> {
  if (gc.__yatirimCatalogAt && Date.now() - gc.__yatirimCatalogAt < 10 * 60_000) return;
  const db = await getDb();
  const crypto = await db.get<{ c: number; u: string | null }>("SELECT COUNT(*) AS c, MAX(updated_at) AS u FROM symbol_catalog WHERE category = 'kripto'");
  const statics = await db.get<{ c: number }>("SELECT COUNT(*) AS c FROM symbol_catalog WHERE source = 'static'");
  const funds = await db.get<{ c: number }>("SELECT COUNT(*) AS c FROM symbol_catalog WHERE category = 'fon'");
  const fresh = Number(crypto?.c ?? 0) > 0 && Number(statics?.c ?? 0) > 0 && Number(funds?.c ?? 0) > 0;
  if (fresh) {
    gc.__yatirimCatalogAt = Date.now();
    return;
  }
  // Statik kısım ağ gerektirmez: hemen yaz (liste boş görünmesin)
  if (Number(statics?.c ?? 0) === 0) await upsertRows(staticRows(), sqlNow());
  if (!gc.__yatirimCatalogJob) {
    // Sunucusuz ortamda yanıttan sonra da bitsin diye arka plan işi olarak izlenir (background.ts)
    const job = detached(() => refreshCatalog())
      .catch((err) => console.error("[katalog] doldurulamadı", err))
      .finally(() => {
        gc.__yatirimCatalogJob = null;
      });
    gc.__yatirimCatalogJob = job;
    background(job);
  }
  // Zaman aşımlı bekleme: kaynak yavaşsa liste statik kısımla döner
  if (opts.waitMs) await Promise.race([gc.__yatirimCatalogJob, new Promise((r) => setTimeout(r, opts.waitMs))]);
}

/** Düzenli yenilenen kaynaklar (biri hiç yoksa — örn. yeni eklenen kaynak — beklemeden yenilenir) */
const REFRESHED_SOURCES = ["binance", "btcturk", "static", ...FUND_KINDS.map(fundSource), "nasdaq", "isyatirim"];

/** Günlük yenileme (nöbet / yerel zamanlayıcı): son yenileme 24 saatten eskiyse ya da bir kaynağın hiç satırı yoksa */
export async function maybeRefreshCatalog(): Promise<CatalogRefreshResult | null> {
  const rows = await (await getDb()).all<{ source: string; u: string | null }>(
    `SELECT source, MIN(updated_at) AS u FROM symbol_catalog WHERE source IN (${REFRESHED_SOURCES.map(() => "?").join(", ")}) GROUP BY source`,
    REFRESHED_SOURCES,
  );
  const missing = REFRESHED_SOURCES.some((s) => !rows.some((r) => r.source === s));
  const last = rows.reduce((min, r) => Math.min(min, r.u ? Date.parse(`${r.u.replace(" ", "T")}Z`) : 0), Infinity);
  const recent = Number.isFinite(last) && last > 0 && Date.now() - last < CATALOG_MAX_AGE_MS - 5 * 60_000;
  // Sürekli hata veren kaynak yüzünden her saat tam yenileme yapılmasın: bu süreçte 6 saatte en fazla bir
  if (recent && (!missing || Date.now() - (gc.__yatirimCatalogAt ?? 0) < 6 * 3600_000)) return null;
  return await refreshCatalog();
}

/** Yahoo aramasında bulunan yabancı sembolü kataloğa ekler (statik satırların üzerine yazmaz). */
export async function rememberSearchHit(r: { assetType: AssetType; symbol: string; name: string; exchange: string; currency: string; category: CatalogCategory }) {
  if (r.assetType !== "foreign" && r.assetType !== "bist") return;
  if (!isValidSymbol(r.assetType, r.symbol)) return;
  try {
    await (await getDb()).run(
      `INSERT INTO symbol_catalog (${COLS}) VALUES (?, ?, ?, ?, ?, ?, 'yahoo', 500000, ?, ?) ON CONFLICT (asset_type, symbol) DO NOTHING`,
      [r.assetType, r.symbol, r.name.slice(0, 120), r.exchange.slice(0, 60), r.currency, r.category, searchKey(`${r.symbol} ${r.name}`), sqlNow()],
    );
  } catch {
    // katalog yazılamasa da arama sonucu döner
  }
}

// ---- Okuma ------------------------------------------------------------------------------

export interface CatalogPage {
  items: CatalogItem[];
  total: number;
  page: number;
  pageSize: number;
}

/** LIKE özel karakterlerini kaçırır */
function likeEscape(s: string) {
  return s.replace(/[\\%_]/g, (c) => `\\${c}`);
}

/**
 * Bir piyasa listesinin sayfası. Kripto için borsa/kotasyon süzgeci (venue): "binance-usdt",
 * "binance-try", "btcturk". Fonlar için tür süzgeci (fundKind): "yat", "emk", "byf".
 */
export async function listCatalog(
  category: CatalogCategory,
  opts: { q?: string; venue?: string; fundKind?: string; page?: number; pageSize?: number } = {},
): Promise<CatalogPage> {
  const pageSize = Math.min(Math.max(opts.pageSize ?? 30, 5), 50);
  const page = Math.max(0, Math.floor(opts.page ?? 0));
  const q = searchKey((opts.q ?? "").replaceAll("/", "-")).slice(0, 40);
  const db = await getDb();

  await ensureCatalog({ waitMs: 15_000 });
  const where = ["category = ?"];
  const params: (string | number)[] = [category];
  if (q) {
    where.push("search LIKE ? ESCAPE '\\'");
    params.push(`%${likeEscape(q)}%`);
  }
  if (category === "kripto" && opts.venue) {
    if (opts.venue === "binance-usdt") where.push("source = 'binance' AND currency = 'USD'");
    else if (opts.venue === "binance-try") where.push("source = 'binance' AND currency = 'TRY'");
    else if (opts.venue === "btcturk") where.push("source = 'btcturk'");
  }
  const kind = FUND_KINDS.find((k) => k.toLowerCase() === opts.fundKind?.toLowerCase());
  if (category === "fon" && kind) {
    where.push("source = ?");
    params.push(fundSource(kind));
  }
  const w = where.join(" AND ");
  const total = Number((await db.get<{ c: number }>(`SELECT COUNT(*) AS c FROM symbol_catalog WHERE ${w}`, params))?.c ?? 0);
  // Aramada tam sembol eşleşmesi önce
  const order = q ? "CASE WHEN search LIKE ? ESCAPE '\\' THEN 0 ELSE 1 END, sort_rank, symbol" : "sort_rank, symbol";
  const rows = await db.all<CatalogRow>(
    `SELECT asset_type, symbol, name, exchange, currency, category FROM symbol_catalog WHERE ${w} ORDER BY ${order} LIMIT ? OFFSET ?`,
    [...params, ...(q ? [`${likeEscape(q)} %`] : []), pageSize, page * pageSize],
  );
  return { items: rows.map(toItem), total, page, pageSize };
}

/** Arama için katalog eşleşmeleri (sembolün başı ya da adın içinde). Kategori başına en fazla `perCategory`. */
export async function searchCatalog(query: string, perCategory = 15): Promise<CatalogItem[]> {
  const q = searchKey(query.replaceAll("/", "-")).slice(0, 40);
  if (!q) return [];
  // İlk aramada katalog boşsa kısa süre doldurulmasını bekle
  await ensureCatalog({ waitMs: 8_000 });
  const db = await getDb();
  const rows = await db.all<CatalogRow>(
    `SELECT asset_type, symbol, name, exchange, currency, category, sort_rank FROM symbol_catalog
     WHERE search LIKE ? ESCAPE '\\' ORDER BY CASE WHEN search LIKE ? ESCAPE '\\' THEN 0 WHEN search LIKE ? ESCAPE '\\' THEN 1 ELSE 2 END, sort_rank, symbol LIMIT 400`,
    [`%${likeEscape(q)}%`, `${likeEscape(q)} %`, `${likeEscape(q)}%`],
  );
  const count = new Map<string, number>();
  const out: CatalogItem[] = [];
  for (const r of rows) {
    const n = count.get(r.category) ?? 0;
    if (n >= perCategory) continue;
    count.set(r.category, n + 1);
    out.push(toItem(r));
  }
  return out;
}

/** Tek sembolün katalog kaydı (ad, borsa, kategori); yoksa null */
export async function catalogEntry(assetType: AssetType, symbol: string): Promise<CatalogItem | null> {
  try {
    const r = await (await getDb()).get<CatalogRow>("SELECT asset_type, symbol, name, exchange, currency, category FROM symbol_catalog WHERE asset_type = ? AND symbol = ?", [assetType, symbol]);
    return r ? toItem(r) : null;
  } catch {
    return null;
  }
}

/** Sembolün piyasa listesi: katalogdaki kategori, yoksa türden tahmin */
export async function categoryOf(assetType: AssetType, symbol: string): Promise<CatalogCategory> {
  return (await catalogEntry(assetType, symbol))?.category ?? defaultCategory(assetType, symbol);
}
