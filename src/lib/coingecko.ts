// Binance'te (spot, vadeli, Alpha) ve BtcTurk'te olmayan coinler için CoinGecko kaynağı: derlenmiş
// eşleme listesi ve saf ayrıştırma işlevleri (katalog, fiyat ve grafik aynı kuralları kullansın diye
// tek yerde; ağ kullanmaz, testlerde doğrudan çağrılır).
//   - Fiyat: api.coingecko.com/api/v3/simple/price (anahtarsız herkese açık uç; tek istekte tüm
//     liste, ids virgülle). Hız sınırı düşük (dakikada birkaç istek): fiyatlar toplu ve önbellekli alınır.
//   - Grafik: /coins/{id}/market_chart?vs_currency=usd&days=N (anahtarsız en fazla 365 gün).
// Semboller (CRO, CORE, SUP…) CoinGecko'da birden çok coine karşılık gelebildiğinden eşleme elle
// derlenmiştir: Midas'ın canlı kripto listesindeki (getmidas.com/canli-kripto, 2026-11) ad, fiyat ve
// piyasa değeriyle karşılaştırılarak doğru CoinGecko kimliği seçildi. Midas çalışma anında okunmaz.
// Listede olup sonradan Binance / BtcTurk'te listelenen coin katalogda yalnızca oradan görünür.
// Alınmayanlar: TROY ve SLF (CoinGecko'da aylardır güncellenmeyen fiyat), CAT (Binance spotta
// 1000CAT olarak var), IP (Data Network'e dönüştü; DATAIP@BINANCE-F), OMNI (Nomina'ya dönüştü; NOM).

/** [sembol, ad, CoinGecko kimliği] */
export const COINGECKO_COINS: readonly (readonly [string, string, string])[] = [
  ["WSTETH", "Lido wstETH", "wrapped-steth"],
  ["PYUSD", "PayPal USD", "paypal-usd"],
  ["CRO", "Cronos", "crypto-com-chain"],
  ["RAIN", "Rain", "rain"],
  ["OKB", "OKB", "okb"],
  ["PI", "Pi Network", "pi-network"],
  ["XDC", "XDC Network", "xdce-crowd-sale"],
  ["EURC", "EURC", "euro-coin"],
  ["BTT", "BitTorrent", "bittorrent"],
  ["TRAC", "OriginTrail", "origintrail"],
  ["TIBBIR", "Ribbita by Virtuals", "ribbita-by-virtuals"],
  ["NPC", "Non-Playable Coin", "non-playable-coin"],
  ["DIEM", "Diem", "diem"],
  ["QUBIC", "Qubic", "qubic-network"],
  ["NOCK", "Nockchain", "nockchain"],
  ["ACX", "Across Protocol", "across-protocol"],
  ["CSPR", "Casper", "casper-network"],
  ["RON", "Ronin", "ronin"],
  ["BNKR", "BankrCoin", "bankercoin-2"],
  ["QANX", "QANplatform", "qanplatform"],
  ["CORE", "Core", "coredaoorg"],
  ["FAI", "Freysa", "freysa-ai"],
  ["MEY", "Mey Network", "mey-network"],
  ["BLEND", "Fluent", "fluent-network"],
  ["SERV", "OpenServ", "openserv"],
  ["DRB", "DebtReliefBot", "debtreliefbot"],
  ["AUKI", "Auki", "auki-labs"],
  ["BASECAT", "Basecat", "basecat"],
  ["REPPO", "Reppo", "reppo"],
  ["KEYCAT", "Keyboard Cat", "keyboard-cat-base"],
  ["DOGINME", "doginme", "doginme"],
  ["CMC20", "CoinMarketCap 20 Index", "coinmarketcap-20-index-dtf"],
  ["MAMO", "Mamo", "mamo"],
  ["OWB", "OWB", "owb"],
  ["LMTS", "Limitless", "limitless-3"],
  ["ELIZAOS", "elizaOS", "elizaos"],
  ["PRCL", "Parcl", "parcl"],
  ["ARG", "Argentine Football Association Fan Token", "argentine-football-association-fan-token"],
  ["REI", "REI Network", "rei-network"],
  ["POR", "Portugal National Team Fan Token", "portugal-national-team-fan-token"],
  ["MIGGLES", "Mr Miggles", "mister-miggles"],
  ["NOICE", "noice", "noice"],
  ["OVPP", "OpenVPP", "openvpp-2"],
  ["SUP", "Superfluid", "superfluid"],
  ["ACA", "Acala", "acala"],
  ["BAKE", "BakeryToken", "bakerytoken"],
  ["SEDA", "SEDA Protocol", "seda-2"],
  ["WELL", "Moonwell", "moonwell-artemis"],
  ["TIG", "The Innovation Game", "the-innovation-game"],
  ["BELIEVE", "Launch Coin on Believe", "ben-pasternak"],
  ["OM", "MANTRA", "mantra"],
  ["BNX", "BinaryX", "binaryx"],
  ["MKR", "Maker", "maker"],
];

export const COINGECKO_API = "https://api.coingecko.com/api/v3";

const BY_COIN = new Map(COINGECKO_COINS.map(([coin, , id]) => [coin, id]));

/** Sembolün CoinGecko kimliği (listede yoksa null) */
export function coingeckoId(coin: string): string | null {
  return BY_COIN.get(coin) ?? null;
}

/** Bir istekte en fazla bu kadar kimlik (URL uzunluğu) */
export const COINGECKO_BATCH = 100;

/** Kaynak bu süreden uzun süredir güncellenmiyorsa (işlem görmeyen coin) fiyat yok sayılır */
export const COINGECKO_MAX_SOURCE_AGE_MS = 3 * 86_400_000;

export interface CoinGeckoQuote {
  price: number;
  changePct: number | null;
  /** CoinGecko'nun son güncelleme zamanı (ms) */
  sourceTime: number | null;
}

/** simple/price yanıtı → kimlik başına fiyat. Geçersiz / 0 fiyat ve uzun süredir güncellenmeyenler atlanır. */
export function parseSimplePrice(body: unknown, now = Date.now()): Map<string, CoinGeckoQuote> {
  const out = new Map<string, CoinGeckoQuote>();
  if (!body || typeof body !== "object" || Array.isArray(body)) return out;
  for (const [id, v] of Object.entries(body as Record<string, unknown>)) {
    const r = v as { usd?: unknown; usd_24h_change?: unknown; last_updated_at?: unknown } | null;
    const price = Number(r?.usd);
    if (!Number.isFinite(price) || price <= 0) continue;
    const at = typeof r?.last_updated_at === "number" ? r.last_updated_at * 1000 : null;
    if (at != null && now - at > COINGECKO_MAX_SOURCE_AGE_MS) continue;
    const change = r?.usd_24h_change;
    out.set(id, { price, changePct: typeof change === "number" && Number.isFinite(change) ? change : null, sourceTime: at });
  }
  return out;
}

export interface CoinGeckoPoint {
  /** Unix saniye */
  time: number;
  close: number;
  volume: number | null;
}

/** market_chart yanıtı ({ prices: [[ms, fiyat]], total_volumes: [[ms, hacim]] }) → sıralı noktalar */
export function parseMarketChart(body: unknown): CoinGeckoPoint[] {
  const b = body as { prices?: unknown; total_volumes?: unknown } | null;
  const vol = new Map<number, number>();
  for (const r of Array.isArray(b?.total_volumes) ? (b.total_volumes as unknown[]) : []) {
    if (Array.isArray(r) && Number.isFinite(Number(r[0])) && Number(r[1]) > 0) vol.set(Number(r[0]), Number(r[1]));
  }
  const out: CoinGeckoPoint[] = [];
  for (const r of Array.isArray(b?.prices) ? (b.prices as unknown[]) : []) {
    if (!Array.isArray(r)) continue;
    const t = Number(r[0]);
    const close = Number(r[1]);
    if (!Number.isFinite(t) || !Number.isFinite(close) || close <= 0) continue;
    out.push({ time: Math.floor(t / 1000), close, volume: vol.get(t) ?? null });
  }
  return out.sort((a, b2) => a.time - b2.time);
}
