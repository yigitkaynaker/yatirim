import type { Lesson } from "../types";
import { BTC } from "../shared";

export const kriptoBorsaVePariteler: Lesson = {
  slug: "kripto-borsa-ve-pariteler",
  title: "Kripto borsaları, USDT ve TL pariteleri",
  summary: "Kripto nereden alınır, BTC/USDT ile BTC/TRY neden farklı fiyat gösterir ve Türkiye'de hangi kurallar geçerlidir?",
  level: "baslangic",
  track: "kripto",
  minutes: 6,
  what: [
    "Kripto paralar çoğunlukla kripto borsalarında (alım-satım platformlarında) alınır. Platform, alıcı ile satıcıyı buluşturan bir pazar yeri gibidir. Türkiye'de 2 Temmuz 2024'te Resmî Gazete'de yayımlanan 7518 sayılı Kanun'la bu platformlar \"kripto varlık hizmet sağlayıcı\" olarak Sermaye Piyasası Kurulu'nun (SPK) iznine ve denetimine bağlandı.",
    "Parite, bir şeyin fiyatının neyle ölçüldüğünü söyler. BTC/USDT paritesi \"1 Bitcoin kaç USDT eder\", BTC/TRY paritesi \"1 Bitcoin kaç TL eder\" demektir. Pazarda elmayı kiloyla ya da kasayla almak gibi: elma aynı, ölçü birimi farklı.",
    "TL paritesindeki fiyat kabaca \"USDT fiyatı × USDT'nin TL kuru\" kadardır. Bu yüzden Bitcoin'in dolar fiyatı hiç değişmese bile dolar/TL yükselirse TL fiyatı da yükselir. TL ile alım yaparsan hem kriptonun hem de kurun hareketini taşırsın.",
  ],
  examples: [],
  steps: [
    "Platform seçmeden önce SPK'nın internet sitesinde (spk.gov.tr) yayımlanan kripto varlık hizmet sağlayıcı listelerini kontrol et. İzin durumu zaman içinde değişebilir; güncel listeye bak.",
    "Maliyetleri topla: alım-satım komisyonu (platformun ücret tablosunda yazar), alış ile satış fiyatı arasındaki makas ve para çekme ücreti. Az işlem gören kriptolarda makas daha geniştir.",
    "TL ile mi, USDT ile mi işlem yapacağına karar ver. TL'den USDT'ye geçerken de bir kur ve komisyon ödersin; her ara adım ek maliyettir.",
    "Kâr ya da zararını hangi para biriminde ölçtüğünü bil: Bitcoin dolar bazında düşerken TL bazında yükselebilir. Uygulama kripto fiyatlarını dolar olarak gösterir ve portföyde TL'ye çevirir.",
    "Vergi: kripto varlıkların vergilendirilmesine ilişkin düzenlemeler gündemde ve değişebiliyor. Güncel durumu Gelir İdaresi Başkanlığı'ndan (gib.gov.tr) ya da bir mali müşavirden kontrol et.",
  ],
  mistakes: [
    "Sosyal medyada önerilen, izin durumu belli olmayan bir platforma para göndermek.",
    "BTC/TRY ile BTC/USDT fiyatını karşılaştırıp \"arbitraj fırsatı\" sanmak: aradaki farkın çoğu kur, komisyon ve makastır.",
    "Gece yarısı yaşanan sert düşüşte panikle piyasa emriyle satıp geniş makas yüzünden ek zarar etmek.",
  ],
  quiz: [
    {
      question: "BTC/USDT fiyatı aynı kaldı, ama USDT/TL kuru %5 arttı. BTC/TRY fiyatına ne olur (yaklaşık)?",
      options: ["Değişmez", "Yaklaşık %5 artar", "Yaklaşık %5 düşer"],
      answer: 1,
      explanation: "TL fiyatı ≈ USDT fiyatı × kur. Kur %5 artınca TL fiyatı da yaklaşık %5 artar.",
    },
    {
      question: "Türkiye'de kripto alım-satım platformlarını hangi kurum izinlendirir ve denetler?",
      options: ["Sermaye Piyasası Kurulu (SPK)", "Borsa İstanbul", "Platformlar hiçbir kuruma bağlı değildir"],
      answer: 0,
      explanation: "7518 sayılı Kanun'la kripto varlık hizmet sağlayıcıları SPK iznine ve denetimine bağlandı.",
    },
    {
      question: "Aşağıdakilerden hangisi kripto işleminin maliyetine dahil DEĞİLDİR?",
      options: ["Komisyon", "Makas", "Bitcoin ağının kaç yaşında olduğu"],
      answer: 2,
      explanation: "Komisyon, makas, para çekme ücreti ve kur dönüşümleri maliyettir; ağın yaşı değildir.",
    },
  ],
  tryIt: [
    { href: BTC, label: "Bitcoin'in dolar fiyatına bak", hint: "Uygulama kriptoyu dolar olarak gösterir; TL karşılığını portföyde görürsün." },
    { href: "/hesaplayicilar", label: "Döviz çeviriciyle TL karşılığını hesapla", hint: "\"Döviz / altın\" sekmesinde dolar tutarını TL'ye çevirip kurun etkisini gör." },
  ],
};
