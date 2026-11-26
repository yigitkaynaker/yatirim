import type { Lesson } from "../types";
import { detailHref } from "../shared";

export const altinMakas: Lesson = {
  slug: "altin-makas",
  title: "Altında makas: alış ve satış fiyatını doğru okumak",
  summary: "Altını aldığın gün satarsan neden zarar ettiğini ve makası nasıl karşılaştıracağını öğren.",
  level: "baslangic",
  track: "altin",
  minutes: 5,
  what: [
    "Kuyumcu, banka ya da aracı kurum altın için iki fiyat verir: sana satacağı fiyat (satış) ve senden alacağı fiyat (alış). Satış fiyatı her zaman daha yüksektir. Aradaki fark makastır.",
    "İkinci el araba gibi düşün: galeriden aldığın arabayı ertesi gün geri satmak istesen, galeri sana daha düşük bir fiyat verir. Arabanın değeri bir günde değişmedi; aradaki fark galerinin payıdır.",
    "Makas ürüne göre değişir: genellikle has gram altında daha dar, işçilikli sikke ve takılarda daha geniştir. Piyasanın çok hareketli olduğu günlerde, hafta sonlarında ve gece saatlerinde de genişleyebilir.",
  ],
  examples: [],
  diagram: {
    id: "altinMakas",
    title: "Alış, satış ve makas",
    caption: "Örnek: gram altında satış 3.050 TL, alış 3.000 TL. Aldığın anda değerin 3.000 TL'dir; başa baş için fiyatın yaklaşık %1,7 artması gerekir. Rakamlar örnektir.",
  },
  steps: [
    "Bir fiyat gördüğünde hangisi olduğunu sor: alış mı, satış mı?",
    "Makas oranını hesapla: (satış − alış) ÷ alış. Farklı yerleri bu oranla karşılaştır.",
    "Başa baş noktasını bil: alış fiyatının, senin ödediğin satış fiyatına çıkması gerekir. Kısa vadeli al-sat yapacaksan bu eşik önemlidir.",
    "Uygulama altın alırken varsayılan olarak satış fiyatını, portföy değerini ise alış fiyatını (bugün satsan eline geçecek tutarı) kullanır; aldığın gün küçük bir zarar görmen bu yüzden normaldir.",
  ],
  mistakes: [
    "Aldığı gün portföyde zarar görüp \"altın düştü\" sanmak; aslında makası görüyorsun.",
    "Makası karşılaştırmadan ilk bakılan yerden almak.",
    "Sık sık al-sat yapıp her seferinde makas ödemek.",
  ],
  quiz: [
    {
      question: "Gram altın: satış 3.100 TL, alış 3.040 TL. Makas oranı yaklaşık nedir?",
      options: ["%0,5", "%2", "%10"],
      answer: 1,
      explanation: "(3.100 − 3.040) ÷ 3.040 ≈ %1,97, yani yaklaşık %2.",
    },
    {
      question: "Altını aldığın anda portföyündeki değeri hangi fiyatla hesaplanır?",
      options: ["Satış fiyatıyla", "Alış fiyatıyla (bugün satsan eline geçecek tutar)", "Ons fiyatıyla"],
      answer: 1,
      explanation: "Gerçekçi değer, satarsan alacağın fiyattır; bu yüzden ilk gün makas kadar eksi görünür.",
    },
    {
      question: "Makas genellikle hangisinde daha geniştir?",
      options: ["Has gram altın", "Yüksek işçilikli takı", "Hepsinde aynıdır"],
      answer: 1,
      explanation: "İşçilik satışta geri alınmadığı için takılarda fark daha büyüktür.",
    },
  ],
  tryIt: [
    { href: detailHref("gold:CEYREK", "Çeyrek Altın"), label: "Çeyrek altın sayfası", hint: "Çeyrek altının fiyatını gram altınla karşılaştır." },
    { href: "/sozluk#makas", label: "Sözlükte \"makas\"", hint: "Makasın dövizde ve altında nasıl işlediğini kısaca oku." },
  ],
};
