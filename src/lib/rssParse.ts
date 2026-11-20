// RSS ayrıştırma (saf, testli). Google Haberler ve Yahoo Finance beslemeleri için.
// Bağımlılık yok: yalnızca <item> içindeki title / link / pubDate / source alanları okunur.

export interface Headline {
  title: string;
  /** Yayıncı (Google'da başlığın " - Yayıncı" kısmı ya da <source>) */
  publisher: string | null;
  /** Haber bağlantısı (Google'da yönlendirme bağlantısıdır) */
  url: string;
  /** Yayın zamanı (ms) */
  publishedAt: number | null;
  /** Hangi beslemeden: "Google Haberler" | "Yahoo Finance" */
  feed: string;
}

const ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " " };

export function decodeEntities(s: string): string {
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e: string) => {
    if (e[0] === "#") {
      const code = e[1] === "x" || e[1] === "X" ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      return Number.isFinite(code) ? String.fromCodePoint(code) : m;
    }
    return ENTITIES[e.toLowerCase()] ?? m;
  });
}

function tag(xml: string, name: string): string | null {
  const m = new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)</${name}>`, "i").exec(xml);
  if (!m) return null;
  let v = m[1].trim();
  const cdata = /^<!\[CDATA\[([\s\S]*?)\]\]>$/.exec(v);
  if (cdata) v = cdata[1];
  return decodeEntities(v).replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim();
}

/**
 * RSS metnini başlıklara çevirir. Google Haberler başlıkları "Başlık - Yayıncı"
 * biçimindedir: yayıncı ayrılır. Bağlantısı ya da başlığı olmayan maddeler atlanır.
 */
export function parseRss(xml: string, feed: string): Headline[] {
  const out: Headline[] = [];
  const items = xml.match(/<item[\s>][\s\S]*?<\/item>/gi) ?? [];
  for (const it of items) {
    let title = tag(it, "title") ?? "";
    const url = tag(it, "link") ?? "";
    if (!title || !/^https?:\/\//.test(url)) continue;
    let publisher = tag(it, "source");
    const dash = title.lastIndexOf(" - ");
    if (dash > 0) {
      const tail = title.slice(dash + 3).trim();
      if (!publisher || tail === publisher) {
        publisher = publisher ?? tail;
        title = title.slice(0, dash).trim();
      }
    }
    const pub = tag(it, "pubDate");
    const t = pub ? Date.parse(pub) : NaN;
    out.push({ title, publisher: publisher || null, url, publishedAt: Number.isFinite(t) ? t : null, feed });
  }
  return out;
}

/** Başlık karşılaştırma anahtarı: küçük harf, noktalama ve fazla boşluk olmadan */
export function titleKey(title: string): string {
  return title
    .toLocaleLowerCase("tr-TR")
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9ğüşıöç ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Aynı başlığı (farklı beslemelerden) teke indirir, en yeniden eskiye sıralar. */
export function dedupeHeadlines(list: Headline[], limit = 20): Headline[] {
  const seen = new Set<string>();
  const out: Headline[] = [];
  for (const h of [...list].sort((a, b) => (b.publishedAt ?? 0) - (a.publishedAt ?? 0))) {
    const k = titleKey(h.title);
    if (!k || seen.has(k)) continue;
    seen.add(k);
    out.push(h);
    if (out.length >= limit) break;
  }
  return out;
}
