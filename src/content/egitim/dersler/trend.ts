import { pathCandles } from "../sampleData";
import { C, THYAO } from "../shared";
import type { Lesson } from "../types";

const up = pathCandles(
  [[0, 100], [8, 112], [13, 106], [23, 122], [28, 115], [38, 134], [43, 124], [52, 141]],
  { seed: 21, noise: 0.008 },
);
const down = pathCandles(
  [[0, 150], [6, 140], [13, 144], [21, 128], [28, 135], [36, 118], [43, 126], [52, 108]],
  { seed: 22, noise: 0.008 },
);
const flat = pathCandles(
  [[0, 104], [6, 110], [12, 100], [18, 109.5], [24, 100.5], [30, 110], [36, 101], [42, 109], [50, 104]],
  { seed: 23, noise: 0.008 },
);

// Yükselen trend çizgisi: dipler 13, 28, 43. mumlarda; eğim 0,6 / mum
const upLine = (i: number) => 105 + 0.6 * (i - 13);
// Düşen trend çizgisi: tepeler 13, 28, 43. mumlarda; eğim −0,6 / mum
const downLine = (i: number) => 145.6 - 0.6 * (i - 13);

export const trend: Lesson = {
  slug: "trend",
  title: "Trend ve trend çizgisi",
  summary: "Fiyatın genel yönünü bulmayı ve dipleri birleştiren bir çizgiyle takip etmeyi öğren.",
  level: "baslangic",
  minutes: 6,
  what: [
    "Trend, fiyatın genel yönüdür. Fiyat her gün inip çıksa da, uzaktan bakınca çoğu zaman yukarı, aşağı ya da yatay bir yöne gittiğini görürsün.",
    "Bunu merdiven çıkan birine benzetebilirsin: arada bir basamakta durup soluklanır, hatta bir basamak geri iner; ama her seferinde öncekinden daha yükseğe çıkıyorsa yukarı gidiyordur. Yükselen trendde her tepe ve her dip bir öncekinden yüksektir.",
    "Trend çizgisi, yükselen trendde dipleri, düşen trendde tepeleri birleştiren düz bir çizgidir. Fiyat bu çizginin doğru tarafında kaldıkça trend sürüyor kabul edilir.",
  ],
  examples: [
    {
      tab: "Yükselen trend",
      caption:
        "Her dip bir öncekinden yüksek (Dip 1 → Dip 2 → Dip 3), her tepe de bir öncekinden yüksek. Dipleri birleştiren mavi çizgi yükselen trend çizgisidir; fiyat ona her yaklaştığında yeniden yukarı dönmüş.",
      chart: {
        candles: up,
        annotations: [
          { type: "segment", points: [{ i: 3, price: upLine(3) }, { i: 52, price: upLine(52) }], color: C.trend, width: 2, label: "Trend" },
          { type: "marker", i: 13, position: "below", color: C.up, text: "Dip 1" },
          { type: "marker", i: 28, position: "below", color: C.up, text: "Dip 2" },
          { type: "marker", i: 43, position: "below", color: C.up, text: "Dip 3" },
          { type: "marker", i: 8, position: "above", color: C.note, text: "Tepe 1" },
          { type: "marker", i: 23, position: "above", color: C.note, text: "Tepe 2" },
          { type: "marker", i: 38, position: "above", color: C.note, text: "Tepe 3" },
        ],
        legend: [
          { color: C.trend, label: "Yükselen trend çizgisi (dipleri birleştirir)" },
          { color: C.up, label: "Yükselen dipler" },
          { color: C.note, label: "Yükselen tepeler" },
        ],
      },
    },
    {
      tab: "Düşen trend",
      caption:
        "Bu kez tersi: her tepe bir öncekinden alçak. Tepeleri birleştiren çizgi düşen trend çizgisidir; fiyat ona her yaklaştığında yeniden aşağı dönmüş.",
      chart: {
        candles: down,
        annotations: [
          { type: "segment", points: [{ i: 3, price: downLine(3) }, { i: 52, price: downLine(52) }], color: C.down, width: 2, label: "Trend" },
          { type: "marker", i: 13, position: "above", color: C.down, text: "Tepe 1" },
          { type: "marker", i: 28, position: "above", color: C.down, text: "Tepe 2" },
          { type: "marker", i: 43, position: "above", color: C.down, text: "Tepe 3" },
        ],
        legend: [
          { color: C.down, label: "Düşen trend çizgisi (tepeleri birleştirir)" },
        ],
      },
    },
    {
      tab: "Yatay",
      caption:
        "Fiyat belirgin bir yöne gitmiyor; iki sınır arasında gidip geliyor. Buna yatay piyasa ya da \"testere\" denir. Böyle dönemlerde trend çizgisi çizmek yanıltıcı olur.",
      chart: {
        candles: flat,
        annotations: [
          { type: "hline", price: 110.8, color: C.down, label: "Üst sınır", dashed: true },
          { type: "hline", price: 99.4, color: C.up, label: "Alt sınır", dashed: true },
        ],
        legend: [
          { color: C.down, label: "Yatay bandın üst sınırı" },
          { color: C.up, label: "Yatay bandın alt sınırı" },
        ],
      },
    },
  ],
  steps: [
    "Grafiği uzaklaştırıp genel resme bak: fiyat aylar içinde yukarı mı, aşağı mı, yoksa yatay mı gidiyor?",
    "Belirgin dipleri ve tepeleri bul. Yükselen trendde ikisi de yükselir, düşen trendde ikisi de alçalır.",
    "Yükselen trendde en az iki dibi birleştiren bir çizgi çiz. Üçüncü kez dokunup dönerse çizgi daha güvenilir hale gelir.",
    "Fiyat çizginin üstünde kaldıkça trend sürüyor demektir. Çizginin net biçimde altında kapanışlar görürsen trendin zayıfladığını düşün.",
    "Trend yönünde işlem yapmak, trende karşı işlem yapmaktan genelde daha az risklidir: \"Trend senin dostundur.\"",
  ],
  mistakes: [
    "Tek bir mumla trendin bittiğine karar vermek: kısa süreli bir sarkma, trendin sonu olmayabilir. Birkaç kapanışı bekle.",
    "Çizgiyi fiyata uydurmak için zorlamak: çizgi yalnızca belirgin dipleri (ya da tepeleri) birleştirmeli, her mumu değil.",
    "Yatay piyasada trend aramak: fiyat iki sınır arasında gidip geliyorsa trend yoktur.",
  ],
  quiz: [
    {
      question: "Yükselen bir trendin en temel özelliği nedir?",
      options: ["Her gün yeşil mum oluşması", "Tepelerin ve diplerin giderek yükselmesi", "Hacmin hep aynı kalması"],
      answer: 1,
      explanation: "Yükselen trendde arada kırmızı mumlar da olur. Önemli olan, her yeni dip ve tepenin bir öncekinden yüksek olmasıdır.",
    },
    {
      question: "Yükselen trendde trend çizgisi hangi noktaları birleştirir?",
      options: ["Dipleri", "Tepeleri", "Kapanışların ortalamasını"],
      answer: 0,
      explanation: "Yükselen trendde çizgi dipleri birleştirir ve fiyatın altında kalır. Düşen trendde ise tepeleri birleştirir ve fiyatın üstünde kalır.",
    },
    {
      question: "Fiyat yükselen trend çizgisinin bir gün az altına sarktı, ertesi gün yeniden üstüne çıktı. En makul yorum hangisi?",
      options: ["Trend kesin bitti, hemen sat", "Tek bir sarkma trendin bittiğini göstermez; birkaç kapanışı izlemek gerekir", "Trend çizgisi artık hiç işe yaramaz"],
      answer: 1,
      explanation: "Kısa sarkmalar sık yaşanır. Trendin döndüğünü düşünmek için çizginin altında birkaç net kapanış ve alçalan dipler görmek daha sağlıklıdır.",
    },
  ],
  tryIt: [
    {
      href: THYAO,
      label: "THYAO grafiğinde trendi bul",
      hint: "Grafikte 1Y aralığını seç. Son bir yılda fiyat genel olarak yukarı mı, aşağı mı, yoksa yatay mı gitmiş? Belirgin dipleri ve tepeleri gözünle sırala.",
    },
  ],
};
