import type { Lesson } from "../types";
import { detailHref } from "../shared";

export const dovizMaliyetRisk: Lesson = {
  slug: "doviz-maliyet-risk",
  title: "Dövizde maliyetler, vergi ve riskler",
  summary: "Döviz alırken ödenen makas ve vergiyi, mevduat seçeneklerini ve dövizin kendi risklerini öğren.",
  level: "baslangic",
  track: "doviz",
  minutes: 5,
  what: [
    "Dövizin en büyük maliyeti genellikle makastır. Buna ek olarak, bireylerin döviz alımında kambiyo işlemleri üzerinden bir vergi (banka ve sigorta muameleleri vergisi) kesilebilir. Bu verginin oranı ve kapsamı zaman zaman değiştiği için güncel durumu bankandan ya da gib.gov.tr'den kontrol et.",
    "Dövizi hesapta tutmanın da seçenekleri vardır: vadesiz döviz hesabı faiz getirmez; vadeli döviz mevduatı düşük de olsa faiz getirebilir ve bu faizden stopaj kesilir. Oranlar dönemden döneme değişir.",
    "Döviz \"risksiz\" değildir. TL değer kazanırsa döviz birikimin TL olarak erir. Bir şemsiyeyi düşün: yağmurda işe yarar, güneşli günde elinde fazla yük olur. Dövizi bir koruma aracı olarak görmek mantıklıdır; tek başına kazanç makinesi olarak görmek değil.",
  ],
  examples: [],
  steps: [
    "Toplam maliyeti hesapla: makas + (varsa) vergi + (fiziki ise) taşıma ve saklama riski.",
    "Getirini enflasyonla karşılaştır: dövizin TL karşılığı %30 arttıysa ve enflasyon %40 ise reel olarak kaybetmişsin demektir.",
    "Birikiminin tamamını tek bir para birimine bağlama; dövizi çeşitlendirmenin bir parçası olarak düşün.",
    "Uygulamada döviz pozisyonlarının değeri güncel kurla hesaplanır; kur etkisini portföy sayfasında izleyebilirsin.",
  ],
  mistakes: [
    "Döviz alımında kesilen vergiyi ve makası hesaba katmadan kâr hesabı yapmak.",
    "Kurun ani yükseldiği panik anlarında yüksek makasla alım yapmak.",
    "TL karşılığı artan dövizi reel kazanç sanmak; enflasyonu unutmak.",
  ],
  quiz: [
    {
      question: "Döviz birikimin TL olarak %25 arttı, aynı dönemde enflasyon %35. Reel olarak ne oldu?",
      options: ["Kazandın", "Satın alma gücün azaldı", "Değişmedi"],
      answer: 1,
      explanation: "Fiyatlar senin birikiminden hızlı arttı; reel getirin negatif.",
    },
    {
      question: "Vadesiz döviz hesabı genellikle ne getirir?",
      options: ["Yüksek faiz", "Faiz getirmez", "Temettü"],
      answer: 1,
      explanation: "Vadesiz hesap parayı tutar ama faiz getirmez; kazanç yalnızca kur değişiminden gelir.",
    },
    {
      question: "Döviz alımında kesilebilen vergi için doğru yaklaşım?",
      options: ["Oranı bir kez öğrenip unutmak", "Güncel oranı banka ya da gib.gov.tr'den kontrol etmek", "Vergi olmadığını varsaymak"],
      answer: 1,
      explanation: "Bu verginin oranı ve kapsamı değişebilir; güncel bilgi resmî kaynaktadır.",
    },
  ],
  tryIt: [
    { href: detailHref("fx:EUR", "EUR/TRY"), label: "Euro/TL grafiği", hint: "Dolar ile euronun TL karşısında aynı hızda hareket edip etmediğini karşılaştır." },
    { href: "/hesaplayicilar", label: "Reel getiri hesaplayıcısı", hint: "Döviz getirini enflasyonla karşılaştırıp gerçek kazancını bul." },
  ],
};
