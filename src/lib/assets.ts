// Varlık türleri ve sembol kuralları. İstemci ve sunucu tarafında ortak kullanılır.

export const ASSET_TYPES = ["bist", "foreign", "crypto", "fx", "gold"] as const;
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
  gold: { label: "Altın", defaultCurrency: "TRY", symbolHint: "Gram altın", color: "#facc15" },
};

export const GOLD_SYMBOL = "GRAM";

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
    case "gold":
      s = GOLD_SYMBOL;
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
      return symbol === GOLD_SYMBOL;
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
  if (type === "gold") return "Gram Altın";
  if (type === "fx") return `${symbol}/TRY`;
  return symbol;
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
