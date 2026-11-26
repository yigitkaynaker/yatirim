import type { Lesson } from "../types";
import { detailHref } from "../shared";

export const endeksNedir: Lesson = {
  slug: "endeks-nedir",
  title: "Endeks nedir? BIST 100, S&P 500 ve Nasdaq",
  summary: "Endekslerin bir piyasanın \"ortalama notu\" gibi nasıl hesaplandığını ve ne işe yaradığını öğren.",
  level: "baslangic",
  track: "endeks",
  minutes: 5,
  what: [
    "Endeks, seçilmiş bir grup hissenin toplam fiyat hareketini tek bir sayıyla özetler. BIST 100, Borsa İstanbul'daki 100 büyük şirketi; S&P 500, ABD'deki 500 büyük şirketi; Nasdaq Bileşik ise Nasdaq borsasındaki şirketleri (teknoloji ağırlıklı) izler.",
    "Bir sınıfın not ortalaması gibi düşün: tek bir öğrencinin notu sınıfın genel durumunu anlatmaz, ortalama anlatır. Endeks de piyasanın genel yönünü gösterir.",
    "Endeksler çoğunlukla piyasa değerine göre ağırlıklandırılır: büyük şirketin hareketi endeksi daha çok etkiler. Endeks kendisi alınıp satılabilen bir ürün değildir; ona ETF, endeks fonu ya da vadeli kontrat gibi araçlarla yatırım yapılır.",
  ],
  examples: [],
  steps: [
    "Endeksin hangi şirketleri ve hangi ülkeyi kapsadığını bil. BIST 100 ile S&P 500'ün aynı gün farklı yönlere gitmesi normaldir.",
    "Endeksin puanına değil yüzde değişimine bak: \"100 puan düştü\" endeksin seviyesine göre büyük ya da küçük olabilir.",
    "Kendi portföyünü endeksle kıyasla (benchmark): \"Bu parayı sadece endekse koysaydım ne olurdu?\"",
    "TL bazlı bir endeksi dolar bazlı bir endeksle karşılaştırırken kur farkını unutma.",
  ],
  mistakes: [
    "Tek bir büyük şirketin hareketini tüm piyasanın hareketi sanmak (ya da tersini).",
    "Endeks puanlarını farklı endeksler arasında doğrudan karşılaştırmak.",
    "Endeksin yükseldiği günlerde portföyünün de yükselmesi gerektiğini düşünmek; portföyün endeksten farklı hisselerden oluşabilir.",
  ],
  quiz: [
    {
      question: "BIST 100 neyi ölçer?",
      options: ["Borsa İstanbul'daki 100 büyük şirketin genel fiyat hareketini", "100 TL'nin değerini", "Türkiye'deki 100 bankanın faizini"],
      answer: 0,
      explanation: "BIST 100, Borsa İstanbul'daki büyük şirketlerden oluşan bir sepetin genel hareketini gösterir.",
    },
    {
      question: "Piyasa değeri ağırlıklı bir endekste hangisi endeksi daha çok etkiler?",
      options: ["En küçük şirket", "En büyük şirketler", "Hepsi eşit etkiler"],
      answer: 1,
      explanation: "Büyük şirketlerin ağırlığı fazladır; onların hareketi endeksi daha çok değiştirir.",
    },
    {
      question: "Endekse doğrudan nasıl yatırım yapılır?",
      options: ["Endeksin kendisi satın alınır", "ETF, endeks fonu ya da vadeli kontrat gibi araçlarla", "Yapılamaz"],
      answer: 1,
      explanation: "Endeks bir ölçüdür; ona bağlı ürünlerle yatırım yapılır.",
    },
  ],
  tryIt: [
    { href: detailHref("bist:XU100", "BIST 100"), label: "BIST 100 grafiği", hint: "Aralığı 1Y yapıp Türkiye piyasasının genel yönüne bak." },
    { href: detailHref("foreign:^IXIC", "Nasdaq"), label: "Nasdaq grafiği", hint: "S&P 500 ile karşılaştırıp teknoloji ağırlıklı endeksin ne kadar farklı hareket ettiğini gör." },
  ],
};
