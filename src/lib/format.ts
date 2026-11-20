// Türkçe sayı / tarih biçimlendirme ve ondalık girişi ayrıştırma.

const cache = new Map<string, Intl.NumberFormat>();
function nf(key: string, opts: Intl.NumberFormatOptions) {
  let f = cache.get(key);
  if (!f) {
    f = new Intl.NumberFormat("tr-TR", opts);
    cache.set(key, f);
  }
  return f;
}

export function formatMoney(value: number | null | undefined, currency = "TRY", maxDigits = 2): string {
  if (value == null || !Number.isFinite(value)) return "—";
  const digits = Math.abs(value) < 1 && value !== 0 ? Math.max(maxDigits, 4) : maxDigits;
  return nf(`m-${currency}-${digits}`, {
    style: "currency",
    currency,
    minimumFractionDigits: Math.min(2, digits),
    maximumFractionDigits: digits,
  }).format(value);
}

export function formatNumber(value: number | null | undefined, maxDigits = 2): string {
  if (value == null || !Number.isFinite(value)) return "—";
  return nf(`n-${maxDigits}`, { maximumFractionDigits: maxDigits }).format(value);
}

export function formatQuantity(value: number): string {
  return formatNumber(value, 8);
}

export function formatPercent(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return "—";
  const sign = value > 0 ? "+" : "";
  return sign + nf("p", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value) + "%";
}

export function formatSigned(value: number | null | undefined, currency = "TRY"): string {
  if (value == null || !Number.isFinite(value)) return "—";
  return (value > 0 ? "+" : "") + formatMoney(value, currency);
}

export function formatDate(iso: string): string {
  const [y, m, d] = iso.slice(0, 10).split("-");
  return `${d}.${m}.${y}`;
}

export function formatTime(ms: number): string {
  return new Date(ms).toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

/** "1.234,56" / "12,5" / "12.5" → sayı. Geçersizse (boş, eksik alan, metin dışı) NaN. */
export function parseDecimal(input: string | number | null | undefined): number {
  if (typeof input === "number") return input;
  if (typeof input !== "string") return NaN;
  let s = input.trim().replace(/\s/g, "");
  if (!s) return NaN;
  if (s.includes(",") && s.includes(".")) {
    s = s.replace(/\./g, "").replace(",", ".");
  } else if (s.includes(",")) {
    s = s.replace(",", ".");
  } else if (/^-?[1-9]\d{0,2}(\.\d{3})+$/.test(s)) {
    // Türkçe binlik ayırıcı: "10.000" → 10000 (ondalık için virgül kullanılır)
    s = s.replace(/\./g, "");
  }
  if (!/^-?\d*\.?\d+$/.test(s) && !/^-?\d+\.?$/.test(s)) return NaN;
  return Number(s);
}

export function pnlClass(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value) || Math.abs(value) < 1e-9) return "text-slate-300";
  return value > 0 ? "text-emerald-400" : "text-rose-400";
}
