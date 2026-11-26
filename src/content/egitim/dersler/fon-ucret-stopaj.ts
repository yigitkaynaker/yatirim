import type { Lesson } from "../types";

export const fonUcretStopaj: Lesson = {
  slug: "fon-ucret-stopaj",
  title: "Fonlarda ücretler ve stopaj",
  summary: "Fon yönetim ücretinin ve kazançtan kesilen stopajın net getiriyi nasıl etkilediğini öğren.",
  level: "orta",
  track: "fon",
  minutes: 5,
  what: [
    "Fonların iki ana maliyeti vardır. Birincisi yönetim ücreti ve diğer giderlerdir: fon bunları her gün varlığından keser ve fiyata yansıtır. İkincisi vergidir: fonu sattığında kazancından stopaj kesilebilir.",
    "Stopaj oranı fonun türüne göre değişir. Ağırlıklı olarak Borsa İstanbul hisselerine yatırım yapan hisse senedi yoğun fonlarda oran uzun süredir %0 olarak uygulanırken, para piyasası, borçlanma araçları, kıymetli maden, karma gibi diğer fon türlerinde daha yüksek bir oran uygulanıyor. Bu oranlar son yıllarda Cumhurbaşkanı kararlarıyla birkaç kez değişti; 2026'da da bazı fon türleri için değişiklik yapıldı.",
    "Oran, çoğunlukla fon payını aldığın tarihe ve fonun türüne göre belirlenir. Bu yüzden aynı fonda farklı tarihlerde aldığın paylara farklı oran uygulanabilir. Güncel oranları gib.gov.tr'den, fonun izahnamesinden ya da aracı kurumundan kontrol et.",
  ],
  examples: [],
  diagram: {
    id: "stopaj",
    title: "Fon kazancında brütten nete",
    caption: "Örnek: 1.000 TL fon kazancından %15 stopaj kesilirse eline 850 TL geçer. Fonlarda gerçek oran fon türüne ve alış tarihine göre değişir; buradaki oran yalnızca örnektir.",
  },
  steps: [
    "Fonun yıllık yönetim ücretini (izahname ve tanıtım formunda) bul ve benzer fonlarla karşılaştır.",
    "Fonun hisse senedi yoğun olup olmadığını öğren; vergi durumu buna göre değişir.",
    "Getiriyi karşılaştırırken net (stopaj sonrası) tutara bak. Örneğin mevduat ile fon karşılaştırmasında ikisini de net hâliyle kıyasla.",
    "Stopaj, fonu sattığında kazanç üzerinden kesilir; zarar ettiğin satışta kesilecek bir kazanç yoktur.",
  ],
  mistakes: [
    "Brüt fon getirisini, stopajlı mevduatın net getirisiyle karşılaştırmak.",
    "Geçen yıl öğrendiği stopaj oranının hâlâ geçerli olduğunu varsaymak.",
    "Yönetim ücretinin ayrıca faturalanacağını sanıp fiyata zaten yansıdığını bilmemek.",
  ],
  quiz: [
    {
      question: "Fon yönetim ücreti nasıl tahsil edilir?",
      options: ["Fonun varlığından kesilir ve fiyata yansır", "Her ay ayrı fatura gelir", "Yalnızca satışta ödenir"],
      answer: 0,
      explanation: "Ücret günlük olarak fon varlığından düşülür; fiyatta zaten içerilmiş olur.",
    },
    {
      question: "Fonda stopaj oranını en çok ne belirler?",
      options: ["Fonun adı", "Fonun türü ve payların alındığı tarih", "Fonun kaç yatırımcısı olduğu"],
      answer: 1,
      explanation: "Oran fon türüne (örneğin hisse senedi yoğun olup olmadığına) ve alış tarihine göre değişir.",
    },
    {
      question: "Fonu zararına satarsan stopaj ne olur?",
      options: ["Yine kesilir", "Kesilecek kazanç olmadığı için stopaj çıkmaz", "İki kat kesilir"],
      answer: 1,
      explanation: "Stopaj kazanç üzerinden hesaplanır; kazanç yoksa kesinti de yoktur.",
    },
  ],
  tryIt: [
    { href: "/hesaplayicilar", label: "Mevduat hesaplayıcısıyla karşılaştır", hint: "Mevduatın net getirisini hesapla ve fonun net getirisiyle kıyasla." },
    { href: "/rapor", label: "Yıllık gerçekleşen kazanç raporu", hint: "Fon satışlarından gerçekleşen kazancı yıl yıl gör; resmî beyan değildir." },
  ],
};
