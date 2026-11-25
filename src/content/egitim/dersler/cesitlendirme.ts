import type { Lesson } from "../types";

export const cesitlendirme: Lesson = {
  slug: "cesitlendirme",
  title: "Çeşitlendirme",
  summary: "Paranı farklı varlıklara bölmenin, tek bir kötü olayın etkisini nasıl azalttığını öğren.",
  level: "baslangic",
  track: "temel",
  minutes: 5,
  what: [
    "Çeşitlendirme, paranı birbirinden farklı davranan varlıklara bölmektir: örneğin birkaç farklı sektörden hisse, biraz altın, bir fon ve biraz döviz. Atasözündeki gibi: bütün yumurtaları aynı sepete koyma.",
    "Bir şirket kötü bir haber aldığında hissesi sert düşebilir. Paranın tamamı o hissedeyse bu düşüşü bütünüyle yaşarsın; paran beş farklı varlığa dağılmışsa aynı düşüş portföyünün yalnızca küçük bir parçasını etkiler.",
    "Çeşitlendirme kaybı tamamen önlemez: bütün piyasa düştüğünde çoğu varlık birlikte düşebilir. Amaç, tek bir hatanın ya da tek bir kötü olayın seni oyundan çıkarmamasıdır.",
  ],
  examples: [],
  diagram: {
    id: "cesitlendirme",
    title: "Tek sepet ve beş sepet",
    caption:
      "Örnek: 100.000 TL. Soldaki portföyün tamamı tek hissede; hisse %30 düşünce 30.000 TL kaybedilir. Sağdaki portföy beş eşit parçaya bölünmüş; aynı hisse %30 düşünce kayıp yalnızca 6.000 TL'dir (diğerleri sabit kalsaydı).",
  },
  steps: [
    "Portföy sayfasındaki varlık dağılımı halkasına bak: paranın ne kadarı tek bir varlıkta?",
    "Risk kartındaki yoğunlaşma puanını kontrol et. 0'a yakın puan dağınık, 100'e yakın puan tek varlıkta toplanmış demektir.",
    "Farklı türleri düşün: hisse, fon, altın, döviz. Aynı sektördeki beş hisse, beş farklı türe göre daha az çeşitlendirme sağlar.",
    "İstersen Risk kartında hedef dağılım belirle (örneğin %50 hisse, %30 altın, %20 fon). Oranlar kaydıkça uygulama dengeleme önerisi gösterir.",
  ],
  mistakes: [
    "Çok sayıda ama birbirine çok benzeyen varlık almak (örneğin hepsi aynı sektörden beş hisse) ve bunu çeşitlendirme sanmak.",
    "Bir varlık çok kazandırdı diye bütün parayı ona kaydırmak.",
    "Çeşitlendirmenin kaybı tamamen ortadan kaldıracağını düşünmek.",
  ],
  quiz: [
    {
      question: "100.000 TL'yi dört eşit parçaya böldün. Parçalardan biri %40 düştü, diğerleri değişmedi. Toplam kayıp ne kadar?",
      options: ["40.000 TL", "10.000 TL", "4.000 TL"],
      answer: 1,
      explanation: "Her parça 25.000 TL. Düşen parçanın kaybı 25.000 × %40 = 10.000 TL; portföyün %10'u.",
    },
    {
      question: "Hangisi daha çeşitlendirilmiş bir portföydür?",
      options: ["Aynı sektörden 5 hisse", "2 hisse, 1 fon, gram altın ve biraz döviz", "Tek bir kripto para"],
      answer: 1,
      explanation: "Farklı türdeki varlıklar farklı nedenlerle hareket eder; tek bir olayın hepsini aynı anda vurma ihtimali daha düşüktür.",
    },
    {
      question: "Çeşitlendirme ile ilgili hangisi doğrudur?",
      options: ["Kaybı tamamen önler", "Tek bir kötü olayın etkisini azaltır", "Getiriyi garanti eder"],
      answer: 1,
      explanation: "Çeşitlendirme riski yayar ama ortadan kaldırmaz; bütün piyasa düşerse çoğu varlık birlikte düşebilir.",
    },
  ],
  tryIt: [
    {
      href: "/",
      label: "Portföyündeki dağılım ve risk kartı",
      hint: "Varlık dağılımı halkasına ve Risk kartındaki yoğunlaşma puanına bak. Sanal portföyde farklı dağılımlar deneyebilirsin.",
    },
    {
      href: "/?mod=sanal",
      label: "Sanal portföyde farklı varlıklar dene",
      hint: "Sanal portföyde birkaç farklı türde varlık al; dağılım halkasının ve yoğunlaşma puanının nasıl değiştiğine bak.",
    },
  ],
};
