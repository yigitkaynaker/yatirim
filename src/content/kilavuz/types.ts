// KULLANIM KILAVUZU: içerik veri tipleri. Bölümler bolumler-*.ts dosyalarındadır;
// metni değiştirmek için yalnızca o dosyaları düzenlemek yeterlidir.
//
// Metin içinde küçük işaretler kullanılabilir:
//   **kalın**              → kalın yazı
//   [[rsi]] / [[rsi|RSI]]  → sözlük bağlantısı (/sozluk#rsi)

/** Kılavuzdaki çizimler (src/components/kilavuz/Figures.tsx) */
export type FigureId = "ekran" | "portfoy-ozet" | "pozisyon-grafik" | "emir-akisi" | "makas" | "yerel-bulut" | "sanal-gercek";

export type Block =
  | { type: "p"; text: string }
  | { type: "h"; text: string }
  | { type: "steps"; items: string[] }
  | { type: "list"; items: string[] }
  | { type: "tip"; text: string }
  | { type: "warn"; text: string }
  | { type: "open"; links: { href: string; label: string }[] }
  | { type: "figure"; figure: FigureId; caption: string }
  | { type: "faq"; items: { q: string; a: string }[] }
  /** "İlk adımlar" kartını Portföy'de yeniden gösteren düğme */
  | { type: "checklist" };

export interface GuideSection {
  /** Bağlantı kimliği: /kilavuz#<id> */
  id: string;
  title: string;
  /** İçindekiler ve arama sonucu için tek cümle */
  summary: string;
  blocks: Block[];
}

export const NO_ADVICE = "Bu uygulama yatırım tavsiyesi vermez.";
