import { pathCandles } from "../sampleData";
import { C, THYAO } from "../shared";
import type { Lesson } from "../types";

const candles = pathCandles(
  [[0, 108], [5, 100], [11, 114], [17, 100.5], [23, 114.5], [29, 101], [35, 114], [39, 109], [44, 121], [50, 116.5], [58, 128]],
  { seed: 31, noise: 0.007, volumeBoost: [[42, 2.4], [43, 1.9], [44, 1.5]] },
);

export const destekDirenc: Lesson = {
  slug: "destek-direnc",
  title: "Destek ve direnç",
  summary: "Fiyatın sık sık durduğu \"taban\" ve \"tavan\" seviyelerini bulmayı öğren.",
  level: "baslangic",
  minutes: 6,
  what: [
    "Destek, fiyatın düşerken defalarca durup yukarı döndüğü seviyedir; bir tür taban. Direnç ise fiyatın yükselirken takılıp geri döndüğü seviyedir; bir tür tavan.",
    "Bir odada zıplayan top düşün: yer (destek) topun daha aşağı inmesini, tavan (direnç) daha yükseğe çıkmasını engeller. Bu seviyelerde çok sayıda alıcı ya da satıcı beklediği için fiyat orada zorlanır.",
    "Bir direnç güçlü biçimde kırılırsa çoğu zaman yeni bir destek haline gelir. Buna \"rol değişimi\" denir.",
  ],
  examples: [
    {
      tab: "Destek, direnç ve kırılım",
      caption:
        "Fiyat yaklaşık 100'de üç kez durup yükseliyor (destek), 115 civarında üç kez takılıp düşüyor (direnç). Sonra direnci yüksek hacimle yukarı kırıyor; geri çekildiğinde eski direnç bu kez destek gibi çalışıyor.",
      chart: {
        candles,
        panes: ["volume"],
        annotations: [
          { type: "hline", price: 115.5, color: C.down, label: "Direnç", dashed: true },
          { type: "hline", price: 99.6, color: C.up, label: "Destek", dashed: true },
          { type: "marker", i: 5, position: "below", color: C.up, text: "Destek" },
          { type: "marker", i: 17, position: "below", color: C.up, text: "Destek" },
          { type: "marker", i: 29, position: "below", color: C.up, text: "Destek" },
          { type: "marker", i: 11, position: "above", color: C.down, text: "Direnç" },
          { type: "marker", i: 23, position: "above", color: C.down, text: "Direnç" },
          { type: "marker", i: 35, position: "above", color: C.down, text: "Direnç" },
          { type: "marker", i: 42, position: "below", color: C.note, text: "Kırılım" },
          { type: "marker", i: 50, position: "below", color: C.trend, text: "Yeni destek" },
          { type: "marker", i: 42, position: "above", shape: "circle", color: C.note, text: "Yüksek hacim", pane: "volume" },
        ],
        legend: [
          { color: C.up, label: "Destek: fiyatın durup yükseldiği taban" },
          { color: C.down, label: "Direnç: fiyatın takılıp düştüğü tavan" },
          { color: C.trend, label: "Kırılan direnç yeni destek oldu" },
        ],
      },
    },
  ],
  steps: [
    "Grafikte fiyatın birden fazla kez dönüş yaptığı yatay bölgeleri ara. Ne kadar çok dokunuş varsa seviye o kadar önemlidir.",
    "Bu seviyeleri tek bir kuruş olarak değil, küçük bir bölge olarak düşün. Fiyat birkaç kuruş aşıp geri dönebilir.",
    "Fiyat desteğe yaklaştığında yukarı dönüş, dirence yaklaştığında aşağı dönüş ihtimalini akılda tut.",
    "Bir kırılımın gerçek olup olmadığını anlamak için kapanışa ve hacme bak: seviyenin net biçimde ötesinde ve yüksek hacimle kapanan mum daha güvenilirdir.",
    "Kırılan direncin yeni destek, kırılan desteğin yeni direnç olabileceğini unutma.",
  ],
  mistakes: [
    "Seviyeyi tam bir sayı sanmak: destek ve direnç birer bölgedir; birkaç kuruşluk aşım \"kırılım\" sayılmaz.",
    "Gün içi kısa bir iğneyi (fitil) kırılım sanmak: önemli olan kapanışın nerede olduğudur.",
    "Tek dokunuşla seviye çizmek: bir kez dönen fiyat henüz güçlü bir destek ya da direnç oluşturmamıştır.",
  ],
  quiz: [
    {
      question: "Destek seviyesi en basit haliyle nedir?",
      options: ["Fiyatın yükselirken takıldığı tavan", "Fiyatın düşerken durup yukarı döndüğü taban", "Bir hissenin halka arz fiyatı"],
      answer: 1,
      explanation: "Destek bir tabandır: o seviyede alıcılar devreye girer ve fiyatın daha fazla düşmesini engeller.",
    },
    {
      question: "Uzun süredir aşılamayan 50 TL'lik direnç, yüksek hacimle net biçimde yukarı kırıldı. Sonra ne olması sık görülür?",
      options: ["50 TL bu kez destek gibi çalışır", "50 TL'nin artık hiçbir önemi kalmaz", "Fiyat hemen 0'a düşer"],
      answer: 0,
      explanation: "Buna rol değişimi denir: kırılan direnç, fiyat geri çekildiğinde çoğu zaman destek olur.",
    },
    {
      question: "Fiyat gün içinde dirençin biraz üstüne çıktı ama günü direncin altında kapattı. Bu bir kırılım mı?",
      options: ["Evet, kesin kırılımdır", "Hayır; kapanış seviyenin altında olduğu için kırılım sayılmaz", "Hacme bakmaya gerek yok, her zaman kırılımdır"],
      answer: 1,
      explanation: "Gün içi aşımlar sık olur. Kapanışın seviyenin net biçimde ötesinde olması ve yüksek hacim, kırılımı daha güvenilir kılar.",
    },
  ],
  tryIt: [
    {
      href: THYAO,
      label: "THYAO grafiğinde seviyeleri bul",
      hint: "3A ya da 1Y aralığını seç. Fiyatın birden çok kez durup döndüğü yatay seviyeleri bul; parmağını grafikte gezdirerek bu seviyelerin fiyatlarını oku.",
    },
  ],
};
