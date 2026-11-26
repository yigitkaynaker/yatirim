import type { Lesson } from "../types";
import { detailHref } from "../shared";

export const dovizNedir: Lesson = {
  slug: "doviz-nedir",
  title: "Döviz: kur nasıl oluşur, nereden alınır?",
  summary: "Kurun neden değiştiğini, parite kavramını ve alış-satış kurları arasındaki farkı öğren.",
  level: "baslangic",
  track: "doviz",
  minutes: 5,
  what: [
    "Döviz, başka bir ülkenin parasıdır (dolar, euro, sterlin gibi). Kur, bir birim dövizin kaç TL ettiğidir: örneğin USD/TRY 40 ise 1 dolar 40 TL eder. İki yabancı paranın birbirine oranına parite denir; EUR/USD 1,08 ise 1 euro 1,08 dolar eder.",
    "Kur, dövize olan talep ve arzla oluşur. Faiz oranları, enflasyon farkı, ihracat-ithalat dengesi ve beklentiler bu dengeyi etkiler. Döviz piyasası hafta içi neredeyse 24 saat işler; hafta sonu ise bankalar genellikle daha geniş farkla fiyat verir.",
    "Döviz bankadan, aracı kurumdan ya da yetkili döviz bürolarından alınır. Her yerde iki fiyat vardır: senin alacağın (satış kuru) ve senin satacağın (alış kuru). Aradaki fark makastır ve kurumun kazancıdır.",
  ],
  examples: [],
  steps: [
    "Almadan önce iki fiyatı da gör: satış kuru (senin ödeyeceğin) ve alış kuru (geri satarsan alacağın).",
    "Makası yüzde olarak hesapla: (satış − alış) ÷ alış. Farklı kurumları bu oranla karşılaştır.",
    "Hafta sonu, gece ve ani piyasa hareketlerinde makas genişleyebilir; acil değilse piyasanın sakin olduğu saatleri tercih et.",
    "Dövizi neden aldığını belirle: yurt dışı harcama, birikimin bir kısmını korumak ya da kısa vadeli işlem. Hedefin, ne kadar tutacağını belirler.",
  ],
  mistakes: [
    "Ekrandaki \"ortalama kuru\" işlem yapacağın kur sanmak.",
    "Dövizi alıp kısa süre sonra satarak makas kadar kaybetmek.",
    "Kurun hep tek yönde gideceğini varsaymak.",
  ],
  quiz: [
    {
      question: "Örnek: banka doları 40,20 TL'ye satıyor, 39,80 TL'ye alıyor. 1.000 dolar alıp hemen satarsan ne olur?",
      options: ["Kâr edersin", "Yaklaşık 400 TL kaybedersin", "Hiçbir şey değişmez"],
      answer: 1,
      explanation: "1.000 × (40,20 − 39,80) = 400 TL makas kaybı.",
    },
    {
      question: "EUR/USD paritesi 1,10 ise ne anlama gelir?",
      options: ["1 euro 1,10 dolar eder", "1 dolar 1,10 euro eder", "1 euro 1,10 TL eder"],
      answer: 0,
      explanation: "Paritede ilk yazılan para birimi, ikincisi cinsinden fiyatlanır.",
    },
    {
      question: "Hangisi kuru doğrudan etkileyen faktörlerden biridir?",
      options: ["Faiz oranları ve enflasyon", "Hissenin lot sayısı", "Fonun valör süresi"],
      answer: 0,
      explanation: "Faiz, enflasyon, dış ticaret ve beklentiler dövize arz ve talebi belirler.",
    },
  ],
  tryIt: [
    { href: detailHref("fx:USD", "USD/TRY"), label: "Dolar/TL grafiği", hint: "Aralığı uzatıp kurun yıllar içindeki hareketine bak." },
    { href: "/hesaplayicilar", label: "Döviz çevirici", hint: "\"Döviz / altın\" sekmesinde TL, dolar, euro ve sterlin arasında çeviri yap." },
  ],
};
