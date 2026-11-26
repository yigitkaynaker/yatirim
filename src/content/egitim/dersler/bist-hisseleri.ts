import type { Lesson } from "../types";
import { THYAO, detailHref } from "../shared";

export const bistHisseleri: Lesson = {
  slug: "bist-hisseleri",
  title: "BIST hisseleri: nedir, nasıl alınır, ne zaman işlem görür?",
  summary: "Borsa İstanbul'da hisse almak için gerekenleri, lotu, seans saatlerini ve fiyat adımını öğren.",
  level: "baslangic",
  track: "bist",
  minutes: 6,
  what: [
    "Hisse senedi, bir şirketin küçük bir parçasına ortak olmaktır. Borsa İstanbul (BIST), Türkiye'deki şirketlerin hisselerinin alınıp satıldığı resmî pazardır. Şirket iyi giderse hissenin değeri artabilir ve kârından pay (temettü) dağıtabilir; kötü giderse değeri düşer.",
    "Hisseyi doğrudan borsadan değil, bir aracı kurum ya da bankanın yatırım hesabı üzerinden alırsın. Pay piyasasında 1 lot 1 adet hisse demektir; 1 lot THYAO almak, 1 adet THYAO hissesi almaktır.",
    "Borsa İstanbul pay piyasası hafta içi ve resmî tatiller dışında açıktır. Sabah açılış seansında (yaklaşık 09:40'tan itibaren) emirler toplanır, 10:00–18:00 arasında sürekli işlem yapılır, 18:00'den sonra birkaç dakikalık kapanış seansı vardır. Yarım günlerde (örneğin bayram arifeleri) saatler kısalır.",
  ],
  examples: [],
  steps: [
    "Lisanslı bir aracı kurumda ya da bankanda yatırım hesabı aç ve hesaba TL yatır.",
    "Almak istediğin hisseyi kodundan bul (THYAO, BIMAS gibi) ve emrini ver: belirli fiyattan almak için limit emir, o anki fiyattan almak için piyasa emri.",
    "Fiyatlar belirli adımlarla hareket eder (fiyat adımı). Örneğin Borsa İstanbul'un tablosuna göre 100–249,99 TL arasındaki hisselerde fiyat 0,10 TL'lik adımlarla değişir. Güncel tabloyu borsaistanbul.com'dan kontrol et.",
    "Uygulamada BIST fiyatları gecikmeli olabilir; işlem yapmadan önce aracı kurumundaki anlık fiyata bak.",
    "Aldığın hisseyi uygulamaya işlem olarak gir; böylece ortalama maliyetini ve kâr/zararını takip edersin.",
  ],
  mistakes: [
    "Seans açılmadan önce verilen piyasa emrinin hangi fiyattan gerçekleşeceğini bilmeden emir vermek.",
    "Hisse fiyatının düşük olmasını \"ucuz\" sanmak: 5 TL'lik hisse 500 TL'lik hisseden daha ucuz olmak zorunda değildir; önemli olan şirketin değeridir.",
    "Tek bir hisseye, duyduğu bir habere güvenerek tüm birikimini yatırmak.",
  ],
  quiz: [
    {
      question: "Borsa İstanbul pay piyasasında sürekli işlem hangi saatler arasındadır (tam gün)?",
      options: ["09:00–17:00", "10:00–18:00", "Günün her saati"],
      answer: 1,
      explanation: "Sürekli işlem 10:00–18:00 arasındadır; öncesinde açılış, sonrasında kısa bir kapanış seansı vardır.",
    },
    {
      question: "BIST'te 25 lot hisse almak ne demektir?",
      options: ["25 adet hisse almak", "2.500 adet hisse almak", "25 TL'lik hisse almak"],
      answer: 0,
      explanation: "Pay piyasasında 1 lot 1 adet hisseye eşittir.",
    },
    {
      question: "Hisseyi kimin üzerinden alırsın?",
      options: ["Doğrudan şirketten", "Lisanslı bir aracı kurum ya da bankanın yatırım hesabı üzerinden", "Bu uygulama üzerinden"],
      answer: 1,
      explanation: "Alım-satım aracı kurum üzerinden yapılır. Bu uygulama yalnızca kayıt tutar ve takip eder.",
    },
  ],
  tryIt: [
    { href: THYAO, label: "Örnek bir BIST hissesi sayfası aç", hint: "Fiyat, grafik ve gecikme bilgisini gör; aralığı değiştirip geçmişe bak." },
    { href: detailHref("bist:XU100", "BIST 100"), label: "BIST 100 endeksine bak", hint: "Tek bir hisseyi genel piyasayla karşılaştırmak için endeks grafiğini kullan." },
  ],
};
