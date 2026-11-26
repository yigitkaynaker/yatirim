import type { Lesson } from "../types";

export const fonTurleri: Lesson = {
  slug: "fon-turleri",
  title: "Yatırım fonu türleri: hangi fon ne yapar?",
  summary: "Para piyasası, borçlanma araçları, hisse, altın, karma ve serbest fonların farkını öğren.",
  level: "baslangic",
  track: "fon",
  minutes: 6,
  what: [
    "Yatırım fonu, birçok kişinin parasını bir araya getirip uzman bir portföy yöneticisinin yönettiği ortak bir sepettir. Sen sepetten pay alırsın; payın fiyatı her iş günü bir kez açıklanır.",
    "Fonlar neye yatırım yaptıklarına göre ayrılır. Para piyasası fonları çok kısa vadeli, düşük riskli araçlara yatırır. Borçlanma araçları fonları tahvil ve bonolara yatırır. Hisse senedi (yoğun) fonları ağırlıklı olarak hisselere, kıymetli maden fonları altın ve gümüşe yatırır. Karma ve değişken fonlar bunları karıştırır. Serbest fonlar daha esnek kurallarla yönetilir ve genellikle nitelikli yatırımcılara yöneliktir.",
    "Bir restoran menüsü gibi düşün: \"hafif\" (para piyasası), \"doyurucu\" (hisse) ve \"karışık tabak\" (karma) seçenekler var. Hangisini seçeceğin açlığına, yani hedefine ve ne kadar risk taşıyabileceğine bağlıdır.",
  ],
  examples: [],
  steps: [
    "Fonun adına değil, izahnamesindeki yatırım stratejisine ve risk değerine bak. Fonlar 1'den 7'ye kadar bir risk göstergesiyle sınıflandırılır; sayı büyüdükçe dalgalanma da artar.",
    "Fonun içeriğini (portföy dağılım raporu) kontrol et: \"teknoloji fonu\" gerçekte neye yatırım yapıyor?",
    "Yıllık yönetim ücretini karşılaştır; benzer içerikli iki fonda ücret farkı uzun vadede önemlidir.",
    "Geçmiş getiriyi aynı türdeki fonlarla ve ilgili endeksle kıyasla; tek başına geçmiş getiri geleceği göstermez.",
    "Uygulamaya fonu TEFAS fon koduyla (3 karakter) ekle; fiyatı her iş günü güncellenir.",
  ],
  mistakes: [
    "Geçen yıl en çok kazandıran fonu, içeriğine bakmadan almak.",
    "Para piyasası fonunu hisse fonu gibi yüksek getiri beklentisiyle almak (ya da tersi: hisse fonunu risksiz sanmak).",
    "Aynı türden birçok fon alıp çeşitlendirdiğini sanmak.",
  ],
  quiz: [
    {
      question: "Hangi fon türü genellikle en düşük dalgalanmaya sahiptir?",
      options: ["Para piyasası fonu", "Hisse senedi yoğun fon", "Kıymetli maden fonu"],
      answer: 0,
      explanation: "Para piyasası fonları çok kısa vadeli, düşük riskli araçlara yatırım yapar.",
    },
    {
      question: "Fonun risk göstergesi 6 ise ne anlarsın?",
      options: ["Çok düşük risk", "Yüksek dalgalanma beklenir", "Fon 6 yıllıktır"],
      answer: 1,
      explanation: "Risk göstergesi 1–7 arasıdır; büyüdükçe fiyat dalgalanması artar.",
    },
    {
      question: "Fon seçerken hangisi tek başına yeterli DEĞİLDİR?",
      options: ["Geçmiş getiri", "İzahname ve içerik", "Yönetim ücreti"],
      answer: 0,
      explanation: "Geçmiş getiri geleceği garanti etmez; içerik, risk ve ücretle birlikte değerlendirilmelidir.",
    },
  ],
  tryIt: [
    { href: "/piyasa", label: "İzleme listene bir fon ekle", hint: "Piyasa sayfasında \"Varlık ekle\" ile Fon türünü seçip TEFAS fon kodunu yaz." },
    { href: "/sozluk#fon", label: "Sözlükte \"fon\"", hint: "Fonun kısa tanımını ve örneğini oku." },
  ],
};
