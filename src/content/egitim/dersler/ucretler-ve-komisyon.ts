import type { Lesson } from "../types";

export const ucretlerVeKomisyon: Lesson = {
  slug: "ucretler-ve-komisyon",
  title: "Ücretler ve komisyon",
  summary: "Komisyon, makas ve fon ücretlerinin getirini nasıl sessizce azalttığını öğren.",
  level: "baslangic",
  track: "temel",
  minutes: 5,
  what: [
    "Her yatırımın bir \"giriş-çıkış ücreti\" vardır. Aracı kurum her alım ve satımda komisyon alır; kuyumcu ve döviz bürosu alış ile satış arasındaki farktan (makas) kazanır; yatırım fonları da her yıl küçük bir yönetim ücreti keser.",
    "Bunu bir otoyol gişesine benzetebilirsin: tek bir geçiş ucuzdur, ama her gün defalarca geçersen ay sonunda ciddi bir tutar ödersin. Yatırımda da tek bir işlemin ücreti küçük görünür; asıl etkiyi sık işlem yapınca görürsün.",
    "Ücret kesin bir kayıptır, kazanç ise belirsizdir. Bu yüzden ücretleri düşük tutmak, yatırımcının kontrol edebildiği az sayıdaki şeyden biridir.",
  ],
  examples: [],
  diagram: {
    id: "ucret",
    title: "İşlem sıklığı ve yıllık ücret",
    caption:
      "Örnek: 10.000 TL'lik her işlemde %0,2 komisyon (alışta ve satışta ayrı ayrı). Yılda 4 al-sat turu yapan biri 160 TL öderken, her hafta al-sat yapan biri yaklaşık 2.080 TL öder. Aynı para, aynı varlık; fark yalnızca sıklıkta.",
  },
  steps: [
    "Hesabının komisyon oranını öğren (aracı kurumunun ücret tablosunda yazar) ve uygulamada Ayarlar › Hesaplar'a gir. Böylece her işlemde maliyetin doğru hesaplanır.",
    "Bir işlemin toplam maliyetini düşün: alış komisyonu + satış komisyonu (+ altında ve dövizde makas). Kâr etmek için fiyatın en az bu kadar artması gerekir.",
    "Fonlarda yıllık yönetim ücretine bak. %1 ile %3 arasındaki fark, 10 yılda birikimin önemli bir kısmına denk gelebilir.",
    "Portföy özetindeki \"Ödenen komisyon\" satırına ve sanal portföydeki gerçeklik kartına bakarak ne kadar ücret ödediğini ya da ödeyeceğini gör.",
  ],
  mistakes: [
    "Komisyonu \"zaten çok küçük\" diye hesaba katmamak: küçük oranlar sık işlemle büyük tutarlara dönüşür.",
    "Altını aldığı gün satıp makas kadar zarar etmek ve bunu fiyat düşüşü sanmak.",
    "Yalnızca geçmiş getirisine bakıp fonun ücretini hiç kontrol etmemek.",
  ],
  quiz: [
    {
      question: "20.000 TL'lik hisse aldın ve sonra sattın. Komisyon her işlemde %0,2. Toplam ne kadar komisyon ödedin?",
      options: ["40 TL", "80 TL", "400 TL"],
      answer: 1,
      explanation: "Alışta 20.000 × %0,2 = 40 TL, satışta da yaklaşık 40 TL. Toplam yaklaşık 80 TL.",
    },
    {
      question: "Gram altını 3.050 TL'den aldın, kuyumcunun alış fiyatı 3.000 TL. Hemen satarsan ne olur?",
      options: ["Kâr edersin", "Gram başına yaklaşık 50 TL zarar edersin", "Hiçbir şey değişmez"],
      answer: 1,
      explanation: "Aradaki fark makastır. Fiyat hiç değişmese bile hemen satarsan bu farkı kaybedersin.",
    },
    {
      question: "Ücretleri azaltmanın en etkili yolu hangisidir?",
      options: ["Daha sık işlem yapmak", "Plansız işlem sayısını azaltmak", "Komisyonu hiç kaydetmemek"],
      answer: 1,
      explanation: "Her işlem ücret demektir. Az ve planlı işlem yapmak ödenen toplam ücreti doğrudan düşürür.",
    },
  ],
  tryIt: [
    {
      href: "/ayarlar#hesaplar",
      label: "Hesabına komisyon oranı ekle",
      hint: "Ayarlar › Hesaplar'da her hesap için varsayılan komisyon yüzdesini yaz; işlem eklerken kendiliğinden kullanılır.",
    },
    {
      href: "/?mod=sanal",
      label: "Sanal portföyde gerçeklik kartına bak",
      hint: "Sanal sekmesindeki gerçeklik kontrolü, sanal işlemlerin gerçekte ne kadar komisyon tutacağını tahmin eder.",
    },
  ],
};
