import { pathCandles } from "../sampleData";
import { C, THYAO } from "../shared";
import type { Lesson } from "../types";

const candles = pathCandles(
  [[0, 126], [28, 102], [58, 138], [84, 114], [104, 130]],
  { seed: 61, noise: 0.01 },
);

export const macdDersi: Lesson = {
  slug: "macd",
  title: "MACD: kesişimler ve histogram",
  summary: "İki ortalamanın arasındaki farktan momentumun yönünü ve gücünü okumayı öğren.",
  level: "orta",
  minutes: 7,
  what: [
    "MACD, hızlı (12 günlük) ve yavaş (26 günlük) iki üssel ortalama arasındaki farktır. Bu fark büyüyorsa fiyat hızlanıyor, küçülüyorsa yavaşlıyor demektir. MACD'nin 9 günlük ortalamasına da \"sinyal çizgisi\" denir.",
    "Bir arabanın hız göstergesi gibi düşünebilirsin: araba hâlâ ileri gidiyor olabilir ama gaza daha az basılıyorsa ibre düşmeye başlar. MACD de fiyatın ne kadar hızlı hareket ettiğini gösterir.",
    "Histogram (çubuklar), MACD ile sinyal çizgisi arasındaki farktır. Çubuklar büyüyorsa hareket güçleniyor, küçülüyorsa zayıflıyor demektir.",
  ],
  examples: [
    {
      tab: "Kesişimler ve histogram",
      caption:
        "Alttaki panelde mavi çizgi MACD, turuncu çizgi sinyal çizgisi. Mavi turuncuyu yukarı kestiğinde yükseliş, aşağı kestiğinde düşüş başlıyor. Yeşil çubuklar yükseliş gücünü, kırmızı çubuklar düşüş gücünü gösteriyor.",
      chart: {
        candles,
        panes: ["macd"],
        annotations: [
          { type: "macdCross", upText: "Al kesişimi", downText: "Sat kesişimi" },
          { type: "hline", price: 0, color: C.neutral, label: "Sıfır", dashed: true, pane: "macd" },
        ],
        legend: [
          { color: "#38bdf8", label: "MACD çizgisi (12 − 26 EMA farkı)" },
          { color: "#f59e0b", label: "Sinyal çizgisi (MACD'nin 9 günlük EMA'sı)" },
          { color: C.up, label: "Histogram: yükseliş gücü" },
          { color: C.down, label: "Histogram: düşüş gücü" },
        ],
      },
    },
  ],
  steps: [
    "MACD çizgisinin sinyal çizgisini yukarı kesmesine dikkat et: bu, yükseliş momentumunun başladığına işaret eder (al kesişimi).",
    "MACD'nin sinyal çizgisini aşağı kesmesi düşüş momentumunun başladığına işaret eder (sat kesişimi).",
    "Sıfır çizgisine bak: MACD sıfırın üstündeyse kısa ortalama uzun ortalamanın üstündedir, yani genel eğilim yukarıdır.",
    "Histogram çubuklarının boyunu izle: çubuklar küçülmeye başladıysa hareket yavaşlıyor, kesişim yaklaşıyor olabilir.",
    "Kesişimleri trend yönünde kullanmak daha güvenlidir: yükselen trendde al kesişimleri, düşen trendde sat kesişimleri daha anlamlıdır.",
  ],
  mistakes: [
    "Her küçük kesişime göre işlem yapmak: yatay piyasada MACD sık sık kesişir ve çoğu yanlış sinyaldir.",
    "MACD'nin geriden geldiğini unutmak: ortalamalardan hesaplandığı için dönüşleri biraz geç gösterir.",
    "Histogramdaki küçülmeyi hemen ters yönde işlem için sebep saymak: yavaşlama, dönüş demek değildir.",
  ],
  quiz: [
    {
      question: "MACD çizgisi sinyal çizgisini aşağıdan yukarı kesti. Bu genelde nasıl yorumlanır?",
      options: ["Yükseliş momentumu başlıyor", "Düşüş momentumu başlıyor", "Hiçbir anlamı yok"],
      answer: 0,
      explanation: "MACD'nin sinyal çizgisini yukarı kesmesi \"al kesişimi\" olarak bilinir ve yükselişin hız kazandığına işaret eder.",
    },
    {
      question: "Histogram çubukları her gün biraz daha kısalıyor. Bu ne anlatır?",
      options: ["Hareket hızlanıyor", "Hareket yavaşlıyor, momentum zayıflıyor", "Hacim artıyor"],
      answer: 1,
      explanation: "Histogram, MACD ile sinyal çizgisi arasındaki farktır. Fark küçülüyorsa hareket yavaşlıyor demektir.",
    },
    {
      question: "MACD sıfır çizgisinin üstündeyse ne söyleyebiliriz?",
      options: ["Kısa vadeli ortalama uzun vadelinin üstünde; genel eğilim yukarı", "Hisse kesinlikle yükselecek", "Fiyat sıfıra yaklaşıyor"],
      answer: 0,
      explanation: "MACD = 12 günlük EMA − 26 günlük EMA. Pozitifse kısa ortalama uzun ortalamanın üstündedir. Bu bir eğilim bilgisidir, garanti değildir.",
    },
  ],
  tryIt: [
    {
      href: THYAO,
      label: "THYAO Teknik Analiz bölümü",
      hint: "Varlık detayında aşağı kaydırıp \"Teknik Analiz\" bölümüne bak. MACD satırı, MACD'nin sinyal çizgisinin üstünde mi altında mı olduğunu ve yakın zamanda kesişim olup olmadığını söyler.",
    },
    {
      href: "/sinyaller",
      label: "Sinyaller sayfası",
      hint: "Sinyal puanına MACD kesişimleri de katkı verir.",
    },
  ],
};
