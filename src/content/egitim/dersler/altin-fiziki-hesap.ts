import type { Lesson } from "../types";

export const altinFizikiHesap: Lesson = {
  slug: "altin-fiziki-hesap",
  title: "Fiziki altın mı, altın hesabı mı, altın fonu mu?",
  summary: "Altına yatırımın farklı yollarını saklama, maliyet, vergi ve risk açısından karşılaştır.",
  level: "orta",
  track: "altin",
  minutes: 5,
  what: [
    "Altını elinde tutabilirsin (külçe, sikke, takı), bankada altın hesabında tutabilirsin ya da altına yatırım yapan bir fon veya borsada işlem gören altın ürünü alabilirsin. Hepsi altın fiyatını takip eder ama maliyetleri ve riskleri farklıdır.",
    "Fiziki altın çalınma ve kaybolma riski taşır, saklaması zahmetlidir; ama bir kuruma bağlı değildir. Banka altın hesabı saklama derdini ortadan kaldırır; alış-satış banka fiyatlarıyla ve banka makasıyla yapılır. Altın fonlarında yönetim ücreti ödenir ama küçük tutarlarla, TEFAS üzerinden kolayca alınıp satılabilir.",
    "Vergi açısından da durum farklıdır: fonlarda ve bazı borsa ürünlerinde kazançtan stopaj kesilebilir, banka hesabı ve fiziki altında ise farklı kurallar geçerli olabilir. Oranlar ve kurallar değiştiği için güncel durumu gib.gov.tr'den ya da bankandan kontrol et.",
  ],
  examples: [],
  steps: [
    "Amacını belirle: düğün/hediye gibi fiziki kullanım mı, birikim mi? Birikim için işçiliksiz ürünler genellikle daha mantıklıdır.",
    "Toplam maliyeti karşılaştır: makas + (fonda) yıllık yönetim ücreti + (fizikide) saklama ve güvenlik.",
    "Likiditeye bak: ne kadar hızlı ve hangi fiyattan nakde çevirebilirsin?",
    "Banka hesabındaki altının fiziki teslim seçeneği ve koşulları bankadan bankaya değişir; teslim istersen ek ücret olabilir.",
    "Hangi yolu seçersen seç, altını portföyünün bir parçası olarak düşün; tamamını altına yatırmak da bir yoğunlaşma riskidir.",
  ],
  mistakes: [
    "Fiziki altını evde güvensiz biçimde saklamak.",
    "Altın fonunun yıllık ücretini hiç kontrol etmemek.",
    "Banka hesabındaki altını istediği an fiziki olarak ücretsiz alabileceğini varsaymak.",
  ],
  quiz: [
    {
      question: "Altın fonunun fiziki altına göre bir dezavantajı hangisidir?",
      options: ["Çalınma riski", "Yıllık yönetim ücreti", "Saklama zorluğu"],
      answer: 1,
      explanation: "Fonda saklama derdi yoktur ama her yıl yönetim ücreti kesilir.",
    },
    {
      question: "Fiziki altının başlıca riski nedir?",
      options: ["Kaybolma ve çalınma", "Fonun batması", "Valör süresi"],
      answer: 0,
      explanation: "Fiziki altın elindedir; güvenliğinden sen sorumlusun.",
    },
    {
      question: "Altın ürünlerinin vergisiyle ilgili doğru yaklaşım?",
      options: ["Hepsinin vergisi aynıdır", "Ürün türüne göre değişebilir, güncel durumu resmî kaynaktan kontrol etmek gerekir", "Altında hiçbir zaman vergi yoktur"],
      answer: 1,
      explanation: "Fon, banka hesabı ve fiziki altının vergi durumu farklı olabilir ve kurallar değişebilir.",
    },
  ],
  tryIt: [
    { href: "/hesaplayicilar", label: "Altın çevirici", hint: "\"Döviz / altın\" sekmesinde gram altın, ons ve TL arasında çeviri yap." },
    { href: "/egitim/fon-turleri", label: "Fon türleri dersi", hint: "Altın fonlarının diğer fonlardan farkını öğren." },
  ],
};
