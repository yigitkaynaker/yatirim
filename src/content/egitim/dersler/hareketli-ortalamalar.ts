import { pathCandles } from "../sampleData";
import { C, detailHref } from "../shared";
import type { Lesson } from "../types";

const candles = pathCandles(
  [[0, 132], [30, 104], [62, 142], [92, 110], [112, 124]],
  { seed: 41, noise: 0.012 },
);

const turn = pathCandles(
  [[0, 100], [30, 126], [55, 104]],
  { seed: 42, noise: 0.008 },
);

export const hareketliOrtalamalar: Lesson = {
  slug: "hareketli-ortalamalar",
  title: "Hareketli ortalamalar",
  summary: "SMA ve EMA ile gürültüyü süzmeyi, altın kesişim ve ölüm kesişimini tanımayı öğren.",
  level: "baslangic",
  minutes: 7,
  what: [
    "Hareketli ortalama, son belli sayıda günün kapanış fiyatlarının ortalamasıdır ve her gün yeniden hesaplanır. Böylece günlük iniş çıkışlar yumuşar, ana yön daha net görünür.",
    "Bir öğrencinin tek bir sınav notu yerine son beş sınavının ortalamasına bakmak gibidir: tek bir kötü gün ortalamayı pek değiştirmez. SMA (basit ortalama) her güne eşit ağırlık verir; EMA (üssel ortalama) son günlere daha fazla ağırlık verir, bu yüzden daha çabuk tepki verir.",
    "Kısa vadeli ortalama uzun vadeliyi yukarı keserse buna \"altın kesişim\", aşağı keserse \"ölüm kesişimi\" denir. Gerçek grafiklerde en çok 50 ve 200 günlük ortalamalar kullanılır.",
  ],
  examples: [
    {
      tab: "Altın ve ölüm kesişimi",
      caption:
        "Sarı çizgi kısa vadeli (10 günlük), pembe çizgi uzun vadeli (30 günlük) ortalama. Sarı pembeyi yukarı kestiğinde yükseliş, aşağı kestiğinde düşüş dönemi başlamış. Kesişimlerin dönüşten biraz sonra geldiğine dikkat et: ortalamalar geriden gelir.",
      chart: {
        candles,
        overlays: [
          { type: "ma", kind: "sma", period: 10, color: C.sma, label: "SMA 10" },
          { type: "ma", kind: "sma", period: 30, color: C.sma2, label: "SMA 30" },
        ],
        annotations: [{ type: "maCross", fast: { kind: "sma", period: 10 }, slow: { kind: "sma", period: 30 }, upText: "Altın kesişim", downText: "Ölüm kesişimi" }],
        legend: [
          { color: C.sma, label: "SMA 10 (kısa vade)" },
          { color: C.sma2, label: "SMA 30 (uzun vade)" },
          { color: C.note, label: "Altın kesişim: kısa, uzunu yukarı keser" },
          { color: "#f87171", label: "Ölüm kesişimi: kısa, uzunu aşağı keser" },
        ],
      },
    },
    {
      tab: "SMA mı, EMA mı?",
      caption:
        "Aynı 20 günlük süreyle hesaplanan iki ortalama. Fiyat yön değiştirdiğinde camgöbeği EMA, turuncu SMA'dan daha önce döner. EMA daha hızlıdır ama daha çok yanlış sinyal de üretebilir.",
      chart: {
        candles: turn,
        overlays: [
          { type: "ma", kind: "sma", period: 20, color: C.sma, label: "SMA 20" },
          { type: "ma", kind: "ema", period: 20, color: C.ema, label: "EMA 20" },
        ],
        annotations: [
          { type: "marker", i: 30, position: "above", color: C.note, text: "Tepe" },
          { type: "marker", i: 36, position: "above", color: C.ema, text: "EMA dönüyor" },
        ],
        legend: [
          { color: C.sma, label: "SMA 20 (basit, daha yavaş)" },
          { color: C.ema, label: "EMA 20 (üssel, daha hızlı)" },
        ],
      },
    },
  ],
  steps: [
    "Fiyat ortalamanın üstündeyse eğilim yukarı, altındaysa aşağı kabul edilir.",
    "Ortalamanın eğimine bak: yukarı bakan bir ortalama yükselişin sürdüğünü, düzleşen bir ortalama gücün azaldığını gösterir.",
    "Kısa vadeli ortalamanın uzun vadeliyi yukarı kesmesi (altın kesişim) yükselişin güçlendiğine, aşağı kesmesi (ölüm kesişimi) düşüşün güçlendiğine işaret eder.",
    "Yükselen trendde fiyat ortalamaya geri çekildiğinde ortalama çoğu zaman destek gibi çalışır.",
    "Ortalamalar geçmiş fiyatlardan hesaplandığı için her zaman geriden gelir; onları dönüşü önceden tahmin etmek için değil, yönü teyit etmek için kullan.",
  ],
  mistakes: [
    "Yatay piyasada kesişimlere güvenmek: fiyat yatayken ortalamalar sürekli birbirini keser ve çok sayıda yanlış sinyal verir.",
    "Kesişimi erken bir uyarı sanmak: kesişim oluştuğunda hareketin önemli bir kısmı çoktan gerçekleşmiş olabilir.",
    "Her gün farklı bir ortalama süresi denemek: bir ya da iki süre seç (örneğin 50 ve 200) ve tutarlı kal.",
  ],
  quiz: [
    {
      question: "Altın kesişim nedir?",
      options: ["Kısa vadeli ortalamanın uzun vadeliyi yukarı kesmesi", "Fiyatın altın fiyatını geçmesi", "Uzun vadeli ortalamanın kısa vadeliyi yukarı kesmesi"],
      answer: 0,
      explanation: "Altın kesişimde kısa vadeli ortalama (örn. 50 günlük) uzun vadeliyi (örn. 200 günlük) aşağıdan yukarı keser. Yükselişin güçlendiğine işaret sayılır.",
    },
    {
      question: "EMA'nın SMA'dan farkı nedir?",
      options: ["EMA yalnızca hacmi kullanır", "EMA son günlere daha çok ağırlık verir, bu yüzden daha hızlı tepki verir", "EMA her zaman fiyatın üstünde kalır"],
      answer: 1,
      explanation: "SMA tüm günlere eşit ağırlık verir. EMA ise yakın günlere daha fazla önem verir; bu yüzden yön değişimlerine daha çabuk uyum sağlar.",
    },
    {
      question: "Fiyat aylardır yatay ve ortalamalar sık sık birbirini kesiyor. Ne yapmak daha akıllıca?",
      options: ["Her kesişimde alıp satmak", "Kesişimlere bu dönemde fazla güvenmemek, başka göstergelerle teyit aramak", "Ortalama süresini her gün değiştirmek"],
      answer: 1,
      explanation: "Hareketli ortalamalar trend olan piyasada iyi çalışır. Yatay piyasada kesişimler çoğunlukla yanlış alarm verir.",
    },
  ],
  tryIt: [
    {
      href: detailHref("bist:THYAO", "Türk Hava Yolları", { katman: ["sma50", "sma200"], aralik: "1Y" }),
      label: "THYAO grafiğinde SMA 50 / SMA 200",
      hint: "Bağlantı grafiği 1 yıllık aralıkta, SMA 50 (sarı) ve SMA 200 (pembe) çizgileri açık olarak açar. Fiyat ortalamaların üstünde mi, altında mı? Sarı çizgi pembeyi kesmiş mi?",
    },
    {
      href: "/sinyaller",
      label: "Sinyaller sayfası",
      hint: "Sinyaller sayfası, izlediğin varlıklarda altın ve ölüm kesişimlerini de hesaba katar.",
    },
  ],
};
