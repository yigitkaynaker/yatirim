// Binance'in spot listesinde olmayan coinleri için saf ayrıştırma işlevleri (katalog, fiyat ve grafik
// aynı kuralları kullansın diye tek yerde; ağ kullanmaz, testlerde doğrudan çağrılır):
//   - Vadeli (USDⓈ-M sürekli kontrat): fapi.binance.com /fapi/v1/exchangeInfo ve /fapi/v1/ticker/24hr.
//     Çok ucuz coinlerin kontratı çarpanlıdır: 1000PEPEUSDT = 1000 PEPE, 1MBABYDOGEUSDT = 1.000.000
//     BABYDOGE. Uygulamada coin adı çarpansız (RATS@BINANCE-F) saklanır ve fiyat 1 coin içindir
//     (kontrat fiyatı / çarpan). 1INCH gibi rakamla başlayan gerçek adlar çarpan sayılmaz.
//   - Alpha (erken aşama zincir üstü tokenlar): www.binance.com/bapi/defi herkese açık token listesi
//     (fiyat ve 24 saatlik değişim listenin içinde) ve alpha-trade/klines (ALPHA_<id>USDT).
//     Aynı sembolü taşıyan birden çok token olabilir: en yüksek 24 saatlik hacimli olan seçilir.
//     Tokenlaştırılmış hisseler (Ondo vb.; stockState / rwaInfo) ve kapanmış tokenlar alınmaz.

export const VALID_COIN = /^[A-Z0-9]{1,15}$/;

/** Kontrat adındaki çarpan önekleri (uzundan kısaya) */
const MULTIPLIERS: readonly (readonly [string, number])[] = [
  ["1000000", 1_000_000],
  ["100000", 100_000],
  ["10000", 10_000],
  ["1000", 1_000],
  ["1M", 1_000_000],
];

/** "1000PEPE" → { coin: "PEPE", mult: 1000 }; "1INCH" → { coin: "1INCH", mult: 1 }. Önekten sonra en az iki harf gerekir. */
export function splitMultiplier(asset: string): { coin: string; mult: number } {
  for (const [p, m] of MULTIPLIERS) {
    if (asset.startsWith(p) && /^[A-Z][A-Z0-9]+$/.test(asset.slice(p.length))) return { coin: asset.slice(p.length), mult: m };
  }
  return { coin: asset, mult: 1 };
}

export interface FuturesContract {
  /** Çarpansız coin adı (RATS) */
  coin: string;
  /** Kontratın taban varlığı (1000RATS) */
  base: string;
  /** Binance kontrat sembolü (1000RATSUSDT) */
  pair: string;
  mult: number;
  quote: "USDT" | "USDC";
}

/** Aynı coinin birden çok kontratı varsa: USDT, sonra çarpansız olan */
function better(a: FuturesContract, b: FuturesContract): FuturesContract {
  if (a.quote !== b.quote) return a.quote === "USDT" ? a : b;
  if (a.mult !== b.mult) return a.mult < b.mult ? a : b;
  return a.pair <= b.pair ? a : b;
}

interface FuturesSymbolInfo {
  symbol?: string;
  status?: string;
  contractType?: string;
  baseAsset?: string;
  quoteAsset?: string;
  underlyingType?: string;
}

/**
 * fapi exchangeInfo → coin başına tek sürekli kontrat (TRADING, PERPETUAL, USDT/USDC; endeks
 * kontratları — BTCDOM vb. — hariç). `raw`: süzgeçten geçen kontrat sayısı (yanıt sağlamlık denetimi).
 */
export function parseFuturesExchangeInfo(body: unknown): { contracts: Map<string, FuturesContract>; raw: number } {
  const list = (body as { symbols?: unknown } | null)?.symbols;
  const contracts = new Map<string, FuturesContract>();
  let raw = 0;
  for (const s of Array.isArray(list) ? (list as FuturesSymbolInfo[]) : []) {
    if (!s || s.status !== "TRADING" || s.contractType !== "PERPETUAL" || s.underlyingType === "INDEX") continue;
    if ((s.quoteAsset !== "USDT" && s.quoteAsset !== "USDC") || typeof s.baseAsset !== "string" || typeof s.symbol !== "string") continue;
    raw++;
    if (!VALID_COIN.test(s.baseAsset)) continue;
    const { coin, mult } = splitMultiplier(s.baseAsset);
    const c: FuturesContract = { coin, base: s.baseAsset, pair: s.symbol, mult, quote: s.quoteAsset };
    const prev = contracts.get(coin);
    contracts.set(coin, prev ? better(prev, c) : c);
  }
  return { contracts, raw };
}

export interface FuturesQuote extends FuturesContract {
  /** 1 coin fiyatı (kontrat fiyatı / çarpan) */
  price: number;
  changePct: number | null;
  closeTime: number | null;
  /** 24 saatlik işlem hacmi (kotasyon cinsinden; sıralama için) */
  quoteVolume: number;
}

interface FuturesTicker {
  symbol?: string;
  lastPrice?: string;
  priceChangePercent?: string;
  closeTime?: number;
  quoteVolume?: string;
}

/**
 * fapi /fapi/v1/ticker/24hr (sembolsüz, tüm kontratlar) → coin başına fiyat. Vadeli teslimli
 * (BTCUSDT_260327) ve son 2 günde işlem görmemiş (kapanmış) kontratlar atlanır.
 */
export function parseFuturesTickers(body: unknown, now = Date.now()): Map<string, FuturesQuote> {
  const out = new Map<string, FuturesQuote>();
  for (const t of Array.isArray(body) ? (body as FuturesTicker[]) : []) {
    const sym = t?.symbol;
    if (typeof sym !== "string" || !/^[A-Z0-9]+(USDT|USDC)$/.test(sym)) continue;
    const quote = sym.endsWith("USDT") ? "USDT" : "USDC";
    const base = sym.slice(0, -4);
    if (!VALID_COIN.test(base)) continue;
    const last = Number(t.lastPrice);
    if (!Number.isFinite(last) || last <= 0) continue;
    const closeTime = typeof t.closeTime === "number" ? t.closeTime : null;
    if (closeTime != null && now - closeTime > 2 * 86_400_000) continue;
    const { coin, mult } = splitMultiplier(base);
    const change = Number(t.priceChangePercent);
    const vol = Number(t.quoteVolume);
    const q: FuturesQuote = {
      coin,
      base,
      pair: sym,
      mult,
      quote,
      price: last / mult,
      changePct: Number.isFinite(change) ? change : null,
      closeTime,
      quoteVolume: Number.isFinite(vol) ? vol : 0,
    };
    const prev = out.get(coin);
    out.set(coin, prev ? (better(prev, q) as FuturesQuote) : q);
  }
  return out;
}

export interface AlphaToken {
  coin: string;
  /** Binance Alpha kimliği (ALPHA_1287); ticker/mum sembolü ALPHA_1287USDT */
  alphaId: string;
  name: string;
  chain: string;
  price: number | null;
  changePct: number | null;
  volume: number;
  /** Spotta listelenmiş ise Binance'teki coin adı */
  cexCoin: string | null;
}

interface AlphaRaw {
  alphaId?: string;
  symbol?: string;
  name?: string;
  chainName?: string;
  price?: string;
  percentChange24h?: string;
  volume24h?: string;
  offline?: boolean;
  fullyDelisted?: boolean;
  stockState?: boolean;
  rwaInfo?: unknown;
  cexCoinName?: string;
}

const alphaNum = (id: string) => Number(id.slice(6));

/**
 * Alpha token listesi yanıtı ({ data: [...] }) → coin başına tek token. `raw`: kapanmamış token sayısı
 * (yanıt sağlamlık denetimi). Sembol büyük harfe çevrilir, baştaki "$" atılır; Latin harf/rakam
 * dışı (Çince vb.) semboller alınmaz.
 */
export function parseAlphaTokens(body: unknown): { tokens: Map<string, AlphaToken>; raw: number } {
  const list = (body as { data?: unknown } | null)?.data;
  const tokens = new Map<string, AlphaToken>();
  let raw = 0;
  for (const t of Array.isArray(list) ? (list as AlphaRaw[]) : []) {
    if (!t || t.offline || t.fullyDelisted) continue;
    raw++;
    if (t.stockState || t.rwaInfo) continue;
    if (typeof t.alphaId !== "string" || !/^ALPHA_\d+$/.test(t.alphaId) || typeof t.symbol !== "string") continue;
    const coin = t.symbol.trim().replace(/^\$/, "").toLocaleUpperCase("en-US");
    if (!VALID_COIN.test(coin)) continue;
    const price = Number(t.price);
    const change = Number(t.percentChange24h);
    const volume = Number(t.volume24h);
    const cex = typeof t.cexCoinName === "string" ? t.cexCoinName.trim().toLocaleUpperCase("en-US") : "";
    const tok: AlphaToken = {
      coin,
      alphaId: t.alphaId,
      name: (typeof t.name === "string" && t.name.trim() ? t.name.replace(/\s+/g, " ").trim() : coin).slice(0, 120),
      chain: typeof t.chainName === "string" ? t.chainName.slice(0, 30) : "",
      price: Number.isFinite(price) && price > 0 ? price : null,
      changePct: Number.isFinite(change) ? change : null,
      volume: Number.isFinite(volume) ? volume : 0,
      cexCoin: cex && VALID_COIN.test(cex) ? cex : null,
    };
    const prev = tokens.get(coin);
    if (!prev || tok.volume > prev.volume || (tok.volume === prev.volume && alphaNum(tok.alphaId) < alphaNum(prev.alphaId))) tokens.set(coin, tok);
  }
  return { tokens, raw };
}
