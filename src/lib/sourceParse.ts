// Dış kaynak yanıtlarını ayrıştırma (TEFAS, altın). Saf fonksiyonlar, birim testlenir: npm run test:sources.
//
// TEFAS:
// Bazı fonlar bazı günler (ya da hep) fiyat 0 döndürür; 0, eksi ya da sayı
// olmayan fiyatlar GEÇERSİZ sayılır ve atlanır: son geçerli fiyat kullanılır.

export interface TefasRow {
  fonKodu?: unknown;
  fonUnvan?: unknown;
  tarih?: unknown;
  fiyat?: unknown;
}

export interface FundPricePoint {
  /** YYYY-MM-DD */
  date: string;
  price: number;
}

export interface FundPrices {
  code: string;
  name: string | null;
  /** Geçerli fiyatlar, eskiden yeniye (tarih başına tek) */
  history: FundPricePoint[];
  /** Son geçerli fiyat ve ondan önceki geçerli fiyat */
  last: FundPricePoint | null;
  prev: FundPricePoint | null;
  /** Yanıtta olup geçersiz (0 / boş) olduğu için atlanan satır sayısı */
  skipped: number;
}

/** fonFiyatBilgiGetir resultList → geçerli fiyat serisi. Hata fırlatmaz. */
export function parseFundPrices(code: string, resultList: unknown): FundPrices {
  const rows = Array.isArray(resultList) ? (resultList as TefasRow[]) : [];
  const byDate = new Map<string, number>();
  let name: string | null = null;
  let skipped = 0;
  for (const r of rows) {
    if (!r || typeof r !== "object") continue;
    if (typeof r.fonKodu === "string" && r.fonKodu.toUpperCase() !== code.toUpperCase()) continue;
    if (!name && typeof r.fonUnvan === "string" && r.fonUnvan.trim()) name = r.fonUnvan.trim();
    const date = typeof r.tarih === "string" ? r.tarih.slice(0, 10) : "";
    const price = typeof r.fiyat === "number" ? r.fiyat : typeof r.fiyat === "string" ? Number(r.fiyat) : NaN;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isFinite(price) || price <= 0) {
      skipped++;
      continue;
    }
    byDate.set(date, price);
  }
  const history = [...byDate.entries()].sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0)).map(([date, price]) => ({ date, price }));
  return {
    code: code.toUpperCase(),
    name,
    history,
    last: history[history.length - 1] ?? null,
    prev: history[history.length - 2] ?? null,
    skipped,
  };
}

// ---- Altın (Truncgil / Genelpara) ------------------------------------------------

/**
 * JSON'u ayrıştırır; yanıt yarıda kesilmişse (Truncgil bazen eksik gönderir)
 * tamamlanmış `"ANAHTAR":{...}` nesnelerini tek tek kurtarır.
 */
export function parseLooseJson(text: string): Record<string, unknown> {
  try {
    const v = JSON.parse(text) as unknown;
    if (v && typeof v === "object" && !Array.isArray(v)) return v as Record<string, unknown>;
  } catch {
    // aşağıda parça parça
  }
  const out: Record<string, unknown> = {};
  const upd = /"Update_Date"\s*:\s*"([^"]+)"/.exec(text);
  if (upd) out.Update_Date = upd[1];
  for (const m of text.matchAll(/"([A-Za-z0-9_]+)"\s*:\s*(\{[^{}]*\})/g)) {
    try {
      out[m[1]] = JSON.parse(m[2]);
    } catch {
      // bozuk parça atlanır
    }
  }
  return out;
}

export interface GoldPrice {
  /** Kuyumcunun satış fiyatı (sizin alış fiyatınız) — değerleme bununla yapılır */
  selling: number;
  /** Kuyumcunun alış fiyatı (sizin satış fiyatınız); bilinmiyorsa null */
  buying: number | null;
  changePct: number | null;
}

const num = (v: unknown): number => (typeof v === "number" ? v : typeof v === "string" ? Number(v.replace(",", ".")) : NaN);
const positive = (v: unknown): number | null => {
  const n = num(v);
  return Number.isFinite(n) && n > 0 ? n : null;
};

/** Truncgil kaydı → fiyat. Satış fiyatı 0 / geçersizse null. */
export function parseTruncgilEntry(v: unknown): GoldPrice | null {
  if (!v || typeof v !== "object") return null;
  const o = v as Record<string, unknown>;
  const selling = positive(o.Selling);
  if (selling == null) return null;
  const buying = positive(o.Buying);
  const ch = num(o.Change);
  return { selling, buying: buying != null && buying <= selling * 1.01 ? buying : null, changePct: Number.isFinite(ch) ? ch : null };
}

/** Genelpara kaydı ({alis, satis, degisim}) → fiyat. Geçersizse null. */
export function parseGenelparaEntry(v: unknown): GoldPrice | null {
  if (!v || typeof v !== "object") return null;
  const o = v as Record<string, unknown>;
  const selling = positive(o.satis);
  if (selling == null) return null;
  const buying = positive(o.alis);
  const ch = num(o.degisim);
  return { selling, buying: buying != null && buying <= selling * 1.01 ? buying : null, changePct: Number.isFinite(ch) ? ch : null };
}

/** "2026-11-20 15:54:02" (İstanbul) → ms. Geçersizse null. */
export function parseIstanbulDateTime(s: unknown): number | null {
  if (typeof s !== "string") return null;
  const m = /^(\d{4}-\d{2}-\d{2})[ T](\d{2}:\d{2}(?::\d{2})?)/.exec(s.trim());
  if (!m) return null;
  const t = Date.parse(`${m[1]}T${m[2].length === 5 ? `${m[2]}:00` : m[2]}+03:00`);
  return Number.isFinite(t) ? t : null;
}
