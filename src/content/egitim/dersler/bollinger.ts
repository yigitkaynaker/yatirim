import { pathCandles } from "../sampleData";
import { C, THYAO } from "../shared";
import type { Lesson } from "../types";

// Önce dalgalı, sonra çok sakin (sıkışma), ardından sert kırılım
const squeeze = pathCandles(
  [[0, 100, 0.014], [12, 109, 0.014], [24, 103, 0.003], [50, 104, 0.003], [52, 104.5, 0.006], [60, 118, 0.01], [72, 124, 0.01], [84, 116]],
  { seed: 71, noise: 0.01 },
);

// Yatay piyasada bantlar arasında gidip gelen fiyat
const range = pathCandles(
  [
    [0, 106], [5, 106], [8, 112.5], [11, 106], [16, 106], [19, 99.5], [22, 106], [27, 106], [30, 112.5], [33, 106],
    [38, 106], [41, 99.5], [44, 106], [49, 106], [52, 112.5], [55, 106], [60, 106], [63, 99.5], [66, 106], [70, 106],
  ],
  { seed: 72, noise: 0.005 },
);

export const bollingerDersi: Lesson = {
  slug: "bollinger",
  title: "Bollinger Bantları",
  summary: "Fiyatın olağan aralığını gösteren bantlarla sıkışmaları ve uç noktaları fark etmeyi öğren.",
  level: "orta",
  minutes: 6,
  what: [
    "Bollinger Bantları üç çizgiden oluşur: ortada 20 günlük ortalama, üstünde ve altında ise fiyatın ne kadar dalgalandığına göre genişleyip daralan iki bant. Fiyat zamanın büyük kısmında bu iki bandın arasında kalır.",
    "Bunu bir otoyol şeridi gibi düşün: araba (fiyat) çoğu zaman şeridin içinde gider. Şerit çok daraldığında (sıkışma) genellikle büyük bir hareket yaklaşıyordur; tıpkı sıkıştırılmış bir yayın bırakılınca sıçraması gibi.",
    "Bantlar dalgalanmayı ölçer: piyasa sakinken daralır, hareketliyken genişler.",
  ],
  examples: [
    {
      tab: "Sıkışma ve kırılım",
      caption:
        "Mavi kesikli çizgiler üst ve alt bant, noktalı çizgi 20 günlük ortalama. Ortadaki sakin dönemde bantlar iyice daralmış (sıkışma). Ardından fiyat üst bandı yukarı kırıp güçlü bir hareket başlatmış ve bantlar hızla açılmış.",
      chart: {
        candles: squeeze,
        overlays: [{ type: "bollinger", color: C.bb }],
        annotations: [
          { type: "marker", i: 44, position: "above", shape: "circle", color: C.note, text: "Sıkışma" },
          { type: "marker", i: 54, position: "below", color: C.up, text: "Kırılım" },
        ],
        legend: [
          { color: C.bb, label: "Bollinger (20, 2): üst bant, orta çizgi, alt bant" },
          { color: C.note, label: "Sıkışma: bantların en dar olduğu yer" },
        ],
      },
    },
    {
      tab: "Bant dokunuşları",
      caption:
        "Yatay bir piyasada fiyat alt banda dokunduğunda yukarı, üst banda dokunduğunda aşağı dönmüş. Bu davranış yalnızca yatay piyasada işe yarar; güçlü bir trendde fiyat bir bant boyunca \"yürüyebilir\".",
      chart: {
        candles: range,
        overlays: [{ type: "bollinger", color: C.bb }],
        annotations: [
          { type: "marker", i: 30, position: "above", color: C.down, text: "Üst bant" },
          { type: "marker", i: 52, position: "above", color: C.down, text: "Üst bant" },
          { type: "marker", i: 41, position: "below", color: C.up, text: "Alt bant" },
          { type: "marker", i: 63, position: "below", color: C.up, text: "Alt bant" },
        ],
        legend: [
          { color: C.down, label: "Üst banda dokunuş: yukarıda gerilme" },
          { color: C.up, label: "Alt banda dokunuş: aşağıda gerilme" },
        ],
      },
    },
  ],
  steps: [
    "Önce bantların genişliğine bak: dar bantlar sakin, geniş bantlar hareketli bir piyasa demektir.",
    "Bantlar uzun süre daraldıysa (sıkışma) yakında büyük bir hareket gelebileceğini düşün. Yönü ise kırılımın hangi taraftan olduğu belirler.",
    "Yatay piyasada üst banda dokunuş gerilmiş, alt banda dokunuş ucuzlamış fiyat anlamına gelebilir.",
    "Trendli piyasada fiyatın sürekli üst banda yaslanması güçlü yükselişin işaretidir; bunu tek başına satış nedeni sayma.",
    "Orta çizgi (20 günlük ortalama) çoğu zaman ara destek ya da direnç gibi çalışır.",
  ],
  mistakes: [
    "\"Üst banda değdi, kesin düşer\" demek: güçlü trendlerde fiyat haftalarca üst bant boyunca ilerleyebilir.",
    "Sıkışmanın yönünü tahmin etmeye çalışmak: sıkışma büyük bir hareketin geleceğini söyler, yönünü söylemez.",
    "Bantları destek / direnç gibi kesin sınırlar sanmak: fiyat bantların dışına da çıkabilir.",
  ],
  quiz: [
    {
      question: "Bollinger bantlarının uzun süre iyice daralmasına ne denir?",
      options: ["Sıkışma", "Altın kesişim", "Uyumsuzluk"],
      answer: 0,
      explanation: "Bantların daralması piyasanın çok sakinleştiğini gösterir. Bu \"sıkışma\" çoğu zaman büyük bir hareketin habercisidir.",
    },
    {
      question: "Sıkışmadan sonra fiyat hangi yöne gider?",
      options: ["Her zaman yukarı", "Her zaman aşağı", "Bantlar yönü söylemez; kırılımın tarafına bakmak gerekir"],
      answer: 2,
      explanation: "Sıkışma yalnızca hareketin yaklaştığını söyler. Fiyat üst bandı kırarsa yukarı, alt bandı kırarsa aşağı yönlü hareket beklenir.",
    },
    {
      question: "Güçlü bir yükselişte fiyat günlerdir üst banda yaslanarak ilerliyor. En doğru yorum hangisi?",
      options: ["Kesin satış sinyali", "Yükselişin güçlü olduğunun işareti olabilir; tek başına satış nedeni değildir", "Bantlar bozulmuş"],
      answer: 1,
      explanation: "Trendli piyasada fiyat bir bant boyunca \"yürüyebilir\". Bant dokunuşları en çok yatay piyasada işe yarar.",
    },
  ],
  tryIt: [
    {
      href: THYAO,
      label: "THYAO grafiğinde Bollinger",
      hint: "\"Grafikte göster\" bölümünden Bollinger düğmesini aç ve 3A aralığını seç. Bantların daraldığı ve genişlediği dönemleri bul.",
    },
  ],
};
