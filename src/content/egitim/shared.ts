// Ders dosyalarının ortak renkleri ve bağlantı yardımcıları.

export const C = {
  up: "#34d399",
  down: "#fb7185",
  trend: "#38bdf8",
  note: "#facc15",
  neutral: "#cbd5e1",
  fib: "#c084fc",
  sma: "#fbbf24",
  sma2: "#f472b6",
  ema: "#22d3ee",
  bb: "#60a5fa",
} as const;

/**
 * Varlık detay sayfası bağlantısı (örn. bist:THYAO). katman: grafikte hazır açılacak
 * göstergeler (sma50, sma200, bollinger, rsi), aralik: grafik aralığı (1A, 3A, 1Y…).
 */
export function detailHref(id: string, name?: string, opts: { katman?: string[]; aralik?: string } = {}): string {
  return (
    `/piyasa/detay?id=${encodeURIComponent(id)}${name ? `&ad=${encodeURIComponent(name)}` : ""}` +
    (opts.katman?.length ? `&katman=${opts.katman.join(",")}` : "") +
    (opts.aralik ? `&aralik=${opts.aralik}` : "")
  );
}


export const THYAO = detailHref("bist:THYAO", "Türk Hava Yolları");
export const BTC = detailHref("crypto:BTC", "Bitcoin");
