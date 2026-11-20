import { pathCandles } from "../sampleData";
import { C, THYAO } from "../shared";
import type { Lesson } from "../types";

// 100 → 160 yükseliş, %50 civarına (≈130) düzeltme, sonra yükselişin devamı
const candles = pathCandles(
  [[0, 100], [30, 160], [36, 137.5], [39, 142], [44, 130.5], [64, 172]],
  { seed: 111, noise: 0.009 },
);

export const fibonacci: Lesson = {
  slug: "fibonacci",
  title: "Fibonacci düzeltme seviyeleri",
  summary: "Bir yükselişten sonra fiyatın nereye kadar geri çekilebileceğini tahmin etmeyi öğren.",
  level: "ileri",
  minutes: 6,
  what: [
    "Fiyat bir yöne güçlü biçimde gittikten sonra genelde nefeslenir ve hareketin bir kısmını geri verir; buna düzeltme denir. Fibonacci düzeltme seviyeleri, bu geri çekilmenin sık sık durduğu oranlardır: %23,6, %38,2, %50 ve %61,8.",
    "Yokuş yukarı koşan birinin arada birkaç adım geri gelip dinlenmesi gibi düşünebilirsin. Fibonacci oranları, bu dinlenmenin hareketin yaklaşık ne kadarını geri alacağına dair bir cetvel gibidir.",
    "Bu seviyeler kesin kurallar değildir; çok sayıda yatırımcı onları izlediği için çoğu zaman destek ya da direnç gibi çalışırlar.",
  ],
  examples: [
    {
      tab: "Düzeltme ve devam",
      caption:
        "Mor çizgiler, yükselişin dibinden (%100) tepesine (%0) çekilen Fibonacci seviyeleri. Fiyat tepeden sonra önce %38,2'de kısa bir duraklama yapmış, sonra %50 seviyesinde durup yeniden yükselişe geçmiş.",
      chart: {
        candles,
        height: 300,
        annotations: [
          { type: "fib", from: { i: 0, price: "l" }, to: { i: 30, price: "h" }, color: C.fib },
          { type: "marker", i: 30, position: "above", color: C.down, text: "Tepe" },
          { type: "marker", i: 44, position: "below", color: C.note, text: "%50'den döndü" },
        ],
        legend: [
          { color: C.fib, label: "Fibonacci seviyeleri: %0 (tepe) … %100 (dip)" },
          { color: C.note, label: "Düzeltmenin durduğu yer" },
        ],
      },
    },
  ],
  steps: [
    "Belirgin bir hareket seç: net bir dip ve net bir tepe olmalı.",
    "Yükselişte seviyeleri dipten tepeye çek: tepe %0, dip %100 olur. Düzeltme seviyeleri arada kalır.",
    "Fiyat geri çekilirken %38,2, %50 ve %61,8 seviyelerinde nasıl davrandığını izle. Bu seviyelerde dönüş mumları ya da artan hacim ara.",
    "Sığ düzeltmeler (%23,6–%38,2) güçlü bir trende, derin düzeltmeler (%61,8 ve ötesi) zayıflayan bir trende işaret eder.",
    "Fiyat %61,8'in de altına kesin biçimde inerse yükselişin tamamen bittiğini düşünmeye başla.",
  ],
  mistakes: [
    "Belirsiz noktalardan seviye çekmek: dip ve tepe herkesin görebileceği kadar belirgin olmalı.",
    "Seviyeleri kesin dönüş noktaları sanmak: fiyat bir seviyede durmak zorunda değildir, birkaç kuruş aşıp dönebilir ya da hiç durmayabilir.",
    "Fibonacci'yi tek başına kullanmak: seviye bir destek, ortalama ya da dönüş mumu ile çakışıyorsa çok daha anlamlıdır.",
  ],
  quiz: [
    {
      question: "Bir hisse 100 TL'den 200 TL'ye yükseldi. %50 düzeltme seviyesi kaç TL'dir?",
      options: ["100 TL", "150 TL", "180 TL"],
      answer: 1,
      explanation: "Hareket 100 TL. Yarısı 50 TL eder; tepeden 50 TL geri çekilme 150 TL'yi verir.",
    },
    {
      question: "Hangisi yaygın kullanılan bir Fibonacci düzeltme oranı değildir?",
      options: ["%38,2", "%61,8", "%75,5"],
      answer: 2,
      explanation: "Sık kullanılan oranlar %23,6, %38,2, %50 ve %61,8'dir. %75,5 bunlardan biri değildir.",
    },
    {
      question: "Düzeltme yalnızca %23,6 seviyesine kadar sürdü ve fiyat yeniden yükseldi. Bu ne anlatır?",
      options: ["Trend çok güçlü olabilir", "Trend kesin bitmiştir", "Fibonacci bu grafikte çalışmaz"],
      answer: 0,
      explanation: "Sığ düzeltmeler, alıcıların fiyatın fazla düşmesine izin vermediğini ve trendin güçlü olduğunu düşündürür.",
    },
  ],
  tryIt: [
    {
      href: THYAO,
      label: "THYAO grafiğinde düzeltme hesapla",
      hint: "1Y aralığında belirgin bir yükseliş bul. Parmağınla dibin ve tepenin fiyatını oku, sonra aradaki farkın %38,2, %50 ve %61,8'ini tepeden çıkararak düzeltme seviyelerini hesapla. Fiyat bu seviyelerden birinde durmuş mu?",
    },
  ],
};
