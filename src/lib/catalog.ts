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

// Sembol kataloğu (symbol_catalog tablosu; paylaşımlı, kullanıcıya özel değil). Piyasa sayfasındaki
// ayrı listeler (Kripto, BIST, ABD Hisseleri, ETF, Endeksler, Emtia, Döviz, Altın, Fonlar) ve arama
// buradan okunur. Kaynaklar:
//   - Binance Spot: /api/v3/exchangeInfo (TRADING durumundaki USDT ve TRY pariteleri; ağırlık 20) ve
//     sıralama için /api/v3/ticker/24hr?type=MINI (sembolsüz; ağırlık 80) — günde bir kez.
//   - BtcTurk: /api/v2/server/exchangeinfo (TRY ve USDT çiftleri ve coin adları; tek istek).
//   - Derlenmiş statik liste (catalogData.ts) + altın türleri; Yahoo aramasında bulunan yabancı
//     semboller de (kategori etiketiyle) eklenir. Fonlar funds tablosundan okunur.
// Yenileme: yavaş nöbet görevi ("katalog", günde bir) ve yerel zamanlayıcı; katalog boşsa ilk
// listede tembel doldurma. Bir kaynak hata verirse o kaynağın eski satırları korunur.

const FETCH_TIMEOUT_MS = 20_000;
const BINANCE_BASES = ["https://api.binance.com", "https://data-api.binance.vision"];
const BTCTURK_EXCHANGEINFO = "https://api.btcturk.com/api/v2/server/exchangeinfo";
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

type FetchJson = (url: string) => Promise<unknown>;

async function defaultFetchJson(url: string): Promise<unknown> {
  const res = await fetch(url, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS), cache: "no-store" });
  if (!res.ok) throw Object.assign(new Error(`HTTP ${res.status}`), { status: res.status });
  return await res.json();
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
  static: number;
  total: number;
}

/**
 * Kataloğu yeniler: statik liste + Binance + BtcTurk. Bir kaynak hata verirse o kaynağın eski
 * satırları korunur (sonuçta hata metni döner). fetchJson testlerde sahte HTTP için verilir.
 */
export async function refreshCatalog(opts: { fetchJson?: FetchJson } = {}): Promise<CatalogRefreshResult> {
  const fetchJson = opts.fetchJson ?? defaultFetchJson;
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

  const total = (await (await getDb()).get<{ c: number }>("SELECT COUNT(*) AS c FROM symbol_catalog"))?.c ?? 0;
  gc.__yatirimCatalogAt = Date.now();
  return { binance, btcturk, static: st.length, total: Number(total) };
}

// ---- Tembel doldurma ------------------------------------------------------------------------

const gc = globalThis as unknown as { __yatirimCatalogAt?: number; __yatirimCatalogJob?: Promise<unknown> | null };

/** Katalog hiç doldurulmamışsa (ya da kripto kısmı boşsa) doldurur; eşzamanlı çağrılar tek işi bekler. */
export async function ensureCatalog(opts: { waitMs?: number } = {}): Promise<void> {
  if (gc.__yatirimCatalogAt && Date.now() - gc.__yatirimCatalogAt < 10 * 60_000) return;
  const db = await getDb();
  const crypto = await db.get<{ c: number; u: string | null }>("SELECT COUNT(*) AS c, MAX(updated_at) AS u FROM symbol_catalog WHERE category = 'kripto'");
  const statics = await db.get<{ c: number }>("SELECT COUNT(*) AS c FROM symbol_catalog WHERE source = 'static'");
  const fresh = Number(crypto?.c ?? 0) > 0 && Number(statics?.c ?? 0) > 0;
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

/** Günlük yenileme (nöbet / yerel zamanlayıcı): son yenileme 24 saatten eskiyse */
export async function maybeRefreshCatalog(): Promise<CatalogRefreshResult | null> {
  const row = await (await getDb()).get<{ u: string | null }>("SELECT MIN(updated_at) AS u FROM symbol_catalog WHERE source IN ('binance', 'btcturk', 'static')");
  const last = row?.u ? Date.parse(`${row.u.replace(" ", "T")}Z`) : 0;
  if (last && Date.now() - last < CATALOG_MAX_AGE_MS - 5 * 60_000) return null;
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
 * Bir piyasa listesinin sayfası. Kripto için borsa/kotasyon süzgeci: "binance-usdt", "binance-try",
 * "btcturk". Fonlar funds tablosundan (daha önce doğrulanmış fonlar) okunur.
 */
export async function listCatalog(category: CatalogCategory, opts: { q?: string; venue?: string; page?: number; pageSize?: number } = {}): Promise<CatalogPage> {
  const pageSize = Math.min(Math.max(opts.pageSize ?? 30, 5), 50);
  const page = Math.max(0, Math.floor(opts.page ?? 0));
  const q = searchKey((opts.q ?? "").replaceAll("/", "-")).slice(0, 40);
  const db = await getDb();

  if (category === "fon") {
    const rows = await db.all<{ code: string; name: string | null }>("SELECT code, name FROM funds ORDER BY code");
    const filtered = rows.filter((r) => !q || searchKey(`${r.code} ${r.name ?? ""}`).includes(q));
    return {
      items: filtered.slice(page * pageSize, (page + 1) * pageSize).map((r) => ({
        instrument: instrumentId("fund", r.code),
        assetType: "fund" as const,
        symbol: r.code,
        name: r.name ?? r.code,
        exchange: "TEFAS",
        currency: "TRY",
        category: "fon" as const,
      })),
      total: filtered.length,
      page,
      pageSize,
    };
  }

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
