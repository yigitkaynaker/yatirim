import { pathCandles } from "../sampleData";
import { C, THYAO } from "../shared";
import type { Lesson } from "../types";

// Sakin dönem (düşük hacim) → hacimli kırılım → sağlıklı yükseliş → hacmi azalan, yorulan yükseliş → düşüş
const candles = pathCandles(
  [[0, 101, 0.006], [20, 103, 0.006], [21, 104], [25, 113, 0.01], [44, 126, 0.006], [60, 130, 0.008], [72, 121]],
  {
    seed: 81,
    noise: 0.008,
    volumeRamp: [
      [0, 20, 0.6, 0.6],
      [26, 44, 1.2, 1.1],
      [45, 60, 1.0, 0.45],
      [61, 72, 1.1, 1.3],
    ],
    volumeBoost: [[21, 2.8], [22, 3.4], [23, 2.6], [24, 2]],
  },
);

export const hacim: Lesson = {
  slug: "hacim",
  title: "Hacim analizi",
  summary: "Fiyat hareketinin arkasında ne kadar güç olduğunu işlem hacmiyle anlamayı öğren.",
  level: "orta",
  minutes: 5,
  what: [
    "Hacim, bir günde el değiştiren hisse (ya da coin) miktarıdır. Grafiğin altındaki çubuklarla gösterilir: çubuk ne kadar uzunsa o gün o kadar çok alım satım olmuştur.",
    "Bir konser salonundaki alkış gibi düşün: birkaç kişinin alkışı (düşük hacim) pek bir şey ifade etmez, ama tüm salon ayağa kalkarsa (yüksek hacim) gerçekten güçlü bir tepki vardır. Fiyat hareketi ne kadar çok kişinin katılımıyla oluyorsa o kadar inandırıcıdır.",
    "Kısacası fiyat \"ne oldu\" sorusunu, hacim ise \"ne kadar güçlü oldu\" sorusunu yanıtlar.",
  ],
  examples: [
    {
      tab: "Hacimle teyit",
      caption:
        "Sakin dönemde hacim düşük. Kırılım günlerinde hacim birden artmış: hareket güçlü ve inandırıcı. Sonraki dönemde fiyat yükselmeye devam etse de hacim gittikçe azalmış; yükseliş yorulmuş ve ardından düşüş gelmiş.",
      chart: {
        candles,
        panes: ["volume"],
        height: 240,
        annotations: [
          { type: "marker", i: 22, position: "below", color: C.up, text: "Hacimli kırılım" },
          { type: "marker", i: 22, position: "above", shape: "circle", color: C.note, text: "Hacim patlaması", pane: "volume" },
          { type: "marker", i: 55, position: "above", color: C.down, text: "Zayıf yükseliş" },
          { type: "segment", points: [{ i: 45, price: 1150 }, { i: 60, price: 520 }], color: C.down, dashed: true, pane: "volume" },
          { type: "hline", price: 104.5, color: C.trend, label: "Direnç", dashed: true },
        ],
        legend: [
          { color: C.up, label: "Yüksek hacimle kırılım: güçlü hareket" },
          { color: C.down, label: "Fiyat yükselirken hacmin azalması: yorgunluk" },
        ],
      },
    },
  ],
  steps: [
    "Hacmi her zaman fiyatla birlikte oku: tek başına \"yüksek hacim\" iyi ya da kötü değildir.",
    "Fiyat yükselirken hacim de artıyorsa yükseliş sağlıklıdır; alıcılar istekli.",
    "Fiyat yükselirken hacim azalıyorsa yükselişin gücü tükeniyor olabilir.",
    "Destek ya da direnç kırılırken hacmin ortalamanın belirgin biçimde üstünde olmasını ara; düşük hacimli kırılımlar sık sık geri döner.",
    "Hacmi son 20 günün ortalamasıyla kıyasla: bugünkü hacim ortalamanın 1,5 katı ve üstündeyse dikkat çekicidir.",
  ],
  mistakes: [
    "Hacmi hiç kontrol etmeden kırılıma güvenmek: düşük hacimli kırılımlar çoğu zaman \"sahte\" çıkar.",
    "Yüksek hacmi her zaman olumlu sanmak: sert bir düşüşte gelen yüksek hacim, güçlü bir satış baskısı demektir.",
    "Döviz ve fon gibi hacim verisi olmayan varlıklarda hacim aramak: bu varlıklar için başka göstergelere dayanmak gerekir.",
  ],
  quiz: [
    {
      question: "Hacim neyi ölçer?",
      options: ["Fiyatın ne kadar yükseldiğini", "Belli bir sürede ne kadar alım satım yapıldığını", "Şirketin kârını"],
      answer: 1,
      explanation: "Hacim, o gün el değiştiren hisse ya da coin miktarıdır; harekete ne kadar katılım olduğunu gösterir.",
    },
    {
      question: "Fiyat bir direnci kırdı ve hacim son 20 günün ortalamasının 3 katı. Bu ne anlatır?",
      options: ["Kırılım güçlü ve daha inandırıcı", "Kırılım kesin sahte", "Hacmin önemi yoktur"],
      answer: 0,
      explanation: "Yüksek hacimli kırılımlar, hareketin arkasında çok sayıda alıcı olduğunu gösterir ve daha güvenilir kabul edilir.",
    },
    {
      question: "Fiyat haftalardır yükseliyor ama hacim her hafta azalıyor. Ne düşünmek mantıklı?",
      options: ["Yükseliş güçleniyor", "Yükselişin gücü azalıyor olabilir; dikkatli olmak gerekir", "Hacim azalınca fiyat hep yükselir"],
      answer: 1,
      explanation: "Fiyat yükselirken hacmin azalması, yeni alıcıların azaldığını ve yükselişin yorulduğunu düşündürür.",
    },
  ],
  tryIt: [
    {
      href: THYAO,
      label: "THYAO hacim değeri",
      hint: "Varlık detayında \"Teknik Analiz\" bölümündeki gösterge değerlerinde bugünkü hacmin 20 günlük ortalamaya oranını görebilirsin.",
    },
    {
      href: "/sinyaller",
      label: "Sinyaller sayfası",
      hint: "Yüksek hacimli yükseliş ve düşüşler sinyal puanına katkı verir.",
    },
  ],
};
