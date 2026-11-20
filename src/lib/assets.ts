// Varlık türleri ve sembol kuralları. İstemci ve sunucu tarafında ortak kullanılır.

export const ASSET_TYPES = ["bist", "foreign", "crypto", "fx", "gold", "fund"] as const;
export type AssetType = (typeof ASSET_TYPES)[number];

export const CURRENCIES = ["TRY", "USD", "EUR"] as const;
export type Currency = (typeof CURRENCIES)[number];

export type Side = "buy" | "sell";

export interface AssetTypeInfo {
  label: string;
  /** İşlem formunda önerilen para birimi */
  defaultCurrency: Currency;
  symbolHint: string;
  /** Grafik / dağılım rengi */
  color: string;
}

export const ASSET_TYPE_INFO: Record<AssetType, AssetTypeInfo> = {
  bist: { label: "BIST Hisse", defaultCurrency: "TRY", symbolHint: "örn. THYAO", color: "#38bdf8" },
  foreign: { label: "Yabancı Hisse", defaultCurrency: "USD", symbolHint: "örn. AAPL", color: "#a78bfa" },
  crypto: { label: "Kripto", defaultCurrency: "USD", symbolHint: "örn. BTC", color: "#f59e0b" },
  fx: { label: "Döviz", defaultCurrency: "TRY", symbolHint: "örn. USD, EUR", color: "#34d399" },
  gold: { label: "Altın", defaultCurrency: "TRY", symbolHint: "Gram, çeyrek, yarım, tam, cumhuriyet…", color: "#facc15" },
  fund: { label: "Fon", defaultCurrency: "TRY", symbolHint: "TEFAS fon kodu, örn. AFT", color: "#fb7185" },
};

/** Yatırım fonu nedir: arayüzde tek cümlelik açıklama */
export const FUND_EXPLAIN =
  "Yatırım fonu, birçok kişinin parasını bir araya getirip uzman bir şirketin hisse, tahvil, altın gibi varlıklara yatırdığı ortak bir sepettir; siz bu sepetten pay alırsınız ve payın fiyatı her iş günü bir kez açıklanır.";

export const GOLD_SYMBOL = "GRAM";

export interface GoldKind {
  symbol: string;
  label: string;
  /** Miktar birimi: gram altında "gram", sikkelerde "adet" */
  unit: "gram" | "adet";
  /** Bir birimin ağırlığı (gram) ve saflığı (22 ayar = 0,916) — yaklaşık hesap için */
  grams: number;
  purity: number;
  /** finans.truncgil.com anahtarı */
  truncgil: string | null;
  /** api.genelpara.com sembolü (yedek kaynak) */
  genelpara: string | null;
}

/**
 * Altın türleri. GRAM, ons × USDTRY'den hesaplanır (eski kayıtlarla uyumlu);
 * diğerleri kuyumcu (Kapalıçarşı) fiyatlarıdır (Truncgil, yedek: Genelpara).
 */
export const GOLD_KINDS: GoldKind[] = [
  { symbol: "GRAM", label: "Gram Altın", unit: "gram", grams: 1, purity: 0.995, truncgil: null, genelpara: null },
  { symbol: "CEYREK", label: "Çeyrek Altın", unit: "adet", grams: 1.754, purity: 0.916, truncgil: "CEYREKALTIN", genelpara: "C" },
  { symbol: "YARIM", label: "Yarım Altın", unit: "adet", grams: 3.508, purity: 0.916, truncgil: "YARIMALTIN", genelpara: "Y" },
  { symbol: "TAM", label: "Tam Altın", unit: "adet", grams: 7.016, purity: 0.916, truncgil: "TAMALTIN", genelpara: "T" },
  { symbol: "CUMHURIYET", label: "Cumhuriyet Altını", unit: "adet", grams: 7.216, purity: 0.916, truncgil: "CUMHURIYETALTINI", genelpara: "CMR" },
  { symbol: "ATA", label: "Ata Altın", unit: "adet", grams: 7.216, purity: 0.916, truncgil: "ATAALTIN", genelpara: "ATA" },
  { symbol: "BILEZIK22", label: "22 Ayar Bilezik (gram)", unit: "gram", grams: 1, purity: 0.916, truncgil: "YIA", genelpara: "22" },
];

export function goldKind(symbol: string): GoldKind | undefined {
  return GOLD_KINDS.find((k) => k.symbol === symbol);
}

/** Altın alış/satış farkı (makas): arayüzde kısa açıklama */
export const GOLD_SPREAD_EXPLAIN =
  "Kuyumcu altını size satış fiyatından satar, sizden alış fiyatından geri alır. Aradaki farka makas denir; altını alıp hemen satarsanız bu fark kadar zarar edersiniz. Portföy değeri satış fiyatıyla gösterilir.";

const GOLD_ALIASES: Record<string, string> = {
  GRAM: "GRAM", ALTIN: "GRAM", GRAMALTIN: "GRAM", GA: "GRAM",
  CEYREK: "CEYREK", CEYREKALTIN: "CEYREK",
  YARIM: "YARIM", YARIMALTIN: "YARIM",
  TAM: "TAM", TAMALTIN: "TAM",
  CUMHURIYET: "CUMHURIYET", CUMHURIYETALTINI: "CUMHURIYET", CUMHURIYETALTIN: "CUMHURIYET",
  ATA: "ATA", ATAALTIN: "ATA", ATAALTINI: "ATA",
  BILEZIK22: "BILEZIK22", BILEZIK: "BILEZIK22", "22AYAR": "BILEZIK22", "22AYARBILEZIK": "BILEZIK22",
};

const TR_ASCII: Record<string, string> = { Ç: "C", Ş: "S", İ: "I", Ö: "O", Ü: "U", Ğ: "G" };

/** Miktar birimi etiketi: gram altında "gram", sikkede "adet", fonda "pay" */
export function quantityUnit(type: AssetType, symbol: string): string {
  if (type === "gold") return goldKind(symbol)?.unit ?? "gram";
  if (type === "fund") return "pay";
  return "adet";
}

export function isAssetType(v: unknown): v is AssetType {
  return typeof v === "string" && (ASSET_TYPES as readonly string[]).includes(v);
}

export function isCurrency(v: unknown): v is Currency {
  return typeof v === "string" && (CURRENCIES as readonly string[]).includes(v);
}

/**
 * Kullanıcının yazdığı sembolü saklanan biçime çevirir.
 * THYAO.IS → THYAO, BTCUSDT → BTC, usd → USD, altın → GRAM
 */
export function normalizeSymbol(type: AssetType, raw: string): string {
  let s = raw.trim().toLocaleUpperCase("en-US").replace(/\s+/g, "");
  switch (type) {
    case "bist":
      s = s.replace(/\.IS$/, "");
      break;
    case "crypto":
      s = s.replace(/(USDT|USD)$/, "") || s;
      break;
    case "fx":
      s = s.replace(/TRY(=X)?$/, "");
      break;
    case "gold": {
      // Eski davranış: tanınmayan her altın girişi gram altındır.
      const key = s.replace(/[ÇŞİÖÜĞ]/g, (c) => TR_ASCII[c] ?? c).replace(/[^A-Z0-9]/g, "");
      s = GOLD_ALIASES[key] ?? GOLD_SYMBOL;
      break;
    }
    case "fund":
      s = s.replace(/[^A-Z0-9]/g, "");
      break;
  }
  return s;
}

export function isValidSymbol(type: AssetType, symbol: string): boolean {
  switch (type) {
    case "bist":
      return /^[A-Z0-9]{2,10}$/.test(symbol);
    case "foreign":
      return /^[A-Z0-9.\-^=]{1,15}$/.test(symbol);
    case "crypto":
      return /^[A-Z0-9]{2,12}$/.test(symbol);
    case "fx":
      return /^[A-Z]{3}$/.test(symbol) && symbol !== "TRY";
    case "gold":
      return GOLD_KINDS.some((k) => k.symbol === symbol);
    case "fund":
      // TEFAS fon kodları 3 karakterdir (harf/rakam)
      return /^[A-Z0-9]{3}$/.test(symbol);
  }
}

/** Fiyat servisinde kullanılan enstrüman kimliği: "bist:THYAO", "crypto:BTC", "gold:GRAM" */
export function instrumentId(type: AssetType, symbol: string): string {
  return `${type}:${symbol}`;
}

export function parseInstrumentId(id: string): { type: AssetType; symbol: string } | null {
  const idx = id.indexOf(":");
  if (idx < 0) return null;
  const type = id.slice(0, idx);
  if (!isAssetType(type)) return null;
  const symbol = normalizeSymbol(type, id.slice(idx + 1));
  if (!isValidSymbol(type, symbol)) return null;
  return { type, symbol };
}

export function displaySymbol(type: AssetType, symbol: string): string {
  if (type === "gold") return goldKind(symbol)?.label ?? "Gram Altın";
  if (type === "fx") return `${symbol}/TRY`;
  return symbol;
}

/** BIST fiyatları ücretsiz kaynakta ~15 dk gecikmelidir */
export function isDelayedType(type: AssetType): boolean {
  return type === "bist";
}

/** Temettü (kâr payı) takibi yapılabilen türler */
export function supportsDividends(type: AssetType): boolean {
  return type === "bist" || type === "foreign";
}

/** Portföy modu: gerçek işlemler ya da sanal ("alsaydım ne olurdu") işlemler */
export const MODES = ["real", "virtual"] as const;
export type Mode = (typeof MODES)[number];

export const MODE_LABEL: Record<Mode, string> = {
  real: "Gerçek Portföy",
  virtual: "Sanal Portföy",
};

export function isMode(v: unknown): v is Mode {
  return v === "real" || v === "virtual";
}
