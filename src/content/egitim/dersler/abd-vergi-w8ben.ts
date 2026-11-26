import type { Lesson } from "../types";

export const abdVergiW8ben: Lesson = {
  slug: "abd-vergi-w8ben",
  title: "ABD temettü stopajı, W-8BEN ve Türkiye'de beyan",
  summary: "ABD'nin temettüden kestiği vergi, W-8BEN formunun işlevi ve Türkiye'deki beyan yükümlülüğü.",
  level: "orta",
  track: "abd",
  minutes: 6,
  what: [
    "ABD'de yaşamayan yatırımcıların ABD şirketlerinden aldığı temettüden ABD'de vergi kesilir. Genel oran %30'dur. Türkiye ile ABD arasındaki çifte vergilendirmeyi önleme anlaşması bu oranı Türkiye'de yaşayanlar için genel olarak %20 ile sınırlar (ABD Gelir İdaresi IRS'in anlaşma tablosuna göre).",
    "Anlaşmadan yararlanmak için aracı kurumun sana W-8BEN formu doldurtur. Bu form, ABD vergi idaresine \"ben ABD'de yaşamıyorum, Türkiye'de yaşıyorum\" diyen bir kimlik beyanıdır. Formu doldurmazsan daha yüksek oranda kesinti yapılabilir; form belirli sürelerle yenilenir.",
    "Türkiye tarafında ise yurt dışından elde edilen temettü ve hisse satış kazançları, tutarına ve türüne göre yıllık gelir vergisi beyannamesiyle beyan edilebilir hâle gelebilir; ABD'de ödenen vergi belirli şartlarla dikkate alınabilir. Kurallar ve sınırlar her yıl değiştiği için güncel durumu gib.gov.tr'den ya da bir mali müşavirden kontrol et.",
  ],
  examples: [],
  steps: [
    "Hesap açarken aracı kurumun W-8BEN formunu doldurduğundan emin ol; yenileme tarihini not et.",
    "Temettü geldiğinde hesap ekstrene bak: brüt tutar, ABD'de kesilen vergi ve net tutar ayrı yazar.",
    "Net getiriyi hesaplarken hem ABD stopajını hem de Türkiye'deki olası vergi yükünü düşün.",
    "Yıl içindeki tüm yurt dışı alım-satım ve temettü kayıtlarını sakla (tarih, tutar, kur). Beyan gerekirse bu kayıtlar işini kolaylaştırır.",
    "Uygulamadaki rapor sayfası yıllık gerçekleşen kazancı ve temettüleri özetler; resmî beyan yerine geçmez ama hazırlık için yardımcı olur.",
  ],
  mistakes: [
    "W-8BEN'i süresi dolduğu hâlde yenilememek ve gereğinden yüksek kesinti ödemek.",
    "ABD'de vergi kesildiği için Türkiye'de hiçbir yükümlülük olmadığını varsaymak.",
    "Kayıt tutmayıp yıl sonunda hangi işlemin hangi kurdan yapıldığını hatırlayamamak.",
  ],
  quiz: [
    {
      question: "W-8BEN formu ne işe yarar?",
      options: ["ABD'de banka hesabı açmaya", "ABD'de yaşamadığını beyan edip vergi anlaşmasından yararlanmaya", "Temettüyü TL'ye çevirmeye"],
      answer: 1,
      explanation: "W-8BEN, yabancı yatırımcının statüsünü ve hangi ülkede vergi mukimi olduğunu ABD vergi idaresine bildirir.",
    },
    {
      question: "100 dolar brüt temettüden %20 ABD stopajı kesilirse hesaba ne geçer?",
      options: ["100 dolar", "80 dolar", "70 dolar"],
      answer: 1,
      explanation: "100 × %20 = 20 dolar kesinti; net 80 dolar.",
    },
    {
      question: "Yurt dışı kazançların vergisi için en doğru yaklaşım hangisi?",
      options: ["ABD'de kesildiyse iş biter", "Türkiye'deki beyan yükümlülüğünü resmî kaynaktan ya da mali müşavirden kontrol etmek", "Hiç kayıt tutmamak"],
      answer: 1,
      explanation: "Türkiye'de beyan gerekebilir; kurallar değiştiği için güncel bilgiyi resmî kaynaktan al.",
    },
  ],
  tryIt: [
    { href: "/temettu", label: "Temettü sayfası", hint: "Yabancı hisse temettülerinde brüt, kesinti ve net tutarı ayrı ayrı kaydet." },
    { href: "/rapor", label: "Yıllık gerçekleşen kazanç raporu", hint: "Yıl yıl gerçekleşen K/Z ve temettüleri gör; resmî beyan değildir." },
  ],
};
