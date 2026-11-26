import type { Lesson } from "../types";
import { detailHref } from "../shared";

export const abdHisseleri: Lesson = {
  slug: "abd-hisseleri",
  title: "ABD hisseleri: nasıl alınır, saat kaçta işlem görür?",
  summary: "Türkiye'den ABD borsalarına erişim, Türkiye saatiyle işlem saatleri ve kesirli hisse mantığı.",
  level: "baslangic",
  track: "abd",
  minutes: 6,
  what: [
    "ABD hisseleri, New York Borsası (NYSE) ve Nasdaq gibi borsalarda işlem gören şirketlerin hisseleridir. Türkiye'den bunlara, yurt dışı işlem hizmeti sunan aracı kurumlar ya da bankalar üzerinden ulaşırsın. Hisseler dolarla alınır; TL'n önce dolara çevrilir.",
    "NYSE'nin normal işlem saati New York saatiyle 09:30–16:00'dır. Türkiye yıl boyunca aynı saati kullanır, ABD ise yaz ve kış saati arasında geçiş yapar. Bu yüzden Türkiye saatiyle borsa yazın yaklaşık 16:30–23:00, kışın (kasım başından mart ortasına kadar) 17:30–24:00 arasında açıktır. Bunun dışında daha az işlem gören açılış öncesi ve kapanış sonrası seanslar da vardır.",
    "Bazı aracı kurumlar kesirli hisse sunar: bir hissenin tamamını almak yerine 0,1 ya da 0,25'ini alabilirsin. Bütün bir pizzayı alamıyorsan tek dilim almak gibi; küçük tutarlarla pahalı hisselere ortak olabilirsin. Bu hizmeti her kurum vermez ve kuralları kurumdan kuruma değişir.",
  ],
  examples: [],
  diagram: {
    id: "saatler",
    title: "Türkiye saatiyle işlem saatleri",
    caption:
      "BIST sürekli işlem 10:00–18:00, ABD borsaları normal seansı yazın 16:30–23:00, kışın 17:30–24:00 (Türkiye saati), kripto ise 7/24. ABD tatillerinde ve yarım günlerde saatler değişir; borsanın kendi takvimine bak.",
  },
  steps: [
    "Kurumunun yurt dışı işlem hizmeti verip vermediğini, hangi borsalara eriştiğini ve ücretlerini öğren.",
    "Maliyetleri topla: işlem komisyonu (çoğu zaman dolar cinsinden asgari tutarlı), TL'yi dolara çevirirken ödenen kur makası ve varsa saklama ücreti.",
    "İşlem saatlerini Türkiye saatine çevir; tarih yaz/kış saati değişimine yakınsa bir saatlik farkı unutma.",
    "Açılış öncesi ve kapanış sonrası seanslarda işlem az olur, makas genişler. Yeni başlıyorsan normal seansta, limit emirle işlem yap.",
    "Uygulamaya yabancı hisseni dolar olarak gir; portföy TL karşılığını güncel kurla hesaplar.",
  ],
  mistakes: [
    "Yaz saati değişimini unutup emri bir saat erken ya da geç vermek.",
    "Küçük tutarlı sık işlemlerde dolar cinsinden asgari komisyonun getiriyi yediğini fark etmemek.",
    "TL'yi dolara çevirirken ödenen kur makasını hesaba katmamak.",
  ],
  quiz: [
    {
      question: "Kasım ayında ABD borsalarının normal seansı Türkiye saatiyle kaçta açılır?",
      options: ["09:30", "16:30", "17:30"],
      answer: 2,
      explanation: "New York 09:30'da açılır. Kış saatinde aradaki fark 8 saattir; Türkiye saatiyle 17:30.",
    },
    {
      question: "Kesirli hisse ne demektir?",
      options: ["Hissenin bir bölümünü (örn. 0,25 adet) almak", "Hisseyi taksitle almak", "Değeri düşmüş hisse"],
      answer: 0,
      explanation: "Kesirli hisse, bir hissenin tamamı yerine bir parçasını almaktır. Her aracı kurum sunmaz.",
    },
    {
      question: "ABD hissesi alırken hangisi ek bir maliyettir?",
      options: ["TL'yi dolara çevirirken ödenen kur makası", "BIST 100'ün o günkü değişimi", "Hissenin geçmiş getirisi"],
      answer: 0,
      explanation: "TL'yi dolara çevirirken alış-satış kuru farkı ödersin; bu da maliyete eklenir.",
    },
  ],
  tryIt: [
    { href: detailHref("foreign:^GSPC", "S&P 500"), label: "S&P 500 endeksini aç", hint: "ABD piyasasının genel yönünü görmek için en çok takip edilen endekse bak." },
    { href: "/piyasa", label: "İzleme listesine bir ABD hissesi ekle", hint: "Piyasa sayfasında \"Varlık ekle\" ile Yabancı Hisse türünü seçip sembolünü (örn. bir şirket kodu) yaz." },
  ],
};
