import type { Lesson } from "../types";
import { detailHref } from "../shared";

export const altinTurleri: Lesson = {
  slug: "altin-turleri",
  title: "Altın türleri: gram, çeyrek, cumhuriyet ve has altın",
  summary: "Ayar, ağırlık ve işçilik farkıyla altın türlerinin fiyatının nasıl oluştuğunu öğren.",
  level: "baslangic",
  track: "altin",
  minutes: 6,
  what: [
    "Altının fiyatı dünyada ons cinsinden ve dolarla belirlenir; 1 ons yaklaşık 31,1 gramdır. Türkiye'deki gram altın fiyatı kabaca şöyle hesaplanır: ons fiyatı (dolar) × dolar/TL kuru ÷ 31,1. Yani altının TL fiyatı hem ons fiyatına hem de kura bağlıdır.",
    "Has altın 24 ayar, yani neredeyse saf altındır (binde 995 gibi saflıklar). Gram altın çoğunlukla bu saflıktaki külçe ya da hesaptaki altındır. Çeyrek, yarım, tam ve cumhuriyet altını ise 22 ayar (yaklaşık binde 916 saflık) sikkelerdir; örneğin çeyrek altın yaklaşık 1,75 gram, cumhuriyet altını yaklaşık 7,2 gram ağırlığındadır.",
    "Sikke ve takıların fiyatına ayrıca işçilik ve kuyumcu payı eklenir. Bu yüzden 4 çeyrek altın, 1 tam altınla ya da 7 gram has altınla aynı fiyat olmayabilir. Ekmeği fırından ya da pastaneden almak gibi: un aynı, emek ve paket farklı.",
  ],
  examples: [],
  steps: [
    "Neyi aldığını netleştir: has (24 ayar) mı, 22 ayar sikke mi, takı mı? Yatırım amaçlı alımda işçilik payı düşük ürünler maliyeti azaltır.",
    "Gram başına has altın karşılığını hesapla: ağırlık × saflık. Çeyrek ≈ 1,75 × 0,916 ≈ 1,6 gram has altın.",
    "Fiyatı ons ve kur ile kontrol et: ons sabitken kur yükselirse gram altın TL olarak yükselir.",
    "Uygulamada altın türünü doğru seç (gram, çeyrek, cumhuriyet…); değer, o türün güncel alış fiyatıyla hesaplanır.",
  ],
  mistakes: [
    "Çeyrek altının fiyatını \"1,75 × gram fiyatı\" sanmak: ayar ve işçilik farkını unutmak.",
    "Yatırım için yüksek işçilikli takı almak ve satarken işçiliğin geri alınmadığını görmek.",
    "Altının TL fiyatındaki artışın tamamını altının değerlenmesi sanmak; bir kısmı kurdan gelir.",
  ],
  quiz: [
    {
      question: "Ons altın 2.000 dolar, dolar/TL 40. Gram altın yaklaşık kaç TL olur?",
      options: ["Yaklaşık 2.570 TL", "Yaklaşık 80.000 TL", "Yaklaşık 50 TL"],
      answer: 0,
      explanation: "2.000 × 40 ÷ 31,1 ≈ 2.572 TL. Rakamlar örnektir.",
    },
    {
      question: "Çeyrek altın kaç ayardır?",
      options: ["24 ayar", "22 ayar", "14 ayar"],
      answer: 1,
      explanation: "Çeyrek, yarım, tam ve cumhuriyet altını 22 ayar sikkelerdir.",
    },
    {
      question: "Ons fiyatı değişmedi, dolar/TL %10 arttı. Gram altına ne olur (yaklaşık)?",
      options: ["Değişmez", "TL olarak yaklaşık %10 artar", "Yaklaşık %10 düşer"],
      answer: 1,
      explanation: "Gram altın ≈ ons × kur ÷ 31,1; kur artınca TL fiyatı da artar.",
    },
  ],
  tryIt: [
    { href: detailHref("gold:GRAM", "Gram Altın"), label: "Gram altın sayfası", hint: "Gram altının TL fiyatını ve geçmişini gör." },
    { href: detailHref("foreign:GC=F", "Ons Altın"), label: "Ons altınla karşılaştır", hint: "Aynı dönemde ons (dolar) ve gram (TL) grafiğini karşılaştırıp kur etkisini fark et." },
  ],
};
