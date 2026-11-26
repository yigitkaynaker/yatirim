import type { Lesson } from "../types";

export const bistMaliyetVergiRisk: Lesson = {
  slug: "bist-maliyet-vergi-risk",
  title: "BIST'te maliyetler, vergi ve riskler",
  summary: "Hisse alım-satımında komisyonu, temettü stopajını, kazancın vergisini ve başlıca riskleri öğren.",
  level: "baslangic",
  track: "bist",
  minutes: 6,
  what: [
    "Hisse alırken ve satarken aracı kuruma komisyon ödersin; oran kurumdan kuruma değişir ve ücret tablosunda yazar. Az işlem gören hisselerde alış ile satış fiyatı arasındaki fark (makas) da gizli bir maliyettir.",
    "Vergide iki ayrı konu vardır. Birincisi temettü: şirketin dağıttığı kâr payından kaynakta stopaj kesilir. Gelir İdaresi'nin duyurusuna göre bu oran 22 Aralık 2024'ten itibaren %15'tir. İkincisi alım-satım kazancı: Borsa İstanbul'da işlem gören hisselerde bireysel yatırımcının alım-satım kazancı için uzun süredir %0 stopaj uygulanmaktadır (bazı yatırım ortaklığı hisseleri gibi istisnalar vardır).",
    "Vergi oranları Cumhurbaşkanı kararıyla değişebilir. Buradaki bilgiler genel çerçevedir; güncel oranı gib.gov.tr'den ya da bir mali müşavirden kontrol et.",
  ],
  examples: [],
  diagram: {
    id: "stopaj",
    title: "Temettüde brütten nete",
    caption: "1.000 TL brüt temettüden %15 stopaj (22.12.2024'ten bu yana geçerli oran) kesilince hesabına 850 TL net yatar. Oran değişirse net tutar da değişir.",
  },
  steps: [
    "Her işlemde toplam maliyeti düşün: alış komisyonu + satış komisyonu + (az işlem gören hissede) makas.",
    "Temettü duyurularında açıklanan tutar çoğunlukla brüttür. Net tutarı bulmak için stopajı düş.",
    "Riskleri ayır: şirket riski (şirketin kötü gitmesi), piyasa riski (tüm borsanın düşmesi), likidite riski (satmak istediğinde alıcı bulamamak) ve enflasyon karşısında reel getiri.",
    "Şirketin önemli açıklamalarını KAP'tan takip et; söylentiyle değil resmî bildirimle hareket et.",
  ],
  mistakes: [
    "Temettü tarihinden hemen önce yalnızca temettü için hisse almak: temettü dağıtılınca hisse fiyatı genellikle o kadar düşer, üstüne stopaj ödenir.",
    "Kazancı TL olarak ölçüp enflasyonu hesaba katmamak.",
    "Komisyon oranını öğrenmeden çok sık al-sat yapmak.",
  ],
  quiz: [
    {
      question: "2.000 TL brüt temettüden %15 stopaj kesilirse net ne yatar?",
      options: ["2.000 TL", "1.700 TL", "300 TL"],
      answer: 1,
      explanation: "Stopaj 2.000 × %15 = 300 TL. Net = 1.700 TL.",
    },
    {
      question: "Satmak istediğinde yeterli alıcı bulamama riskine ne denir?",
      options: ["Kur riski", "Likidite riski", "Temettü riski"],
      answer: 1,
      explanation: "Az işlem gören hisselerde istediğin fiyattan hemen satamayabilirsin; buna likidite riski denir.",
    },
    {
      question: "Vergi oranlarıyla ilgili en doğru davranış hangisi?",
      options: ["Bir kez öğrenip hep aynı kabul etmek", "Güncel oranı resmî kaynaktan kontrol etmek", "Arkadaşın söylediği oranı kullanmak"],
      answer: 1,
      explanation: "Oranlar kararla değişebilir; gib.gov.tr gibi resmî kaynaklara bak.",
    },
  ],
  tryIt: [
    { href: "/temettu", label: "Temettü sayfası", hint: "Onayladığın temettülerin brüt, stopaj ve net tutarlarını ayrı ayrı gör." },
    { href: "/kap", label: "KAP bildirimleri", hint: "Portföyündeki şirketlerin resmî açıklamalarını buradan takip et." },
  ],
};
