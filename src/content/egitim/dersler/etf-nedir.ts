import type { Lesson } from "../types";
import { detailHref } from "../shared";

export const etfNedir: Lesson = {
  slug: "etf-nedir",
  title: "ETF nedir? Borsada işlem gören fonlar ve endeks takibi",
  summary: "Tek bir alımla onlarca şirkete ortak olmanı sağlayan ETF'lerin nasıl çalıştığını öğren.",
  level: "baslangic",
  track: "etf",
  minutes: 5,
  what: [
    "ETF (borsa yatırım fonu), hisse gibi borsada alınıp satılan bir fondur. Çoğu ETF bir endeksi takip eder: örneğin S&P 500'ü takip eden bir ETF, o endeksteki şirketlerin hisselerini aynı oranlarda tutar.",
    "Hazır meyve sepeti gibi düşün: tek tek elma, armut, muz almak yerine hepsinden biraz olan bir sepet alırsın. Tek bir şirket kötü giderse sepetin tamamı çökmez.",
    "Klasik yatırım fonunun fiyatı günde bir kez açıklanır; ETF ise borsa açıkken gün içinde sürekli alınıp satılır. Borsa İstanbul'da işlem gören ETF'ler de vardır, ABD borsalarında ise binlerce ETF bulunur. Endeksi takip eden ETF endeksi yenmeye çalışmaz; endeksin getirisini (ücret düştükten sonra) vermeye çalışır.",
  ],
  examples: [],
  steps: [
    "ETF'in neyi takip ettiğine bak: hangi endeks, hangi ülke, hangi sektör ya da hangi emtia?",
    "Gider oranını kontrol et: fon her yıl varlığından küçük bir yüzde keser (sonraki ders).",
    "İşlem hacmine bak: az işlem gören ETF'lerde alış-satış makası geniş olabilir.",
    "Para birimini düşün: dolar cinsinden bir ETF, ABD hissesi gibi kur riski taşır.",
    "Vergi, ETF'in nerede işlem gördüğüne ve içeriğine (hisse yoğun mu, değil mi) göre değişir. Güncel kuralları gib.gov.tr'den ya da aracı kurumundan kontrol et.",
  ],
  mistakes: [
    "Adında \"teknoloji\" ya da \"altın\" geçti diye içeriğine bakmadan ETF almak.",
    "Kaldıraçlı ya da ters (short) ETF'leri normal ETF sanıp uzun vadede tutmak: bunlar genelde kısa vadeli işlemler için tasarlanır ve uzun vadede endeksten çok farklı sonuç verebilir.",
    "Aynı endeksi takip eden birkaç ETF alıp çeşitlendirdiğini sanmak.",
  ],
  quiz: [
    {
      question: "ETF ile klasik yatırım fonu arasındaki temel fark nedir?",
      options: ["ETF borsada gün içinde alınıp satılır", "ETF'ler hiç ücret almaz", "ETF yalnızca tek bir hisse tutar"],
      answer: 0,
      explanation: "ETF borsa açıkken sürekli işlem görür; klasik fonun fiyatı günde bir kez açıklanır.",
    },
    {
      question: "S&P 500'ü takip eden bir ETF'in hedefi nedir?",
      options: ["Endeksi büyük farkla yenmek", "Endeksin getirisini ücret düştükten sonra yakından vermek", "Sabit faiz ödemek"],
      answer: 1,
      explanation: "Endeks ETF'leri endeksi yenmeye değil, onu takip etmeye çalışır.",
    },
    {
      question: "Aynı endeksi takip eden üç ETF almak ne sağlar?",
      options: ["Gerçek bir çeşitlendirme", "Pek bir şey; aynı sepeti üç kez almış olursun", "Riski üçe böler"],
      answer: 1,
      explanation: "Hepsi aynı hisseleri tutar. Çeşitlendirme için farklı varlıklar gerekir.",
    },
  ],
  tryIt: [
    { href: detailHref("foreign:^GSPC", "S&P 500"), label: "S&P 500 endeksini aç", hint: "Bu endeksi takip eden ETF'lerin hedeflediği getiriyi grafikte gör." },
    { href: "/egitim/cesitlendirme", label: "Çeşitlendirme dersine dön", hint: "ETF'in neden tek hisseye göre daha az riskli olabileceğini hatırla." },
  ],
};
