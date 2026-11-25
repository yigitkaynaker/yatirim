import type { Lesson } from "../types";

export const vergiTemelleriStopaj: Lesson = {
  slug: "vergi-temelleri-stopaj",
  title: "Vergi temelleri: stopaj",
  summary: "Stopajın ne olduğunu, brüt ile net arasındaki farkı ve neden güncel kuralları kontrol etmen gerektiğini öğren.",
  level: "baslangic",
  track: "temel",
  minutes: 5,
  what: [
    "Stopaj, kazancın üzerinden sana ödenmeden önce kesilen vergidir. Bankadaki faizin, hisseden aldığın temettünün ve bazı fon kazançlarının vergisi bu yolla kesilir; parayı ödeyen kurum vergiyi devlete senin adına yatırır.",
    "Maaş bordrosunu düşün: brüt maaşından vergi kesilir, hesabına net maaş yatar. Stopaj da böyledir: ilan edilen tutar brüttür, eline geçen nettir.",
    "Stopaj oranları varlık türüne, elde tutma süresine ve tarihe göre farklıdır ve sık sık değişir. Bu ders genel mantığı anlatır; vergi tavsiyesi değildir. Kendi durumun için güncel mevzuatı resmî kaynaklardan ya da bir mali müşavirden kontrol et.",
  ],
  examples: [],
  diagram: {
    id: "stopaj",
    title: "Brütten nete",
    caption:
      "Örnek: 1.000 TL brüt temettü. Oranın %15 olduğu varsayılırsa 150 TL stopaj kesilir ve hesabına 850 TL net yatar. Oran farklıysa net tutar da farklı olur; buradaki oran yalnızca örnektir.",
  },
  steps: [
    "Bir kazanç gördüğünde önce sor: bu rakam brüt mü, net mi? Banka ve şirket duyuruları çoğunlukla brüt tutarı söyler.",
    "Net = Brüt − Stopaj. Stopaj = Brüt × oran. Karşılaştırmaları (örneğin mevduat ile temettü) her zaman net tutarla yap.",
    "Uygulamada temettü önerileri, Ayarlar'da yazdığın stopaj oranıyla net hesaplanır. Bankana yatan tutar farklıysa \"Düzenle\" ile gerçek tutarı gir.",
    "Pozisyon sayfasındaki \"Şimdi satarsam\" kutusu varlık türüne göre kısa bir vergi notu gösterir; bu not bilgilendirme amaçlıdır.",
    "Yıl sonunda Rapor sayfasındaki yıllık gerçekleşen kazanç raporu brüt, stopaj ve net tutarları bir arada gösterir. Bazı kazançlar için ayrıca beyanname gerekebilir; bu rapor resmî beyan yerine geçmez.",
  ],
  mistakes: [
    "Brüt tutarı cebe girecek para sanmak ve hesapları buna göre yapmak.",
    "Bir yıl önce öğrenilen oranın hâlâ geçerli olduğunu varsaymak: oranlar değişebilir.",
    "Uygulamadaki tahmini rakamları resmî vergi hesabı yerine kullanmak.",
  ],
  quiz: [
    {
      question: "2.000 TL brüt faiz kazancından %10 stopaj kesilirse eline ne geçer?",
      options: ["2.000 TL", "1.800 TL", "200 TL"],
      answer: 1,
      explanation: "Stopaj 2.000 × %10 = 200 TL. Net = 2.000 − 200 = 1.800 TL. (Oran yalnızca örnektir.)",
    },
    {
      question: "Stopajı en iyi hangisi tanımlar?",
      options: ["Aracı kurumun aldığı ücret", "Kazanç sana ödenmeden önce kesilen vergi", "Alış ile satış fiyatı arasındaki fark"],
      answer: 1,
      explanation: "Komisyon aracı kurumun ücretidir, makas alış-satış farkıdır. Stopaj ise kaynağında kesilen vergidir.",
    },
    {
      question: "Stopaj oranlarıyla ilgili en doğru yaklaşım hangisi?",
      options: ["Bir kez öğrenip hep aynı kabul etmek", "Güncel mevzuatı ve kendi durumunu kontrol etmek", "Uygulamadaki oranı resmî kabul etmek"],
      answer: 1,
      explanation: "Oranlar varlığa, süreye ve tarihe göre değişir. Uygulama yalnızca bilgilendirir; güncel kurallar için resmî kaynaklara bak.",
    },
  ],
  tryIt: [
    {
      href: "/hesaplayicilar",
      label: "Mevduat hesaplayıcısında brüt ve neti karşılaştır",
      hint: "Mevduat getirisi hesaplayıcısı, girdiğin stopaj oranıyla net getiriyi gösterir. Farklı oranlar deneyip farkı gör.",
    },
    {
      href: "/temettu",
      label: "Temettü sayfası",
      hint: "Onayladığın temettülerde brüt, stopaj ve net tutar ayrı ayrı görünür.",
    },
    {
      href: "/rapor",
      label: "Yıllık gerçekleşen kazanç raporu",
      hint: "Yıl yıl gerçekleşen K/Z, temettü brüt/stopaj/net ve komisyon. Resmî beyan değildir.",
    },
  ],
};
