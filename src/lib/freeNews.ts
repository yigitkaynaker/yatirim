import "server-only";
import { getDb } from "./db";
import { cryptoBase, goldKind, instrumentId, type AssetType } from "./assets";
import { politeFetch } from "./http";
import { dedupeHeadlines, parseRss, type Headline } from "./rssParse";

// ÜCRETSİZ HABER BAŞLIKLARI (RSS)
// Google Haberler (Türkçe arama, son 1 gün) ve yabancı hisse / kripto için Yahoo
// Finance beslemesi. Kimlik doğrulama yok; varlık başına 20 dk önbellek (bellek +
// ext_cache tablosu), aynı başlık tekilleştirilir. Kaynak yanıt vermezse son bilinen
// başlıklar "eski" olarak döner, hiç yoksa boş liste (hata fırlatılmaz).
// Bu başlıklar hem varlık sayfalarında "Son haberler" olarak (yapay zeka olmadan)
// gösterilir hem de haber analizine ücretli web aramasından ÖNCE bağlam olarak verilir.

export type { Headline } from "./rssParse";

export const RSS_TTL_MS = 20 * 60_000;

export interface HeadlineSet {
  instrument: string;
  items: Headline[];
  fetchedAt: number | null;
  stale: boolean;
}

const CRYPTO_NAMES: Record<string, string> = {
  BTC: "Bitcoin",
  ETH: "Ethereum",
  SOL: "Solana",
  XRP: "XRP Ripple",
  BNB: "BNB Binance Coin",
  ADA: "Cardano",
  DOGE: "Dogecoin",
  AVAX: "Avalanche kripto",
};
const FX_NAMES: Record<string, string> = { USD: "dolar kuru", EUR: "euro kuru", GBP: "sterlin kuru", CHF: "frank kuru", JPY: "yen kuru" };

/** Google Haberler arama ifadesi */
export function rssQuery(type: AssetType, symbol: string, name?: string | null): string {
  switch (type) {
    case "bist":
      return symbol === "XU100" ? "Borsa İstanbul BIST 100" : `${symbol} hisse`;
    case "foreign":
      return name && name.length < 40 ? `${symbol} ${name}` : symbol;
    case "crypto":
      return CRYPTO_NAMES[cryptoBase(symbol)] ?? `${cryptoBase(symbol)} kripto`;
    case "fx":
      return FX_NAMES[symbol] ?? `${symbol} TL kur`;
    case "gold":
      return symbol === "GRAM" ? "gram altın fiyatı" : `${(goldKind(symbol)?.label ?? "altın").toLocaleLowerCase("tr-TR")} fiyatı`;
    case "fund":
      return name ? `${name}` : `${symbol} fon TEFAS`;
  }
}

function googleUrl(q: string) {
  return `https://news.google.com/rss/search?q=${encodeURIComponent(`${q} when:1d`).replace(/%20/g, "+")}&hl=tr&gl=TR&ceid=TR:tr`;
}

/** Yahoo yalnızca yabancı hisse ve kriptoda (BIST için gürültülü) */
function yahooUrl(type: AssetType, symbol: string): string | null {
  if (type === "foreign" && !symbol.startsWith("^")) return `https://feeds.finance.yahoo.com/rss/2.0/headline?s=${encodeURIComponent(symbol)}&region=US&lang=en-US`;
  if (type === "crypto") return `https://feeds.finance.yahoo.com/rss/2.0/headline?s=${encodeURIComponent(`${cryptoBase(symbol)}-USD`)}&region=US&lang=en-US`;
  return null;
}

// ---- Önbellek ------------------------------------------------------------------------

const g = globalThis as unknown as { __yatirimRss?: Map<string, { at: number; items: Headline[] }>; __yatirimRssInflight?: Map<string, Promise<HeadlineSet>> };
const mem = () => (g.__yatirimRss ??= new Map());
const inflight = () => (g.__yatirimRssInflight ??= new Map());

async function loadCached(key: string): Promise<{ at: number; items: Headline[] } | null> {
  const m = mem().get(key);
  if (m) return m;
  try {
    const row = await (await getDb()).get("SELECT value, fetched_at FROM ext_cache WHERE key = ?", [`rss:${key}`]) as { value: string; fetched_at: number } | undefined;
    if (!row) return null;
    const e = { at: row.fetched_at, items: JSON.parse(row.value) as Headline[] };
    mem().set(key, e);
    return e;
  } catch {
    return null;
  }
}

async function saveCached(key: string, items: Headline[], at: number) {
  mem().set(key, { at, items });
  try {
    await (await getDb()).run(`INSERT INTO ext_cache (key, value, fetched_at) VALUES (?, ?, ?)
         ON CONFLICT(key) DO UPDATE SET value = excluded.value, fetched_at = excluded.fetched_at`, [`rss:${key}`, JSON.stringify(items), at]);
  } catch {
    // önbellek yazılamadıysa yalnızca bellekte kalır
  }
}

/** Yalnızca önbellekteki başlıklar (ağ yok). Günlük özet gibi ücretsiz/çevrimdışı kullanım için. */
export async function cachedHeadlines(type: AssetType, symbol: string): Promise<HeadlineSet> {
  const id = instrumentId(type, symbol);
  const c = await loadCached(id);
  return { instrument: id, items: c?.items ?? [], fetchedAt: c?.at ?? null, stale: !c || Date.now() - c.at > RSS_TTL_MS };
}

/**
 * Bir varlığın son haber başlıkları (en fazla `limit`, en yeni önce). 20 dk önbellekli.
 * Hata fırlatmaz.
 */
export async function getHeadlines(type: AssetType, symbol: string, opts: { name?: string | null; force?: boolean; limit?: number } = {}): Promise<HeadlineSet> {
  const id = instrumentId(type, symbol);
  const limit = opts.limit ?? 12;
  const cached = await loadCached(id);
  if (!opts.force && cached && Date.now() - cached.at < RSS_TTL_MS) {
    return { instrument: id, items: cached.items.slice(0, limit), fetchedAt: cached.at, stale: false };
  }
  const running = inflight().get(id);
  if (running) return running;
  const job = (async (): Promise<HeadlineSet> => {
    const urls: { provider: string; url: string; feed: string }[] = [{ provider: "Google Haberler", url: googleUrl(rssQuery(type, symbol, opts.name)), feed: "Google Haberler" }];
    const y = yahooUrl(type, symbol);
    if (y) urls.push({ provider: "Yahoo RSS", url: y, feed: "Yahoo Finance" });
    const results = await Promise.allSettled(urls.map((u) => politeFetch(u.provider, u.url, { xml: true, timeoutMs: 8_000, backoffBaseMs: 60_000 }).then((t) => parseRss(t, u.feed))));
    const ok = results.filter((r): r is PromiseFulfilledResult<Headline[]> => r.status === "fulfilled");
    if (ok.length === 0) {
      return { instrument: id, items: (cached?.items ?? []).slice(0, limit), fetchedAt: cached?.at ?? null, stale: true };
    }
    // Son 3 günün haberleri (Yahoo beslemesi eski haber de içerebilir)
    const since = Date.now() - 3 * 86_400_000;
    const items = dedupeHeadlines(
      ok.flatMap((r) => r.value).filter((h) => h.publishedAt == null || h.publishedAt >= since),
      30,
    );
    const at = Date.now();
    await saveCached(id, items, at);
    return { instrument: id, items: items.slice(0, limit), fetchedAt: at, stale: false };
  })().finally(() => inflight().delete(id));
  inflight().set(id, job);
  return job;
}

/** Sınırlı eşzamanlılıkla birçok varlığın başlıkları (haber taraması için). Hata fırlatmaz. */
export async function headlinesFor(assets: { assetType: AssetType; symbol: string; name?: string | null }[], timeoutMs = 15_000): Promise<Map<string, Headline[]>> {
  const out = new Map<string, Headline[]>();
  let next = 0;
  const worker = async () => {
    while (next < assets.length) {
      const a = assets[next++];
      const set = await getHeadlines(a.assetType, a.symbol, { name: a.name, limit: 6 });
      if (set.items.length) out.set(set.instrument, set.items);
    }
  };
  await Promise.race([Promise.all(Array.from({ length: Math.min(3, assets.length) }, worker)), new Promise((r) => setTimeout(r, timeoutMs).unref?.())]);
  return out;
}

/** İstem satırı: "20.11 15:40 · Başlık — Yayıncı (bağlantı)" */
export function headlineLine(h: Headline): string {
  const when = h.publishedAt
    ? new Date(h.publishedAt).toLocaleString("tr-TR", { timeZone: "Europe/Istanbul", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })
    : "?";
  return `${when} · ${h.title}${h.publisher ? ` — ${h.publisher}` : ""} (${h.url})`;
}
