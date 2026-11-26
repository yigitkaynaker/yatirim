import type { Lesson } from "../types";

export const vadeliKontrat: Lesson = {
  slug: "vadeli-kontrat",
  title: "Vadeli kontrat mantığı: teminat ve kaldıraç",
  summary: "Emtiaların çoğunun vadeli kontratlarla işlem görmesinin nedeni ve kaldıracın iki ucu keskin bıçak olması.",
  level: "orta",
  track: "emtia",
  minutes: 6,
  what: [
    "Vadeli kontrat, bir malı bugünden belirlenen fiyattan ileri bir tarihte alıp satmak için yapılan standart bir anlaşmadır. Fırıncı ile değirmencinin \"üç ay sonra şu fiyattan un alacağım\" diye bugünden anlaşması gibi: ikisi de fiyat belirsizliğinden korunur.",
    "Bugün yatırımcıların çoğu malı teslim almak için değil, fiyat farkından kazanmak için vadeli kontrat kullanır ve vade gelmeden pozisyonunu kapatır. Türkiye'de vadeli işlemler Borsa İstanbul'un Vadeli İşlem ve Opsiyon Piyasası'nda (VİOP) yapılır; dünyada ise petrol, gümüş gibi emtiaların fiyatı büyük ölçüde vadeli piyasalarda oluşur.",
    "Vadeli kontratta malın tamamını ödemezsin; yalnızca teminat yatırırsın. Bu kaldıraç demektir: küçük bir parayla büyük bir pozisyon taşırsın. Fiyat lehine giderse kazanç teminata göre çok büyük olur; aleyhine giderse kayıp da aynı hızla büyür ve teminatın tamamını, hatta fazlasını kaybedebilirsin.",
  ],
  examples: [],
  steps: [
    "Kontratın büyüklüğünü (bir kontratın kaç birim emtiaya karşılık geldiğini) ve vade tarihini öğren.",
    "Kaldıracı hesapla: pozisyon büyüklüğü ÷ yatırdığın teminat. 10.000 TL teminatla 100.000 TL'lik pozisyon 10 kat kaldıraçtır; fiyatın %10 düşmesi teminatın tamamını siler.",
    "Teminat tamamlama çağrısını anla: zarar teminatı belirli bir seviyenin altına düşürürse ek para yatırman istenir, yatırmazsan pozisyonun kapatılabilir.",
    "Vadeli işlem yapmak için aracı kurumlar genellikle ek bilgilendirme ve uygunluk değerlendirmesi ister. Bunu bir formalite değil, ciddi bir uyarı olarak gör.",
    "Yeni başlıyorsan vadeli kontrat yerine kaldıraçsız ürünleri (fon, ETF) tercih etmeyi düşün ve önce sanal portföyde dene.",
  ],
  mistakes: [
    "Kaldıracı \"daha çok kazanma aracı\" olarak görüp kaybın da aynı oranda büyüdüğünü unutmak.",
    "Vade tarihini takip etmeyip pozisyonun kendiliğinden kapanmasıyla şaşırmak.",
    "Teminatın tamamını tek bir pozisyona bağlayıp küçük bir dalgalanmada çağrı almak.",
  ],
  quiz: [
    {
      question: "10.000 TL teminatla 50.000 TL'lik pozisyon açtın. Kaldıraç kaç kattır?",
      options: ["2 kat", "5 kat", "50 kat"],
      answer: 1,
      explanation: "50.000 ÷ 10.000 = 5 kat kaldıraç.",
    },
    {
      question: "5 kat kaldıraçlı pozisyonda fiyat %10 aleyhine giderse teminatın ne kadarı gider?",
      options: ["%10'u", "%50'si", "Hiçbiri"],
      answer: 1,
      explanation: "%10 × 5 = %50. 10.000 TL teminatın 5.000 TL'si kaybolur.",
    },
    {
      question: "Türkiye'de vadeli işlemler hangi piyasada yapılır?",
      options: ["VİOP (Vadeli İşlem ve Opsiyon Piyasası)", "TEFAS", "Kapalıçarşı"],
      answer: 0,
      explanation: "Borsa İstanbul'un VİOP pazarında endeks, döviz, emtia gibi vadeli kontratlar işlem görür.",
    },
  ],
  tryIt: [
    { href: "/egitim/risk-yonetimi", label: "Risk yönetimi dersi", hint: "Pozisyon büyüklüğü ve zarar durdurma mantığı kaldıraçlı ürünlerde daha da önemlidir." },
    { href: "/?mod=sanal", label: "Sanal portföyde dene", hint: "Gerçek parayı riske atmadan fiyat hareketlerine nasıl tepki verdiğini gözlemle." },
  ],
};
