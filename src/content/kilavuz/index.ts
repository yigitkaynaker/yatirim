// Kullanım kılavuzunun bölümleri, okunma sırasıyla. Yeni bölüm eklemek için
// bolumler-*.ts dosyalarından birine eklemek yeterlidir.

import { SECTIONS_1 } from "./bolumler-1";
import { SECTIONS_2 } from "./bolumler-2";
import type { Block, GuideSection } from "./types";

export const GUIDE_SECTIONS: GuideSection[] = [...SECTIONS_1, ...SECTIONS_2];

export { NO_ADVICE } from "./types";
export type { Block, GuideSection, FigureId } from "./types";

/** Bir bloğun aranabilir düz metni (işaretler temizlenmiş) */
export function blockText(b: Block): string {
  switch (b.type) {
    case "p":
    case "h":
    case "tip":
    case "warn":
      return b.text;
    case "steps":
    case "list":
      return b.items.join(" ");
    case "open":
      return b.links.map((l) => l.label).join(" ");
    case "figure":
      return b.caption;
    case "faq":
      return b.items.map((i) => `${i.q} ${i.a}`).join(" ");
    case "checklist":
      return "İlk adımlar kartını yeniden göster";
  }
}

/** Metindeki [[id|etiket]] ve **kalın** işaretlerini düz metne çevirir */
export function plain(s: string): string {
  return s.replace(/\[\[([a-z0-9-]+)(?:\|([^\]]+))?\]\]/g, (_, id: string, label?: string) => label ?? id).replace(/\*\*([^*]+)\*\*/g, "$1").replace(/\*([^*]+)\*/g, "$1");
}

/** Kılavuzdaki tüm iç bağlantılar (test ve tarama için) */
export function guideLinks(): string[] {
  return GUIDE_SECTIONS.flatMap((s) => s.blocks.flatMap((b) => (b.type === "open" ? b.links.map((l) => l.href) : [])));
}

/** Kılavuz metninde geçen sözlük kimlikleri (test için) */
export function guideTermRefs(): string[] {
  const out: string[] = [];
  for (const s of GUIDE_SECTIONS) for (const b of s.blocks) for (const m of blockText(b).matchAll(/\[\[([a-z0-9-]+)/g)) out.push(m[1]);
  return out;
}
