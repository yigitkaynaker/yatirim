import { rows } from "../sampleData";
import { C, THYAO } from "../shared";
import type { Lesson } from "../types";

const candles = rows([
  [100, 101.5, 99.2, 100.8],
  [100.8, 102.4, 100.2, 102],
  [102, 102.6, 100.6, 101],
  [101, 103.8, 100.7, 103.4],
  [103.4, 104.5, 102.8, 104.1],
  [104, 108.8, 103.2, 107.9],
  [107.9, 108.6, 106.4, 107],
  [107, 109.2, 106.5, 108.7],
  [108.7, 110.1, 108, 109.5],
  [109.5, 110, 107.2, 107.6],
  [107.6, 108.2, 103, 103.8],
  [103.8, 105, 102.6, 104.6],
  [104.6, 106.2, 104, 105.8],
  [105.8, 106, 104.2, 104.5],
  [104.5, 106.9, 104.1, 106.5],
  [106.5, 108, 105.9, 107.6],
  [107.6, 108.3, 106.8, 107.2],
  [107.2, 109.4, 107, 109],
]);

export const mumGrafigi: Lesson = {
  slug: "mum-grafigi",
  title: "Mum grafiği nasıl okunur?",
  summary: "Her mumun açılış, kapanış, en yüksek ve en düşük fiyatı nasıl gösterdiğini öğren.",
  level: "baslangic",
  minutes: 5,
  what: [
    "Mum grafiği, bir varlığın fiyatının belli bir süre içinde (örneğin bir gün) nasıl hareket ettiğini tek bir şekille özetler. Her mum o günün hikâyesidir: gün nerede başladı, nerede bitti, en fazla nereye çıktı ve nereye indi.",
    "Bunu bir günlük hava durumu kartı gibi düşünebilirsin: sabah sıcaklığı, akşam sıcaklığı, günün en sıcak ve en soğuk anı. Mumun kalın gövdesi açılış ile kapanış arasını, ince çubukları (fitiller) ise günün en uç noktalarını gösterir.",
    "Yeşil mum, fiyatın gün sonunda açılıştan daha yüksek kapandığını; kırmızı mum ise daha düşük kapandığını anlatır.",
  ],
  examples: [
    {
      tab: "Mumun parçaları",
      caption:
        "İşaretli yeşil mumda gövdenin altı açılış, üstü kapanış fiyatıdır; fiyat gün içinde yükselmiş. Kırmızı mumda tam tersi: gövdenin üstü açılış, altı kapanış. Fitillerin uçları günün en yüksek ve en düşük fiyatıdır.",
      chart: {
        candles,
        height: 280,
        annotations: [
          { type: "segment", points: [{ i: 4, price: 104 }, { i: 6, price: 104 }], color: C.neutral, dashed: true, label: "Açılış" },
          { type: "segment", points: [{ i: 4, price: 107.9 }, { i: 6, price: 107.9 }], color: C.up, dashed: true, label: "Kapanış" },
          { type: "marker", i: 5, position: "above", color: C.note, text: "En yüksek" },
          { type: "marker", i: 5, position: "below", color: C.note, text: "En düşük" },
          { type: "marker", i: 10, position: "above", color: C.down, text: "Kırmızı mum" },
          { type: "marker", i: 7, position: "below", shape: "circle", color: C.up, text: "Yeşil mum" },
        ],
        legend: [
          { color: C.up, label: "Yeşil: kapanış > açılış (yükseldi)" },
          { color: C.down, label: "Kırmızı: kapanış < açılış (düştü)" },
          { color: C.note, label: "Fitil uçları: günün en yüksek / en düşük fiyatı" },
        ],
      },
    },
  ],
  steps: [
    "Önce mumun rengine bak: yeşilse gün yükselişle, kırmızıysa düşüşle kapanmış.",
    "Gövdenin boyuna bak: uzun gövde, alıcıların ya da satıcıların o gün çok baskın olduğunu gösterir. Kısa gövde kararsızlık demektir.",
    "Fitillere bak: uzun bir üst fitil, fiyatın yükseldiğini ama satıcıların onu geri ittiğini anlatır. Uzun alt fitil ise alıcıların düşüşü durdurduğunu gösterir.",
    "Tek bir mumla karar verme; birkaç mumu yan yana okuyup genel yönü anlamaya çalış.",
    "Grafiğin zaman dilimini kontrol et: bir mum bir günü de, bir saati de gösterebilir.",
  ],
  mistakes: [
    "Rengi tek başına yorumlamak: yeşil mum her zaman \"al\" anlamına gelmez; önceki günlere göre hâlâ düşük bir fiyat olabilir.",
    "Fitilleri görmezden gelmek: uzun fitiller, gün içinde yaşanan önemli bir mücadeleyi anlatır.",
    "Farklı zaman dilimlerini karıştırmak: saatlik grafikteki bir kırmızı mum, günlük grafikte yeşil bir günün parçası olabilir.",
  ],
  quiz: [
    {
      question: "Yeşil bir mumda gövdenin üst kenarı neyi gösterir?",
      options: ["Açılış fiyatını", "Kapanış fiyatını", "Günün en yüksek fiyatını"],
      answer: 1,
      explanation: "Yeşil mumda fiyat yükseldiği için gövde açılıştan (alt kenar) kapanışa (üst kenar) uzanır. En yüksek fiyat ise üst fitilin ucudur.",
    },
    {
      question: "Uzun bir alt fitil genellikle ne anlatır?",
      options: ["Fiyat gün içinde çok düştü ama alıcılar onu yukarı itti", "O gün hiç işlem olmadı", "Fiyat gün boyu hep yükseldi"],
      answer: 0,
      explanation: "Alt fitil, günün en düşük fiyatına kadar iner. Uzunsa fiyat bir ara çok düşmüş, ama gün sonunda alıcılar onu yukarı taşımış demektir.",
    },
    {
      question: "Açılışı 50 TL, kapanışı 47 TL olan bir günlük mum hangi renktedir?",
      options: ["Yeşil", "Kırmızı", "Fitile göre değişir"],
      answer: 1,
      explanation: "Kapanış açılıştan düşük olduğu için mum kırmızıdır. Renk yalnızca açılış ile kapanışın karşılaştırmasına bağlıdır.",
    },
  ],
  tryIt: [
    {
      href: THYAO,
      label: "THYAO grafiğini aç",
      hint: "Uygulamadaki fiyat grafiği her günün kapanış fiyatını bir çizgiyle birleştirir. 1A aralığını seçip parmağını grafikte gezdir: gördüğün her nokta, o günün mumunun kapanış fiyatıdır.",
    },
  ],
};
