// Yapay zeka çıktısındaki rakamların hafif doğrulaması (saf, testli).
// Amaç engellemek değil uyarmak: modelin yazdığı her anlamlı sayı, ona verilen
// araç sonuçlarında / bağlamda (aynı değer ya da yuvarlanmış hâli) geçiyor mu?
// Geçmeyenler "doğrulanamayan rakam" olarak işaretlenir.
//
// Göz ardı edilenler: 10'dan küçük tam sayılar (adım, gün, adet gibi), yıllar
// (1900–2100), tarih ve saat kalıpları (20.11.2026, 18:45).

export interface FoundNumber {
  /** Metinde göründüğü hâli, örn. "1.234,5" */
  raw: string;
  /** Olası değerler (Türkçe ve İngilizce okumaları) */
  values: number[];
  /** Ondalık basamak sayısı (yuvarlama karşılaştırması için) */
  decimals: number;
}

const NUM_RE = /(?<![\p{L}\d])[-+−]?\d[\d.,]*\d|(?<![\p{L}\d.,])\d(?![\d])/gu;
const DATE_RE = /\b\d{1,2}[./]\d{1,2}[./]\d{2,4}\b|\b\d{4}-\d{2}-\d{2}\b|\b\d{1,2}:\d{2}(?::\d{2})?\b/g;

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
  const cleaned = text.replace(DATE_RE, " ");
  const out: FoundNumber[] = [];
  for (const m of cleaned.matchAll(NUM_RE)) {
    const raw = m[0].replace(/[.,]+$/, "");
    const { values, decimals } = interpretations(raw);
    if (values.length === 0) continue;
    const meaningful = values.some((v) => {
      const a = Math.abs(v);
      if (decimals === 0 && a < 10) return false;
      if (decimals === 0 && a >= 1900 && a <= 2100) return false;
      return true;
    });
    if (meaningful) out.push({ raw, values, decimals });
  }
  return out;
}

/** Kaynak metinlerdeki (JSON dahil) tüm sayılar */
export function sourceNumbers(sources: string[]): number[] {
  const set = new Set<number>();
  for (const s of sources) {
    for (const m of s.matchAll(/-?\d[\d.,]*\d|-?\d/g)) {
      for (const v of interpretations(m[0].replace(/[.,]+$/, "")).values) set.add(v);
    }
  }
  return [...set];
}

function matches(v: number, decimals: number, src: number[]): boolean {
  const a = Math.abs(v);
  for (const s0 of src) {
    const s = Math.abs(s0);
    if (s === a) return true;
    // Yuvarlanmış gösterim: kaynaktaki değer aynı basamağa yuvarlanınca eşit mi
    const f = 10 ** Math.min(decimals, 8);
    if (Math.round(s * f) / f === a) return true;
    // Küçük göreli fark (biçimlendirme / kesme)
    if (s > 0 && Math.abs(s - a) / s <= 0.005) return true;
    // Yüzde ↔ oran (0,052 ↔ %5,2)
    if (s > 0 && s < 1 && Math.abs(s * 100 - a) / (s * 100) <= 0.01) return true;
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
    if (n.values.some((v) => matches(v, n.decimals, src))) continue;
    if (!bad.includes(n.raw)) bad.push(n.raw);
  }
  return bad;
}
