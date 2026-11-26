import type { Lesson } from "../types";

export const etfGiderOrani: Lesson = {
  slug: "etf-gider-orani",
  title: "Gider oranı ve takip farkı: ETF seçerken neye bakılır?",
  summary: "Küçük görünen yıllık ücretlerin uzun vadede birikimi nasıl etkilediğini ve takip farkını öğren.",
  level: "orta",
  track: "etf",
  minutes: 5,
  what: [
    "Gider oranı, fonun yönetimi için her yıl varlığından kestiği yüzdedir. Bu ücret sana fatura olarak gelmez; fonun fiyatına sessizce yansır. %0,1 ile %1 arasındaki fark küçük görünür ama yıllar boyunca bileşik olarak büyür.",
    "Bir su borusundaki küçük sızıntıyı düşün: bir günde fark edilmez, ama yıllar sonra faturada ciddi bir tutar olur.",
    "Takip farkı ise ETF'in getirisinin takip ettiği endeksten ne kadar saptığıdır. Gider oranı, nakit tutma, işlem maliyetleri ve vergiler bu farkı oluşturur. İyi bir endeks ETF'inde takip farkı küçük ve istikrarlıdır.",
  ],
  examples: [],
  diagram: {
    id: "gider",
    title: "Gider oranının 20 yıllık etkisi",
    caption: "100.000 TL, yıllık %8 brüt getiri varsayımıyla 20 yıl. Farklı gider oranlarını seç ve kalan birikimi karşılaştır. Getiri yalnızca örnektir, gelecekteki getiriyi göstermez.",
  },
  steps: [
    "Fonun izahnamesinde ya da tanıtım formunda yıllık gider oranını bul.",
    "Aynı endeksi takip eden ETF'leri karşılaştırırken önce gider oranına, sonra takip farkına ve işlem hacmine bak.",
    "Geçmiş getiriyi karşılaştırırken aynı dönemde endeksin getirisini de yanına koy; fark takip farkıdır.",
    "Uzun vadeli birikimde düşük maliyetli ürünler, aynı riski taşıyan pahalı ürünlere göre avantaj sağlar.",
  ],
  mistakes: [
    "Yalnızca geçen yılın getirisine bakıp gider oranını hiç kontrol etmemek.",
    "\"%1 zaten küçük\" deyip 20 yıllık bileşik etkiyi küçümsemek.",
    "Gider oranı düşük ama çok az işlem gören bir ETF'te geniş makas yüzünden kaybetmek.",
  ],
  quiz: [
    {
      question: "Gider oranı nasıl ödenir?",
      options: ["Her yıl ayrı fatura gelir", "Fonun fiyatına sessizce yansır", "Yalnızca satarken ödenir"],
      answer: 1,
      explanation: "Ücret fonun varlıklarından kesilir; fiyat buna göre oluşur.",
    },
    {
      question: "100.000 TL'lik ETF'te yıllık %1 gider oranı ilk yıl yaklaşık kaç TL'dir?",
      options: ["100 TL", "1.000 TL", "10.000 TL"],
      answer: 1,
      explanation: "100.000 × %1 = 1.000 TL. Birikim büyüdükçe ödenen ücret de büyür.",
    },
    {
      question: "Takip farkı neyi ölçer?",
      options: ["ETF'in endeksten ne kadar saptığını", "Kur değişimini", "Borsanın açılış saatini"],
      answer: 0,
      explanation: "Takip farkı, ETF getirisi ile endeks getirisi arasındaki farktır.",
    },
  ],
  tryIt: [
    { href: "/hesaplayicilar", label: "Birikim planı hesaplayıcısı", hint: "Aynı birikimi farklı yıllık getirilerle dene; 1 puanlık farkın 20 yılda neye dönüştüğünü gör." },
    { href: "/egitim/ucretler-ve-komisyon", label: "Ücretler ve komisyon dersi", hint: "İşlem başına ücretler ile yıllık ücretlerin farkını tekrar et." },
  ],
};
