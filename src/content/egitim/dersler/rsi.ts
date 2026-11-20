import { pathCandles } from "../sampleData";
import { C, detailHref } from "../shared";
import type { Lesson } from "../types";

const zones = pathCandles(
  [[0, 112, 0.008], [10, 108, 0.005], [26, 134, 0.008], [36, 124, 0.005], [52, 98, 0.008], [64, 110], [76, 106]],
  { seed: 51, noise: 0.01 },
);

// Uyumsuzluk: ilk yükseliş dik (RSI çok yüksek), ikinci yükseliş daha yüksek ama yavaş (RSI daha düşük)
const divergence = pathCandles(
  [[0, 102, 0.008], [12, 98, 0.004], [26, 124, 0.008], [34, 113, 0.006], [56, 127, 0.008], [70, 112]],
  { seed: 52, noise: 0.008 },
);

export const rsiDersi: Lesson = {
  slug: "rsi",
  title: "RSI: aşırı alım ve aşırı satım",
  summary: "Fiyatın kısa sürede \"fazla mı\" yükseldiğini ya da düştüğünü RSI ile ölçmeyi öğren.",
  level: "orta",
  minutes: 7,
  what: [
    "RSI (Göreceli Güç Endeksi), fiyatın son 14 gündeki yükselişlerini düşüşleriyle karşılaştırıp 0 ile 100 arasında bir sayı verir. Sayı yükseldikçe son günlerde yükselişler daha baskın olmuş demektir.",
    "Bunu bir koşucunun nabzı gibi düşün: çok hızlı koşan birinin nabzı yükselir ve bir süre sonra yavaşlaması gerekir. RSI 70'in üstündeyse fiyat kısa sürede çok koşmuştur (aşırı alım), 30'un altındaysa çok düşmüştür (aşırı satım).",
    "Aşırı alım \"hemen düşecek\" demek değildir; yalnızca yükselişin yorulmuş olabileceğini, dikkatli olmak gerektiğini söyler.",
  ],
  examples: [
    {
      tab: "Aşırı alım / satım",
      caption:
        "Alttaki mor çizgi RSI. Fiyat hızla yükselince RSI 70'in üstüne çıkmış (aşırı alım) ve kısa süre sonra fiyat soluklanmış. Hızlı düşüşte RSI 30'un altına inmiş (aşırı satım), ardından tepki yükselişi gelmiş.",
      chart: {
        candles: zones,
        panes: ["rsi"],
        annotations: [
          { type: "rsiZones", overText: "Aşırı alım", underText: "Aşırı satım" },
          { type: "hline", price: 70, color: C.down, label: "70", pane: "rsi" },
          { type: "hline", price: 30, color: C.up, label: "30", pane: "rsi" },
        ],
        legend: [
          { color: "#a78bfa", label: "RSI (14)" },
          { color: C.down, label: "70 üstü: aşırı alım bölgesi" },
          { color: C.up, label: "30 altı: aşırı satım bölgesi" },
        ],
      },
    },
    {
      tab: "Uyumsuzluk",
      caption:
        "Fiyat ikinci tepede daha yükseğe çıkmış, ama RSI daha alçak bir tepe yapmış. Buna \"negatif uyumsuzluk\" denir: yükseliş devam ediyor gibi görünse de gücünü kaybediyor. Gerçekten de ardından düşüş gelmiş.",
      chart: {
        candles: divergence,
        panes: ["rsi"],
        annotations: [
          { type: "segment", points: [{ i: 26, price: "h" }, { i: 56, price: "h" }], color: C.up, width: 2, label: "Fiyat ↑" },
          { type: "segment", points: [{ i: 26, price: "v" }, { i: 56, price: "v" }], color: C.down, width: 2, pane: "rsi" },
          { type: "marker", i: 26, position: "above", color: C.note, text: "1. tepe" },
          { type: "marker", i: 56, position: "above", color: C.note, text: "2. tepe (daha yüksek)" },
          { type: "marker", i: 56, position: "above", shape: "circle", color: C.down, text: "RSI daha düşük", pane: "rsi" },
        ],
        legend: [
          { color: C.up, label: "Fiyat tepeleri yükseliyor" },
          { color: C.down, label: "RSI tepeleri alçalıyor → uyumsuzluk" },
        ],
      },
    },
  ],
  steps: [
    "RSI'ın hangi bölgede olduğuna bak: 70 üstü aşırı alım, 30 altı aşırı satım, arası normal bölge.",
    "Aşırı bölgeye girmeyi tek başına sinyal sayma; RSI'ın o bölgeden geri çıkmasını (70'in altına inmesini ya da 30'un üstüne çıkmasını) beklemek daha temkinlidir.",
    "Güçlü trendlerde RSI uzun süre 70'in üstünde (ya da 30'un altında) kalabilir. Trendin yönünü de hesaba kat.",
    "Uyumsuzluk ara: fiyat yeni zirve yaparken RSI daha düşük zirve yapıyorsa yükseliş zayıflıyor olabilir. Fiyat yeni dip yaparken RSI daha yüksek dip yapıyorsa düşüş zayıflıyor olabilir.",
    "RSI'ı destek / direnç ve trend gibi diğer araçlarla birlikte kullan.",
  ],
  mistakes: [
    "\"RSI 70'i geçti, hemen satayım\" demek: güçlü bir yükselişte RSI haftalarca yüksek kalabilir.",
    "Uyumsuzluğu kesin dönüş sinyali sanmak: uyumsuzluk bir uyarıdır, dönüşün zamanını söylemez.",
    "RSI'ı tek başına kullanmak: tek bir göstergeye dayalı kararlar sık yanılır.",
  ],
  quiz: [
    {
      question: "RSI 78 olarak görünüyor. Bu ne anlama gelir?",
      options: ["Fiyat kısa sürede çok yükseldi, aşırı alım bölgesinde", "Fiyat çok düştü, aşırı satım bölgesinde", "Hisse %78 kâr ettirir"],
      answer: 0,
      explanation: "70'in üstü aşırı alım bölgesidir: son günlerde yükselişler çok baskın olmuş. Bu bir uyarıdır, kesin satış sinyali değildir.",
    },
    {
      question: "Fiyat yeni bir zirve yaptı ama RSI önceki zirvesinin altında kaldı. Buna ne denir?",
      options: ["Altın kesişim", "Negatif uyumsuzluk", "Hacim patlaması"],
      answer: 1,
      explanation: "Fiyat yükselirken RSI'ın alçalması negatif uyumsuzluktur ve yükselişin güç kaybettiğine işaret eder.",
    },
    {
      question: "Güçlü bir yükseliş trendinde RSI iki haftadır 70'in üstünde. Hangisi doğru?",
      options: ["RSI bozuk, dikkate alma", "Güçlü trendlerde RSI uzun süre yüksek kalabilir; tek başına satış nedeni değildir", "Fiyat ertesi gün kesinlikle düşer"],
      answer: 1,
      explanation: "Aşırı alım, trendin güçlü olduğunu da gösterebilir. Dönüş için RSI'ın 70'in altına inmesi ya da başka teyitler beklenmelidir.",
    },
  ],
  tryIt: [
    {
      href: detailHref("bist:THYAO", "Türk Hava Yolları", { katman: ["rsi"], aralik: "3A" }),
      label: "THYAO grafiğinde RSI",
      hint: "Bağlantı grafiği 3 aylık aralıkta, altta RSI paneliyle açar. Bu aralıkta RSI'ın 70 ya da 30 çizgisine yaklaştığı yerleri bul.",
    },
    {
      href: "/sinyaller",
      label: "Sinyaller sayfası",
      hint: "Sinyaller listesinde her varlığın güncel RSI değerini görebilirsin.",
    },
  ],
};
