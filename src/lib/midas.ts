// Midas'ta işlem gören coinler ve katalog eşlemesi (saf işlevler; ağ ve veritabanı kullanmaz, testlerde
// doğrudan çağrılır). Liste data/midasCoins.ts'tedir (scripts/update-midas-coins.ts ile üretilir).
// Midas için ayrı katalog satırı açılmaz: piyasa sayfasındaki "Midas" klasörü, her Midas coini için
// katalogdaki TEK satırı (fiyat kaynağı) gösteren bir süzgeçtir. Tercih sırası: Binance spot USDT →
// BtcTurk (USDT, sonra TL) → Binance spot TL → Binance Vadeli → Binance Alpha → CoinGecko. Çarpanlı adlar
// (Midas'ta CAT = Binance spotta 1000CAT) çarpansız adla eşleşir. Aynı coin hem Binance hem Midas
// klasöründe görünebilir (iki platformda da işlem görür); katalogda yine tek satırdır.
import { parseCryptoSymbol, type CryptoRef } from "./assets";
import { splitMultiplier } from "./binanceExtra";
import { MIDAS_COINS } from "./data/midasCoins";

/** Adı değişen coinler: Midas sembolü → katalogdaki taban coin (IP → Data Network, OMNI → Nomina) */
export const MIDAS_ALIASES: Readonly<Record<string, string>> = { IP: "DATAIP", OMNI: "NOM" };

/** Satırın işlem gördüğü platformlar (rozetler; bu sırayla) */
export const PLATFORMS = ["Binance", "BtcTurk", "Midas"] as const;
export type Platform = (typeof PLATFORMS)[number];

/** Fiyat kaynağı önceliği (küçük olan önce) */
function venueRank(c: CryptoRef): number {
  if (c.venue === "BINANCE") return c.quote === "USDT" ? 0 : 3;
  if (c.venue === "BTCTURK") return c.quote === "USDT" ? 1 : 2;
  if (c.venue === "BINANCE-F") return 4;
  if (c.venue === "BINANCE-ALPHA") return 5;
  return 6;
}

/** Katalog satırının çarpansız coin adı (1000CAT → CAT); kripto sembolü değilse null */
export function coinKey(symbol: string): string | null {
  const c = parseCryptoSymbol(symbol);
  return c ? splitMultiplier(c.base).coin : null;
}

/** Midas sembolünün katalogdaki coin adı */
const midasTarget = (coin: string) => MIDAS_ALIASES[coin] ?? coin;

/** Midas coinlerinin çarpansız katalog adları */
export const MIDAS_KEYS: ReadonlySet<string> = new Set(MIDAS_COINS.map(([c]) => splitMultiplier(midasTarget(c)).coin));

export interface MidasMatch {
  coin: string;
  name: string;
  /** Fiyatın alınacağı katalog sembolü */
  symbol: string;
}

/**
 * Katalogdaki kripto sembolleri → her Midas coini için seçilen tek satır (Midas sırasıyla). Katalogda
 * karşılığı olmayan coin atlanır. Önce kaynak önceliği, eşitlikte tam ad (çarpansız eşleşmeden önce).
 */
export function resolveMidasCoins(symbols: Iterable<string>): MidasMatch[] {
  const best = new Map<string, { symbol: string; score: number }>();
  const offer = (key: string, symbol: string, score: number) => {
    const cur = best.get(key);
    if (!cur || score < cur.score) best.set(key, { symbol, score });
  };
  for (const s of symbols) {
    const c = parseCryptoSymbol(s);
    if (!c) continue;
    const r = venueRank(c) * 2;
    offer(`=${c.base}`, s, r);
    offer(`~${splitMultiplier(c.base).coin}`, s, r + 1);
  }
  const out: MidasMatch[] = [];
  for (const [coin, name] of MIDAS_COINS) {
    const t = midasTarget(coin);
    const exact = best.get(`=${t}`);
    const loose = best.get(`~${splitMultiplier(t).coin}`);
    const hit = exact && (!loose || exact.score <= loose.score) ? exact : loose;
    if (hit) out.push({ coin, name, symbol: hit.symbol });
  }
  return out;
}

/** Kaynak (symbol_catalog.source) → platform */
export function sourcePlatform(source: string): Platform | null {
  if (source === "binance" || source === "binance-futures" || source === "binance-alpha") return "Binance";
  if (source === "btcturk") return "BtcTurk";
  return null;
}
