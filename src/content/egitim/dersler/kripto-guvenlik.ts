import type { Lesson } from "../types";

export const kriptoGuvenlik: Lesson = {
  slug: "kripto-guvenlik",
  title: "Kripto cüzdan güvenliği ve dolandırıcılıktan korunma",
  summary: "Özel anahtar, kurtarma kelimeleri ve en sık görülen kripto dolandırıcılıkları: paranı nasıl korursun?",
  level: "baslangic",
  track: "kripto",
  minutes: 6,
  what: [
    "Kripto cüzdan, paranın kendisini değil, ona erişim anahtarını saklar. Bu anahtara özel anahtar denir; çoğu cüzdan onu 12 ya da 24 kelimelik bir kurtarma listesi olarak verir. Bu kelimeleri bilen herkes paranı kendi adresine gönderebilir.",
    "Kasanın şifresini düşün: şifreyi bilen kasayı açar, kim olduğunu kimse sormaz. Bankada şifreni unutursan şubeye gidersin; kriptoda kurtarma kelimelerini kaybedersen geri getirecek bir şube yoktur, yanlış adrese gönderilen para da çoğunlukla geri alınamaz.",
    "Paranı platformda tutarsan anahtarı platform saklar; kendi cüzdanında tutarsan sorumluluk tamamen sendedir. İkisinin de riski farklıdır: platform zorluk yaşayabilir, sen de anahtarını kaybedebilirsin.",
  ],
  examples: [],
  steps: [
    "Kurtarma kelimelerini kimseyle paylaşma; ekran görüntüsü alma, buluta ya da mesajlaşma uygulamasına yazma. Kâğıda yazıp güvenli bir yerde sakla.",
    "Platform hesabında iki aşamalı doğrulamayı (SMS yerine mümkünse doğrulama uygulaması) aç ve her siteye farklı, güçlü bir şifre kullan.",
    "Göndermeden önce adresi ve ağı (network) iki kez kontrol et; ilk seferde küçük bir deneme tutarı gönder.",
    "\"Garantili kazanç\", \"paranı ikiye katlıyoruz\", \"destek ekibiyiz, kelimelerini doğrula\" diyen mesajlar dolandırıcılıktır. Gerçek destek ekipleri kurtarma kelimelerini asla istemez.",
    "Bir platformun ya da projenin izinli olup olmadığını SPK'nın resmî duyurularından kontrol et; sosyal medyadaki ekran görüntülerine güvenme.",
  ],
  mistakes: [
    "Kurtarma kelimelerini telefonun not uygulamasına ya da e-postaya kaydetmek.",
    "Telegram/WhatsApp gruplarındaki \"sinyal\" ve \"yatırım danışmanı\" vaatlerine para göndermek.",
    "Arama motorunda çıkan reklam bağlantısından platforma girip sahte bir sayfaya şifre yazmak.",
    "Tüm kripto birikimini tek bir platformda, iki aşamalı doğrulama olmadan tutmak.",
  ],
  quiz: [
    {
      question: "Biri kendini \"platform destek ekibi\" olarak tanıtıp kurtarma kelimelerini istiyor. Ne yapmalısın?",
      options: ["Hesabım güvende olsun diye vermek", "Kesinlikle vermemek; bu bir dolandırıcılık girişimidir", "Sadece ilk 6 kelimeyi vermek"],
      answer: 1,
      explanation: "Kurtarma kelimelerini bilen paranı alabilir. Gerçek destek ekipleri bunları asla istemez.",
    },
    {
      question: "Kurtarma kelimelerini nerede saklamak en güvenlidir?",
      options: ["Telefonda ekran görüntüsü olarak", "E-posta taslağında", "Kâğıda yazılı olarak, güvenli ve çevrimdışı bir yerde"],
      answer: 2,
      explanation: "İnternete bağlı her yer çalınma riski taşır. Çevrimdışı, fiziki bir kopya daha güvenlidir.",
    },
    {
      question: "Yanlış adrese gönderilen kripto için genellikle ne geçerlidir?",
      options: ["Banka gibi iade edilir", "Çoğunlukla geri alınamaz", "24 saat sonra otomatik geri gelir"],
      answer: 1,
      explanation: "Blokzincirdeki işlemler geri alınamaz. Bu yüzden adresi kontrol etmek ve küçük bir deneme göndermek önemlidir.",
    },
  ],
  tryIt: [
    { href: "/?mod=sanal", label: "Önce sanal portföyde dene", hint: "Gerçek para göndermeden kripto alım-satımını sanal portföyde deneyip oynaklığa alış." },
    { href: "/alarmlar", label: "Fiyat alarmı kur", hint: "Gece ekran başında beklemek yerine önemli seviyelerde haber alırsın; alarm işlem yapmaz." },
  ],
};
