// CSV (Excel Türkçe uyumlu) yazma ve okuma. Saf fonksiyonlar (birim testlenir).
// Türkçe Excel bir CSV'yi çift tıklayınca doğru açsın diye:
// - UTF-8 BOM (Türkçe karakterler bozulmasın), ayırıcı ";" (virgül ondalık için kullanılır),
// - ondalık virgül (12,5), binlik ayırıcı yok, tarih gg.aa.yyyy.

export const BOM = "﻿";
export const DELIM = ";";

export type Cell = string | number | null | undefined;

/** Sayıyı Türkçe ondalıkla yazar (binlik ayırıcısız, gereksiz sıfırlar atılır). */
export function trNumber(n: number | null | undefined, maxDigits = 8): string {
  if (n == null || !Number.isFinite(n)) return "";
  const fixed = n.toFixed(maxDigits);
  const trimmed = fixed.includes(".") ? fixed.replace(/0+$/, "").replace(/\.$/, "") : fixed;
  return (trimmed === "-0" ? "0" : trimmed).replace(".", ",");
}

/** YYYY-MM-DD → gg.aa.yyyy */
export function trDate(iso: string | null | undefined): string {
  if (!iso) return "";
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  return m ? `${m[3]}.${m[2]}.${m[1]}` : iso;
}

/** Excel/Calc'ın formül olarak çalıştırabileceği baş karakterler (CSV formül enjeksiyonu). */
const FORMULA_START = /^[=+\-@\t\r]/;

function escapeCell(v: Cell): string {
  if (v == null) return "";
  let s = typeof v === "number" ? trNumber(v) : String(v);
  // Metin hücre (sembol, not, hesap adı…) "=", "+", "-", "@", sekme ya da CR ile başlıyorsa başına '
  // konur: Excel onu formül olarak çalıştırmaz. Sayı hücreleri (örn. -12,5) olduğu gibi kalır.
  if (typeof v === "string" && FORMULA_START.test(s)) s = `'${s}`;
  return /[";\r\n]/.test(s) || /^\s|\s$/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** Başlık + satırlar → CSV metni (BOM ile, CRLF satır sonu). */
export function toCsv(headers: string[], rows: Cell[][]): string {
  const lines = [headers.map(escapeCell).join(DELIM), ...rows.map((r) => r.map(escapeCell).join(DELIM))];
  return BOM + lines.join("\r\n") + "\r\n";
}

/** Ayırıcıyı ilk satırdan tahmin eder: ; , ya da sekme. */
export function detectDelimiter(text: string): string {
  const first = text.replace(/^﻿/, "").split(/\r?\n/, 1)[0] ?? "";
  const count = (d: string) => {
    let n = 0;
    let q = false;
    for (const ch of first) {
      if (ch === '"') q = !q;
      else if (!q && ch === d) n++;
    }
    return n;
  };
  const cands = [";", "\t", ","].map((d) => ({ d, n: count(d) }));
  cands.sort((a, b) => b.n - a.n);
  return cands[0].n > 0 ? cands[0].d : ";";
}

/** CSV metnini satır / hücre dizisine çevirir (tırnaklı alanlar, satır içi yeni satır desteklenir). Boş satırlar atlanır. */
export function parseCsv(text: string, delim = detectDelimiter(text)): string[][] {
  const src = text.replace(/^﻿/, "");
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let q = false;
  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (q) {
      if (ch === '"') {
        if (src[i + 1] === '"') {
          cell += '"';
          i++;
        } else q = false;
      } else cell += ch;
      continue;
    }
    if (ch === '"' && cell === "") q = true;
    else if (ch === delim) {
      row.push(cell);
      cell = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && src[i + 1] === "\n") i++;
      row.push(cell);
      cell = "";
      if (row.some((c) => c.trim() !== "")) rows.push(row);
      row = [];
    } else cell += ch;
  }
  row.push(cell);
  if (row.some((c) => c.trim() !== "")) rows.push(row);
  return rows.map((r) => r.map((c) => c.trim()));
}

/**
 * Sayı okur: Türkçe (1.234,56) ve İngilizce (1,234.56 / 1234.56) biçimleri, para birimi
 * işaretleri ve boşluklar. Okunamazsa NaN.
 */
export function parseNumberLoose(raw: string | null | undefined): number {
  if (raw == null) return NaN;
  let s = String(raw).trim().replace(/[\s ]/g, "").replace(/^(TRY|TL|USD|EUR|₺|\$|€)/i, "").replace(/(TRY|TL|USD|EUR|₺|\$|€)$/i, "");
  if (s === "") return NaN;
  let neg = false;
  if (/^\(.*\)$/.test(s)) {
    neg = true;
    s = s.slice(1, -1);
  }
  const lastComma = s.lastIndexOf(",");
  const lastDot = s.lastIndexOf(".");
  if (lastComma >= 0 && lastDot >= 0) {
    // İkisi de var: sonda olan ondalık ayırıcıdır.
    if (lastComma > lastDot) s = s.replace(/\./g, "").replace(",", ".");
    else s = s.replace(/,/g, "");
  } else if (lastComma >= 0) {
    // Yalnız virgül: Türkçe ondalık (birden çoksa binlik).
    s = (s.match(/,/g)!.length > 1 ? s.replace(/,/g, "") : s.replace(",", "."));
  } else if (lastDot >= 0 && (s.match(/\./g)!.length > 1 || /^[1-9]\d{0,2}\.\d{3}$/.test(s.replace(/^-/, "")))) {
    // Birden çok nokta ya da "10.000" gibi tam 3 haneli grup: Türkçe binlik.
    // "0.500" binlik olamaz (baştaki 0 grup başlatmaz): ondalık okunur.
    s = s.replace(/\./g, "");
  }
  if (!/^-?\d+(\.\d+)?$/.test(s)) return NaN;
  const n = Number(s);
  return neg ? -n : n;
}

/**
 * İki türlü okunabilen sayı mı? "1.234" (Türkçe 1234 / İngilizce 1,234) ya da "1,234"
 * (Türkçe 1,234 / İngilizce 1234). Okuma Türkçe yapılır; önizlemede kullanıcıya uyarı gösterilir.
 */
export function isAmbiguousNumber(raw: string | null | undefined): boolean {
  if (raw == null) return false;
  const s = String(raw).trim().replace(/[\s ]/g, "").replace(/^(TRY|TL|USD|EUR|₺|\$|€)/i, "").replace(/(TRY|TL|USD|EUR|₺|\$|€)$/i, "");
  return /^-?\(?[1-9]\d{0,2}[.,]\d{3}\)?$/.test(s);
}

/** Tarih okur: gg.aa.yyyy, gg/aa/yyyy, gg-aa-yyyy, yyyy-aa-gg (saat kısmı atılır). Okunamazsa null. */
export function parseDateLoose(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const s = raw.trim().split(/[ T]/)[0];
  let y: number, m: number, d: number;
  let r = /^(\d{4})[-./](\d{1,2})[-./](\d{1,2})$/.exec(s);
  if (r) [y, m, d] = [Number(r[1]), Number(r[2]), Number(r[3])];
  else {
    r = /^(\d{1,2})[-./](\d{1,2})[-./](\d{2}|\d{4})$/.exec(s);
    if (!r) return null;
    [d, m, y] = [Number(r[1]), Number(r[2]), Number(r[3])];
    if (y < 100) y += 2000;
  }
  if (m < 1 || m > 12 || d < 1 || d > 31) return null;
  const iso = `${String(y).padStart(4, "0")}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
  const dt = new Date(`${iso}T00:00:00Z`);
  if (Number.isNaN(dt.getTime()) || dt.getUTCDate() !== d) return null;
  return iso;
}

/** Türkçe karşılaştırma anahtarı: küçük harf, aksansız, boşluksuz */
export function normKey(s: string): string {
  return s
    .toLocaleLowerCase("tr-TR")
    .replace(/ı/g, "i")
    .replace(/ğ/g, "g")
    .replace(/ü/g, "u")
    .replace(/ş/g, "s")
    .replace(/ö/g, "o")
    .replace(/ç/g, "c")
    .replace(/[^a-z0-9%]/g, "");
}
