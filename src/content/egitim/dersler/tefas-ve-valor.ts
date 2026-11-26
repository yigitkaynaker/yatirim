import type { Lesson } from "../types";

export const tefasVeValor: Lesson = {
  slug: "tefas-ve-valor",
  title: "TEFAS, fon fiyatı ve valör",
  summary: "Fon alım-satım talimatının ne zaman, hangi fiyattan gerçekleştiğini ve paranın ne zaman hesabına geçtiğini öğren.",
  level: "baslangic",
  track: "fon",
  minutes: 5,
  what: [
    "TEFAS (Türkiye Elektronik Fon Alım Satım Platformu), farklı portföy yönetim şirketlerinin fonlarını tek bir yerde toplayan ortak platformdur. Böylece bir bankadaki hesabından başka bir kurumun fonunu da alabilirsin. Fonların fiyatlarını ve getirilerini tefas.gov.tr'de karşılaştırabilirsin.",
    "Fon fiyatı günde bir kez hesaplanır. Çoğu fonda talimatı verdiğin anda fiyatı bilmezsin; işlemin, talimat saatine göre sonradan açıklanacak fiyattan gerçekleşir. Bunu bir kargo gibi düşün: siparişi verirsin, paket o günün değil ertesi günün seferiyle yola çıkar.",
    "Valör, paranın ya da fon payının hesabına geçtiği gündür. Fonu sattığında para hemen değil, fonun türüne göre birkaç iş günü sonra hesabına geçer. Kısa vadeli fonlarda bu süre kısa, yurt dışı hisse fonlarında daha uzundur. Kesin süre fonun izahnamesinde yazar.",
  ],
  examples: [],
  steps: [
    "Fonun izahnamesinde alım ve satım talimatlarının hangi saate kadar verilmesi gerektiğini ve valör günlerini bul.",
    "Talimatı verdiğin günün kapanış fiyatını değil, işlemin gerçekleşeceği günün fiyatını dikkate al.",
    "Paraya belirli bir tarihte ihtiyacın varsa valör süresini ve araya giren hafta sonu/tatilleri hesaba kat.",
    "Uygulamaya fon alımını, işlemin gerçekleştiği tarihteki fiyat ve pay adediyle gir; böylece maliyetin doğru olur.",
  ],
  mistakes: [
    "Fonu satıp paranın aynı gün hesaba geçeceğini sanmak ve bir ödemeyi kaçırmak.",
    "Günün haberine göre sabah fon alıp o günün fiyatından işlem yapılacağını varsaymak.",
    "Tatil öncesi verilen talimatın kaç gün sonra gerçekleşeceğini hesaba katmamak.",
  ],
  quiz: [
    {
      question: "Valör neyi ifade eder?",
      options: ["Fonun risk değerini", "Paranın ya da payın hesaba geçtiği günü", "Fonun yöneticisini"],
      answer: 1,
      explanation: "Valör, işlemin sonucunun (para ya da pay) hesabına geçtiği tarihtir.",
    },
    {
      question: "Çoğu fonda alım talimatı verdiğinde fiyat ne zaman belli olur?",
      options: ["Talimat anında", "Sonradan açıklanan fiyatla", "Ay sonunda"],
      answer: 1,
      explanation: "Fon fiyatı günde bir kez hesaplanır; işlemin sonradan açıklanan fiyattan gerçekleşir.",
    },
    {
      question: "TEFAS'ın sağladığı temel kolaylık nedir?",
      options: ["Farklı kurumların fonlarını tek platformdan alabilmek", "Fonlara getiri garantisi vermek", "Fon ücretlerini sıfırlamak"],
      answer: 0,
      explanation: "TEFAS, farklı portföy yönetim şirketlerinin fonlarını tek platformda toplar.",
    },
  ],
  tryIt: [
    { href: "/piyasa", label: "Bir fonun sayfasını aç", hint: "Piyasa sayfasında aramaya fon kodunu yaz; fon sayfasında günlük fiyat geçmişini gör." },
    { href: "/islemler", label: "Fon işlemini kaydet", hint: "İşlemler sayfasından fon alımını gerçekleştiği tarih ve fiyatla ekle." },
  ],
};
