import type { Lesson } from "../types";
import { BTC, detailHref } from "../shared";

export const kriptoNedir: Lesson = {
  slug: "kripto-nedir",
  title: "Kripto paralar: blokzincir, coin, token ve stablecoin",
  summary: "Kripto paranın ne olduğunu, coin ile token farkını ve stablecoin'in neden dolara bağlı kaldığını öğren.",
  level: "baslangic",
  track: "kripto",
  minutes: 6,
  what: [
    "Kripto para, bankanın değil bir bilgisayar ağının tuttuğu dijital paradır. Kim kime ne gönderdi, hepsi blokzincir denen ortak bir deftere yazılır. Bu defterin binlerce kopyası vardır; biri silmeye ya da değiştirmeye kalkarsa diğer kopyalar buna izin vermez.",
    "Mahalledeki ortak bir defter düşün: her ödeme herkesin önünde yazılır ve sayfalar birbirine zımbalanır. Eski bir sayfayı gizlice değiştirmek için tüm mahallenin defterini aynı anda değiştirmen gerekir; bu pratikte mümkün değildir.",
    "Coin, kendi blokzincirinin parasıdır (Bitcoin ağında BTC, Ethereum ağında ETH gibi). Token ise başka bir blokzincirin üzerinde çalışan varlıktır; kendi \"yolu\" yoktur, başkasının yolunu kullanır. Stablecoin, değerini çoğunlukla 1 ABD dolarına sabitlemeye çalışan tokendır (USDT gibi). Kripto paraların arkasında devlet ya da merkez bankası güvencesi yoktur; fiyatı yalnızca alıcı ve satıcıların talebiyle oluşur.",
  ],
  examples: [],
  steps: [
    "Bir kripto varlığa bakarken önce sor: bu bir coin mi, token mi, stablecoin mi? Stablecoin'in amacı sabit kalmaktır; kazanç beklentisiyle değil, para park etmek ya da başka kriptoya geçmek için kullanılır.",
    "Fiyat 7 gün 24 saat oluşur; hafta sonu ve gece de değişir. Bu yüzden sabah uyandığında büyük farklar görmen şaşırtıcı değildir.",
    "Oynaklık çok yüksektir: kripto paralarda günde %5–10'luk hareketler sık görülür. Kaybetmeyi göze alamayacağın parayı buraya koyma.",
    "Stablecoin'ler bile sabitliğini kaybedebilir: arkasındaki şirketin rezervleri ve güvenilirliği önemlidir. \"Dolara bağlı\" demek \"risksiz\" demek değildir.",
    "Uygulamada Bitcoin sayfasını açıp aylık grafiğe bak: hisse ve altına göre ne kadar sert dalgalandığını kendi gözünle gör.",
  ],
  mistakes: [
    "Ucuz göründüğü için (örneğin 0,001 dolarlık bir token) \"bu da 1 dolar olur\" diye düşünmek: fiyatın düşük olması ucuz olduğu anlamına gelmez.",
    "Sosyal medyada çok konuşulan, kimin çıkardığı belli olmayan yeni tokenlara birikimin büyük kısmını yatırmak.",
    "Stablecoin'i banka mevduatı gibi devlet güvenceli sanmak.",
  ],
  quiz: [
    {
      question: "Coin ile token arasındaki temel fark nedir?",
      options: ["Coin her zaman daha pahalıdır", "Coin kendi blokzincirinin parasıdır, token başka bir blokzincirin üzerinde çalışır", "Token yalnızca Türkiye'de kullanılır"],
      answer: 1,
      explanation: "BTC Bitcoin ağının, ETH Ethereum ağının coinidir. Token ise örneğin Ethereum ağı üzerinde çıkarılmış bir varlıktır.",
    },
    {
      question: "Stablecoin'in amacı nedir?",
      options: ["Hızla değer kazanmak", "Değerini çoğunlukla 1 ABD dolarına sabit tutmak", "Hisse senedi gibi temettü dağıtmak"],
      answer: 1,
      explanation: "Stablecoin'ler genellikle dolara sabitlenir. Yine de bu sabitlik garanti değildir.",
    },
    {
      question: "Kripto para fiyatı ne zaman değişebilir?",
      options: ["Yalnızca hafta içi 10:00–18:00", "Günün her saati, hafta sonu dahil", "Yalnızca ABD borsası açıkken"],
      answer: 1,
      explanation: "Kripto piyasaları kapanmaz; fiyat 7/24 oluşur.",
    },
  ],
  tryIt: [
    { href: BTC, label: "Bitcoin sayfasını aç", hint: "Aralığı 1Y yapıp grafikteki sert iniş ve çıkışlara bak; oynaklığı kendin gör." },
    { href: detailHref("crypto:ETH", "Ethereum"), label: "Ethereum ile karşılaştır", hint: "İki büyük coin'in aynı günlerde benzer yönde hareket edip etmediğine dikkat et." },
  ],
};
