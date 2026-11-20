import { pathCandles, withCandles } from "../sampleData";
import { C, THYAO } from "../shared";
import type { Lesson } from "../types";

const doji = withCandles(pathCandles([[0, 100], [20, 120], [32, 110]], { seed: 91, noise: 0.006 }), {
  20: { o: 120, h: 121.9, l: 118.2, c: 120.08 },
});

const hammer = withCandles(pathCandles([[0, 130], [18, 111], [32, 124]], { seed: 92, noise: 0.006 }), {
  18: { o: 110.4, h: 111.3, l: 105.4, c: 111 },
});

const bullish = withCandles(pathCandles([[0, 130], [17, 112], [18, 115.2], [32, 125]], { seed: 93, noise: 0.006 }), {
  17: { o: 113.9, h: 114.3, l: 111.6, c: 112 },
  18: { o: 111.6, h: 115.6, l: 111.2, c: 115.2 },
});

const bearish = withCandles(pathCandles([[0, 100], [17, 118], [18, 115], [32, 105]], { seed: 94, noise: 0.006 }), {
  17: { o: 116.3, h: 118.4, l: 116, c: 118 },
  18: { o: 118.5, h: 118.9, l: 114.6, c: 115 },
});

export const mumFormasyonlari: Lesson = {
  slug: "mum-formasyonlari",
  title: "Temel mum formasyonları",
  summary: "Doji, çekiç, yutan boğa ve yutan ayı mumlarının ne anlattığını öğren.",
  level: "orta",
  minutes: 8,
  what: [
    "Bazı mumlar ya da mum ikilileri, alıcılarla satıcılar arasındaki dengenin değişmeye başladığını gösterir. Bunlara mum formasyonu denir.",
    "Bir halat çekme yarışı düşün: bir taraf uzun süre kazanıyorken bir anda ip ortada durursa (doji) ya da öbür taraf ipi sertçe geri çekerse (yutan mum) oyunun dengesi değişiyor olabilir.",
    "Formasyonlar en çok belirgin bir trendin sonunda, önemli bir destek ya da direnç seviyesinde ortaya çıktıklarında anlam taşır.",
  ],
  examples: [
    {
      tab: "Doji",
      caption:
        "Doji, açılış ve kapanışın neredeyse aynı olduğu, gövdesi çok ince bir mumdur. Yükselişin ardından gelen doji, alıcıların artık eskisi kadar baskın olmadığını, kararsızlık başladığını anlatır.",
      chart: {
        candles: doji,
        annotations: [{ type: "marker", i: 20, position: "above", color: C.note, text: "Doji (kararsızlık)" }],
        legend: [{ color: C.note, label: "Gövdesi çok ince mum: açılış ≈ kapanış" }],
      },
    },
    {
      tab: "Çekiç",
      caption:
        "Çekiç, küçük gövdeli ve uzun alt fitilli bir mumdur. Düşüş sırasında fiyat gün içinde çok düşmüş ama alıcılar devreye girip onu yukarı taşımış. Düşüşün sonuna yaklaşıldığına işaret edebilir.",
      chart: {
        candles: hammer,
        annotations: [{ type: "marker", i: 18, position: "below", color: C.up, text: "Çekiç" }],
        legend: [{ color: C.up, label: "Uzun alt fitil: alıcılar düşüşü geri itti" }],
      },
    },
    {
      tab: "Yutan boğa",
      caption:
        "Düşüş sırasında küçük bir kırmızı mumdan sonra, onun gövdesini tamamen içine alan büyük bir yeşil mum gelmiş. Alıcıların kontrolü ele aldığını gösteren güçlü bir dönüş işaretidir.",
      chart: {
        candles: bullish,
        annotations: [
          { type: "marker", i: 17, position: "above", shape: "circle", color: C.down, text: "Küçük kırmızı" },
          { type: "marker", i: 18, position: "below", color: C.up, text: "Yutan boğa" },
        ],
        legend: [{ color: C.up, label: "Yeşil gövde, önceki kırmızı gövdeyi tamamen kaplıyor" }],
      },
    },
    {
      tab: "Yutan ayı",
      caption:
        "Yükseliş sırasında küçük bir yeşil mumdan sonra, onun gövdesini tamamen içine alan büyük bir kırmızı mum gelmiş. Satıcıların kontrolü ele aldığını gösteren bir dönüş işaretidir.",
      chart: {
        candles: bearish,
        annotations: [
          { type: "marker", i: 17, position: "below", shape: "circle", color: C.up, text: "Küçük yeşil" },
          { type: "marker", i: 18, position: "above", color: C.down, text: "Yutan ayı" },
        ],
        legend: [{ color: C.down, label: "Kırmızı gövde, önceki yeşil gövdeyi tamamen kaplıyor" }],
      },
    },
  ],
  steps: [
    "Önce trende bak: dönüş formasyonları ancak öncesinde belirgin bir yükseliş ya da düşüş varsa anlamlıdır.",
    "Doji'de gövdenin çok ince olduğunu, çekiçte alt fitilin gövdenin en az iki katı uzun olduğunu kontrol et.",
    "Yutan formasyonlarda ikinci mumun gövdesinin birincinin gövdesini tamamen kapladığından emin ol (fitiller sayılmaz).",
    "Formasyonun nerede oluştuğuna bak: bir destek ya da direnç seviyesinde oluşan formasyon çok daha anlamlıdır.",
    "Teyit bekle: formasyondan sonraki mum beklenen yönde kapanırsa sinyal güçlenir.",
  ],
  mistakes: [
    "Her doji'yi dönüş sanmak: yatay bir piyasada doji'ler çok sık görülür ve pek bir şey anlatmaz.",
    "Formasyonu bağlamından koparmak: trendin ortasında, hiçbir seviyeye yakın değilken oluşan bir çekiç zayıf bir sinyaldir.",
    "Teyit beklemeden işlem yapmak: tek bir mum, ertesi gün tamamen geçersiz hale gelebilir.",
  ],
  quiz: [
    {
      question: "Açılışı ve kapanışı neredeyse aynı olan, çok ince gövdeli muma ne denir?",
      options: ["Çekiç", "Doji", "Yutan boğa"],
      answer: 1,
      explanation: "Doji'de açılış ile kapanış neredeyse aynıdır. Alıcılarla satıcıların dengede olduğunu, kararsızlığı anlatır.",
    },
    {
      question: "Düşüş trendinin sonunda, uzun alt fitilli küçük gövdeli bir mum oluştu. Bu hangi formasyon olabilir?",
      options: ["Çekiç", "Yutan ayı", "Ölüm kesişimi"],
      answer: 0,
      explanation: "Çekiç, düşüşten sonra gelen uzun alt fitilli mumdur: fiyat çok düşmüş ama alıcılar onu geri yukarı itmiştir.",
    },
    {
      question: "Yutan boğa formasyonunda ikinci mum nasıldır?",
      options: ["Önceki yeşil mumu kaplayan kırmızı bir mum", "Önceki kırmızı mumun gövdesini tamamen kaplayan yeşil bir mum", "Çok ince gövdeli bir mum"],
      answer: 1,
      explanation: "Yutan boğada küçük bir kırmızı mumun ardından, onun gövdesini tamamen içine alan büyük bir yeşil mum gelir.",
    },
  ],
  tryIt: [
    {
      href: THYAO,
      label: "THYAO grafiğini incele",
      hint: "1A aralığını seç ve parmağını grafikte gezdirerek fiyatın sert döndüğü günleri bul. Bu dönüş günlerinin mumu nasıl olabilirdi, düşün: uzun fitilli mi, yutan mı?",
    },
  ],
};
