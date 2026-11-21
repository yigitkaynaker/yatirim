// Yapay zeka çıktısındaki rakamların hafif doğrulaması (saf, testli).
// Amaç engellemek değil uyarmak: modelin yazdığı her anlamlı sayı, ona verilen
// araç sonuçlarında / bağlamda (aynı değer ya da yuvarlanmış hâli) geçiyor mu?
// Geçmeyenler "doğrulanamayan rakam" olarak işaretlenir.
//
// Göz ardı edilenler: 10'dan küçük tam sayılar (adım, gün, adet gibi), yıllar
// (1900–2100), tarih ve saat kalıpları (20.11.2026, 18:45), endeks adları (BIST 100,
// S&P 500) ve ay adının yanındaki 31'e kadar gün sayıları (12 Kasım, Kasım'ın 3'ü).
// "1,5 milyon" gibi çarpanlı yazımlar 1.500.000 olarak karşılaştırılır.

export interface FoundNumber {
  /** Metinde göründüğü hâli, örn. "1.234,5" ya da "1,5 milyon" */
  raw: string;
  /** Olası değerler (Türkçe ve İngilizce okumaları; çarpansız) */
  values: number[];
  /** Ondalık basamak sayısı (yuvarlama karşılaştırması için) */
  decimals: number;
  /** "bin / milyon / milyar" çarpanı (yoksa 1) */
  multiplier: number;
}

const NUM_RE = /(?<![\p{L}\d])[-+−]?\d[\d.,]*\d|(?<![\p{L}\d.,])\d(?![\d])/gu;
const DATE_RE = /\b\d{1,2}[./]\d{1,2}[./]\d{2,4}\b|\b\d{4}-\d{2}-\d{2}\b|\b\d{1,2}:\d{2}(?::\d{2})?\b/g;

/** Endeks adı + sayı: "BIST 100", "BIST-30", "S&P 500", "Nasdaq 100", "Nikkei 225"… */
const INDEX_RE =
  /(?<![\p{L}\d])(?:BIST|XU|XUTUM|S&P|SP|Nasdaq|NDX|Dow(?:\s+Jones)?|DJIA|DAX|FTSE|Nikkei|Russell|Euro\s+Stoxx|Stoxx|CAC|IBEX|Hang\s+Seng|MSCI|ASX|KOSPI|Sensex|Nifty)\s?-?\d+(?![\d.,]\d)/giu;

// Tam ay adları Türkçe ek alabilir (Kasım'da, Kasımda); kısaltmalar yalnızca tek başına.
const MONTH_FULL = "ocak|[şs]ubat|mart|nisan|may[ıi]s|haziran|temmuz|a[ğg]ustos|eyl[üu]l|ekim|kas[ıi]m|aral[ıi]k|january|february|march|april|june|july|august|september|october|november|december";
const MONTH_ABBR = "may|jan|feb|mar|apr|jun|jul|aug|sep|sept|oct|nov|dec|oca|şub|nis|haz|tem|ağu|eyl|eki|kas|ara";
const MONTH = `(?:(?:${MONTH_FULL})\\p{L}*|(?:${MONTH_ABBR})(?!\\p{L}))`;
/** "12 Kasım", "12-14 Kasım" */
const DAY_BEFORE_MONTH_RE = new RegExp(`(?<![\\p{L}\\d.,])(\\d{1,2})(?:\\s*[-–]\\s*(\\d{1,2}))?\\s+${MONTH}`, "giu");
/** "Kasım 12", "Kasım'ın 3'ü" */
const MONTH_BEFORE_DAY_RE = new RegExp(`(?<!\\p{L})${MONTH}(?:'\\p{L}{1,4})?\\s+(\\d{1,2})(?![\\d.,]\\d)`, "giu");

/** Sayıdan hemen sonra gelen çarpan kelimesi */
const MULT_RE = /^\s*(?:(trilyon|milyar|milyon|trillion|billion|million|thousand)\p{L}*|(bin)(?:l[iı]k)?(?!\p{L})|(mlr|mn|bn)(?!\p{L}))/iu;
const MULT: Record<string, number> = {
  bin: 1e3,
  thousand: 1e3,
  milyon: 1e6,
  million: 1e6,
  mn: 1e6,
  milyar: 1e9,
  billion: 1e9,
  mlr: 1e9,
  bn: 1e9,
  trilyon: 1e12,
  trillion: 1e12,
};

/** Endeks adlarını ve ay adının yanındaki gün sayılarını (≤31) metinden çıkarır. */
function stripNonValues(text: string): string {
  const dayOk = (d: string | undefined) => d == null || Number(d) <= 31;
  return text
    .replace(INDEX_RE, " ")
    .replace(DAY_BEFORE_MONTH_RE, (m: string, a: string, b?: string) => (dayOk(a) && dayOk(b) ? m.replace(/\d+/g, " ") : m))
    .replace(MONTH_BEFORE_DAY_RE, (m: string, a: string) => (dayOk(a) ? m.replace(/\d+/g, " ") : m));
}

/** Sayının ardından gelen metindeki çarpan ("1,5 milyon" → 1e6); yoksa 1 ve kelime null. */
function multiplierAfter(rest: string): { mult: number; word: string | null } {
  const m = MULT_RE.exec(rest);
  if (!m) return { mult: 1, word: null };
  // "binde 5" ya da "bina" çarpan sayılmaz: bin yalnızca tek başına ya da "binlik" olarak
  const word = (m[1] ?? m[2] ?? m[3]).toLocaleLowerCase("tr-TR");
  return { mult: MULT[word] ?? 1, word: m[0].trim() };
}

function interpretations(raw: string): { values: number[]; decimals: number } {
  const s = raw.replace(/^[+−]/, (m) => (m === "−" ? "-" : "")).replace(/^\+/, "");
  const neg = s.startsWith("-");
  const body = neg ? s.slice(1) : s;
  const out: { v: number; d: number }[] = [];
  const push = (txt: string) => {
    if (!/^\d+(\.\d+)?$/.test(txt)) return;
    const d = txt.includes(".") ? txt.split(".")[1].length : 0;
    out.push({ v: Number(txt) * (neg ? -1 : 1), d });
  };
  const hasComma = body.includes(",");
  const hasDot = body.includes(".");
  if (hasComma && hasDot) {
    // Son ayırıcı ondalıktır
    if (body.lastIndexOf(",") > body.lastIndexOf(".")) push(body.replace(/\./g, "").replace(",", "."));
    else push(body.replace(/,/g, ""));
  } else if (hasComma) {
    push(body.replace(",", ".")); // Türkçe ondalık
    if (/^\d{1,3}(,\d{3})+$/.test(body)) push(body.replace(/,/g, "")); // İngilizce binlik
  } else if (hasDot) {
    if (/^\d{1,3}(\.\d{3})+$/.test(body)) push(body.replace(/\./g, "")); // Türkçe binlik
    if ((body.match(/\./g) ?? []).length === 1) push(body); // İngilizce ondalık
  } else push(body);
  return { values: out.map((o) => o.v), decimals: out.length ? Math.max(...out.map((o) => o.d)) : 0 };
}

/** Metindeki anlamlı sayılar */
export function extractNumbers(text: string): FoundNumber[] {
  const cleaned = stripNonValues(text.replace(DATE_RE, " "));
  const out: FoundNumber[] = [];
  for (const m of cleaned.matchAll(NUM_RE)) {
    const raw = m[0].replace(/[.,]+$/, "");
    const { values, decimals } = interpretations(raw);
    if (values.length === 0) continue;
    const { mult, word } = multiplierAfter(cleaned.slice(m.index + m[0].length));
    const meaningful = values.some((v) => {
      const a = Math.abs(v);
      if (mult > 1) return true;
      if (decimals === 0 && a < 10) return false;
      if (decimals === 0 && a >= 1900 && a <= 2100) return false;
      return true;
    });
    if (meaningful) out.push({ raw: word ? `${raw} ${word}` : raw, values, decimals, multiplier: mult });
  }
  return out;
}

/** Kaynak metinlerdeki (JSON dahil) tüm sayılar; "1,5 milyon" hem 1,5 hem 1.500.000 olarak eklenir. */
export function sourceNumbers(sources: string[]): number[] {
  const set = new Set<number>();
  for (const s of sources) {
    for (const m of s.matchAll(/-?\d[\d.,]*\d|-?\d/g)) {
      const { mult } = multiplierAfter(s.slice(m.index + m[0].length));
      for (const v of interpretations(m[0].replace(/[.,]+$/, "")).values) {
        set.add(v);
        if (mult > 1) set.add(v * mult);
      }
    }
  }
  return [...set];
}

/** multiplier: çıktıdaki sayının çarpanı ("1,5 milyon" → v = 1,5; kaynak değerler milyona bölünüp karşılaştırılır). */
function matches(v: number, decimals: number, src: number[], multiplier = 1): boolean {
  const a = Math.abs(v);
  for (const s0 of src) {
    const s = Math.abs(s0) / multiplier;
    if (s === a) return true;
    // Yuvarlanmış gösterim: kaynaktaki değer aynı basamağa yuvarlanınca eşit mi
    const f = 10 ** Math.min(decimals, 8);
    if (Math.round(s * f) / f === a) return true;
    // Küçük göreli fark (biçimlendirme / kesme)
    if (s > 0 && Math.abs(s - a) / s <= 0.005) return true;
    // Yüzde ↔ oran (0,052 ↔ %5,2)
    if (multiplier === 1 && s > 0 && s < 1 && Math.abs(s * 100 - a) / (s * 100) <= 0.01) return true;
  }
  return false;
}

/**
 * Çıktıdaki doğrulanamayan rakamlar (metinde göründükleri hâliyle, tekrarsız).
 * sources: araç sonuçları, verilen bağlam blokları ve kullanıcının mesajları.
 */
export function unverifiedNumbers(output: string, sources: string[]): string[] {
  const src = sourceNumbers(sources);
  const bad: string[] = [];
  for (const n of extractNumbers(output)) {
    if (n.values.some((v) => matches(v, n.decimals, src, n.multiplier))) continue;
    if (!bad.includes(n.raw)) bad.push(n.raw);
  }
  return bad;
}
