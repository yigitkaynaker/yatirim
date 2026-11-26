import type { Lesson } from "../types";

export const endekseYatirim: Lesson = {
  slug: "endekse-yatirim",
  title: "Endekse nasıl yatırım yapılır? ETF, endeks fonu ve vadeli kontrat",
  summary: "Endeks ürünlerini karşılaştır ve kendi portföyünü endeksle kıyaslamayı öğren.",
  level: "orta",
  track: "endeks",
  minutes: 5,
  what: [
    "Endeksin kendisi alınamaz, ama onu taklit eden ürünler alınabilir. En yaygın üç yol şunlardır: borsada işlem gören endeks ETF'leri, TEFAS'ta alınan endeks fonları ve vadeli işlem piyasasındaki endeks kontratları.",
    "ETF gün içinde borsada alınıp satılır. Endeks fonunun fiyatı günde bir kez açıklanır. Vadeli kontrat ise kaldıraçlıdır: küçük bir teminatla büyük bir pozisyon açılır, bu yüzden kayıp da hızla büyür; yeni başlayanlar için uygun değildir.",
    "Endeks yatırımı \"piyasayı yenmeye\" değil, \"piyasanın getirisini almaya\" odaklanır. Pek çok aktif yönetilen fon uzun vadede takip ettiği endeksin gerisinde kalabilir; bu yüzden endeks, her yatırım kararı için iyi bir kıyaslama noktasıdır.",
  ],
  examples: [],
  steps: [
    "Hangi endekse yatırım yapmak istediğini seç (Türkiye mi, ABD mi, sektör mü?).",
    "Ürün türünü seç: gün içinde işlem için ETF, düzenli birikim için endeks fonu. Vadeli kontratları ancak kaldıraç ve teminat mantığını tam anladıktan sonra düşün.",
    "Maliyetleri karşılaştır: gider oranı, işlem komisyonu, makas.",
    "Kendi portföyünün getirisini aynı dönemdeki endeks getirisiyle düzenli kıyasla. Endeksin gerisinde kalıyorsan stratejini gözden geçir.",
  ],
  mistakes: [
    "Kaldıraçlı vadeli kontratı \"endeks almak\" sanıp küçük bir düşüşte teminatın tamamını kaybetmek.",
    "Portföyünü yalnızca TL getirisine bakarak BIST 100 ile değil, dolar bazlı bir endeksle kıyaslamak (ya da tersi).",
    "Endeks ürününü sık sık alıp satarak uzun vadeli yaklaşımın avantajını kaybetmek.",
  ],
  quiz: [
    {
      question: "Hangisi kaldıraçlıdır ve yeni başlayanlar için en risklisidir?",
      options: ["Endeks fonu", "Endeks ETF'i", "Endeks vadeli kontratı"],
      answer: 2,
      explanation: "Vadeli kontratlarda küçük teminatla büyük pozisyon açılır; kayıplar hızla büyüyebilir.",
    },
    {
      question: "Portföyün yıl içinde %20, BIST 100 aynı dönemde %35 kazandırdı. Bu ne anlatır?",
      options: ["Endeksin gerisinde kaldın", "Endeksi yendin", "Karşılaştırma yapılamaz"],
      answer: 0,
      explanation: "Aynı dönemde endeks daha çok kazandırmış; stratejini gözden geçirmek için bir işaret.",
    },
    {
      question: "Endeks fonunun fiyatı ne sıklıkla açıklanır?",
      options: ["Saniyede bir", "Genellikle günde bir kez", "Ayda bir"],
      answer: 1,
      explanation: "Yatırım fonlarının fiyatı her iş günü bir kez açıklanır; ETF ise gün içinde işlem görür.",
    },
  ],
  tryIt: [
    { href: "/sozluk#benchmark", label: "Sözlükte \"benchmark\"", hint: "Kıyaslama ölçütünün portföyünde nasıl kullanıldığını oku." },
    { href: "/", label: "Portföyünü endeksle karşılaştır", hint: "Portföy sayfasındaki \"Portföyüm vs BIST 100 / Dolar / Gram altın\" kartı, getirini endeksle yan yana gösterir." },
  ],
};
