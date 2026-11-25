import type { Lesson } from "../types";

export const duygularVeAsiriIslem: Lesson = {
  slug: "duygular-ve-asiri-islem",
  title: "Duygular ve aşırı işlem",
  summary: "Kaçırma korkusu (FOMO), kayıptan kaçınma ve aşırı işlemin kararlarını nasıl etkilediğini öğren.",
  level: "baslangic",
  track: "temel",
  minutes: 6,
  what: [
    "Yatırımda en büyük düşman çoğu zaman piyasa değil, kendi duygularımızdır. Fiyat hızla yükselirken herkes kazanıyormuş gibi gelir ve \"kaçırmayayım\" diye tepeye yakın alırız (FOMO). Fiyat düşünce korkuyla dibe yakın satarız.",
    "Kayıptan kaçınma da güçlü bir duygudur: 1.000 TL kaybetmenin acısı, 1.000 TL kazanmanın sevincinden çok daha büyük gelir. Bu yüzden zarardaki pozisyonu \"geri gelir\" diye tutar, kârdakini erkenden satarız.",
    "Aşırı işlem, sürekli bir şeyler yapma isteğidir: sıkıldığında, bir haber duyduğunda ya da kaybı hemen telafi etmek istediğinde işlem yapmak. Her işlem ücret demektir ve plansız işlemler genellikle duygudan gelir.",
    "Sanal portföy bu duyguları tam yaşatmaz: kaybedilen gerçek para olmadığı için sakin ve cesur kararlar vermek kolaydır. Sanal sonuçların gerçekten daha iyi görünmesinin bir nedeni budur; ayrıca sanalda komisyon ve makas da ödenmez.",
  ],
  examples: [],
  diagram: {
    id: "duygular",
    title: "Duygu döngüsü",
    caption:
      "Fiyat yükseldikçe umut heyecana, heyecan açgözlülüğe döner ve çoğu kişi tepeye yakın alır. Düşüşte endişe paniğe döner ve dibe yakın satılır. Önceden yazılmış bir plan bu döngüyü kırmaya yardım eder. (Temsilî çizim, gerçek veri değildir.)",
  },
  steps: [
    "İşleme girmeden önce pozisyon notuna yaz: \"Neden alıyorum?\" ve \"Ne olursa satarım?\". Fiyat sert hareket ettiğinde önce bu notu oku.",
    "Hedef ve stop fiyatını önceden belirle ve alarm kur. Böylece ekrana bakıp anlık karar vermek zorunda kalmazsın.",
    "Bir işlem yapmadan önce kendine sor: Bu kararı planım mı veriyor, yoksa heyecan ya da korku mu?",
    "Bir kayıptan sonra \"geri almak\" için hemen yeni işleme girme. Ara ver; kararı ertesi güne bırakmak çoğu zaman iyi bir fikirdir.",
    "Sanal sonuçlarını değerlendirirken gerçeklik kartına bak: komisyonları ve en büyük düşüşü gör, \"gerçek parayla bu düşüşte ne yapardım?\" diye düşün.",
  ],
  mistakes: [
    "Haberi ya da sosyal medyada çok konuşulan bir varlığı araştırmadan, sırf yükseliyor diye almak.",
    "Zarardaki pozisyonu plan olmadan sürekli tutmak, kârdakini ise ilk fırsatta satmak.",
    "Sanalda iyi sonuç aldı diye, aynı stratejiyi küçük denemeler yapmadan büyük gerçek parayla uygulamak.",
  ],
  quiz: [
    {
      question: "Bir hisse bir haftada %40 yükseldi ve herkes ondan bahsediyor. FOMO'ya kapılmamak için en iyi adım hangisi?",
      options: ["Hemen tüm parayla almak", "Planına bakmak, gerekiyorsa önce izleme listesine ya da sanal portföye eklemek", "Başkaları ne yapıyorsa onu yapmak"],
      answer: 1,
      explanation: "Hızlı yükselişin ardından plansız almak tepeden almanın en yaygın yoludur. Önce izlemek ve planla karar vermek duyguyu devreden çıkarır.",
    },
    {
      question: "Kayıptan kaçınma neye yol açabilir?",
      options: ["Zarardaki pozisyonu plansızca uzun süre tutmaya", "Daha az işlem yapmaya", "Komisyonların düşmesine"],
      answer: 0,
      explanation: "Kaybı kabul etmek acı verdiği için zarardaki pozisyonu \"geri gelir\" umuduyla tutma eğilimi doğar; stop seviyesi bunu önlemeye yardım eder.",
    },
    {
      question: "Sanal portföy sonuçları gerçekten neden genelde daha iyi görünür?",
      options: ["Fiyatlar farklı olduğu için", "Gerçek para kaybetme korkusu ve ücretler olmadığı için", "Sanal portföy her zaman kazandığı için"],
      answer: 1,
      explanation: "Sanalda aynı canlı fiyatlar kullanılır; ama komisyon, makas ve gerçek kaybın yarattığı baskı yoktur. Bu yüzden sanal sonuçlar iyimser kalabilir.",
    },
  ],
  tryIt: [
    {
      href: "/?mod=sanal",
      label: "Sanal portföy ve gerçeklik kartı",
      hint: "Gerçeklik kontrolü kartında kazanan/kaybeden işlemlerini, en büyük düşüşü ve tahmini komisyonu gör.",
    },
    {
      href: "/alarmlar",
      label: "Hedef ve stop için alarm kur",
      hint: "Önceden belirlediğin seviyelere alarm kurarsan ekrana bakıp anlık karar vermek zorunda kalmazsın.",
    },
    {
      href: "/egitim/risk-yonetimi",
      label: "Risk yönetimi dersi",
      hint: "Stop seviyesi ve pozisyon büyüklüğünü hesaplamayı öğren.",
    },
  ],
};
