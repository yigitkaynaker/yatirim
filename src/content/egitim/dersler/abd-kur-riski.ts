import type { Lesson } from "../types";

export const abdKurRiski: Lesson = {
  slug: "abd-kur-riski",
  title: "ABD hisselerinde kur riski: dolar ve TL getirisi",
  summary: "Hisse kazandırırken kur yüzünden TL'de daha az (ya da daha çok) kazanmanın mantığı.",
  level: "orta",
  track: "abd",
  minutes: 5,
  what: [
    "ABD hissesi dolarla alınır. Senin cebindeki para ise TL'dir. Bu yüzden TL olarak sonucun iki şeye bağlıdır: hissenin dolar fiyatındaki değişim ve dolar/TL kurundaki değişim.",
    "Yurt dışında çalışıp maaşını dolarla alan birini düşün: maaşı aynı kalsa bile kur yükselince TL karşılığı artar, kur düşünce azalır. Yabancı hissede de aynısı olur.",
    "Formül basittir: TL getirisi ≈ (1 + dolar getirisi) × (1 + kur değişimi) − 1. Hisse %10 artıp kur %20 artarsa TL getirin yaklaşık %32 olur. Hisse %10 artıp kur %5 düşerse TL getirin yaklaşık %4,5'te kalır.",
  ],
  examples: [],
  diagram: {
    id: "kur",
    title: "Hisse ve kur birlikte",
    caption: "Hisse dolar bazında %10 kazandırdı. Kurun değişimini seç ve TL getirisinin nasıl değiştiğini gör. Rakamlar örnektir.",
  },
  steps: [
    "Getirini iki parçaya ayır: hisseden gelen kısım (dolar) ve kurdan gelen kısım. Uygulamadaki \"kur etkisi\" bilgisi tam olarak bunu gösterir.",
    "Hedefini belirle: harcamaların TL ise TL getirisine, dolar birikimi yapıyorsan dolar getirisine bak.",
    "Kurun yükseldiği dönemde yabancı hisse \"çok kazandırmış\" görünebilir; asıl şirket performansını görmek için dolar getirisine de bak.",
    "Yabancı hisse satışından doğan kazancın Türkiye'de beyanı ve hesaplanması (kur, endeksleme) özel kurallara bağlıdır. Ayrıntı için sonraki derse ve resmî kaynaklara bak.",
  ],
  mistakes: [
    "Tüm kazancı şirketin başarısı sanmak; oysa bir kısmı yalnızca kur artışından gelir.",
    "Kur düşerken hisse yükseldiği hâlde TL'de neden kazanmadığını anlamamak.",
    "Kur riskini hiç düşünmeden tüm birikimi tek bir para birimine bağlamak.",
  ],
  quiz: [
    {
      question: "Hisse dolar bazında %0 değişti, dolar/TL %10 arttı. TL getirin yaklaşık nedir?",
      options: ["%0", "%10", "−%10"],
      answer: 1,
      explanation: "Hisse aynı kaldı ama her dolar daha çok TL ediyor; TL getirisi yaklaşık %10.",
    },
    {
      question: "Hisse %10 arttı, kur %20 arttı. TL getirisi yaklaşık kaçtır?",
      options: ["%30", "%32", "%10"],
      answer: 1,
      explanation: "(1,10 × 1,20) − 1 = 0,32, yani yaklaşık %32.",
    },
    {
      question: "Hisse %10 arttı, kur %10 düştü. TL'de sonuç?",
      options: ["Yaklaşık %1 zarar", "%20 kâr", "%10 kâr"],
      answer: 0,
      explanation: "(1,10 × 0,90) − 1 = −0,01. Hisse kazandırsa da kur düşüşü yüzünden TL'de küçük bir zarar oluşur.",
    },
  ],
  tryIt: [
    { href: "/sozluk#kur-etkisi", label: "Sözlükte \"kur etkisi\"", hint: "Portföyündeki dövizli varlıklarda kurun payını nasıl okuyacağını gör." },
    { href: "/hesaplayicilar", label: "Döviz çeviriciyi kullan", hint: "\"Döviz / altın\" sekmesinde aynı dolar tutarının farklı kurlarda kaç TL ettiğini dene." },
  ],
};
