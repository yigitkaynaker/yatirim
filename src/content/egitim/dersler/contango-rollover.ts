import type { Lesson } from "../types";
import { detailHref } from "../shared";

export const contangoRollover: Lesson = {
  slug: "contango-rollover",
  title: "Contango, rollover ve emtia ETF'leri",
  summary: "Petrol fiyatı yerinde sayarken bir petrol ETF'inin neden değer kaybedebileceğini öğren.",
  level: "ileri",
  track: "emtia",
  minutes: 6,
  what: [
    "Vadeli kontratların bir son kullanma tarihi vardır. Emtiayı uzun süre tutmak isteyen bir fon, vadesi yaklaşan kontratı satıp bir sonraki vadeyi alır. Bu işleme rollover (vade yenileme) denir.",
    "Contango, ileri vadeli kontratın yakın vadeliden pahalı olduğu durumdur; genellikle depolama ve finansman maliyetleri yüzünden oluşur. Bu durumda fon her rollover'da ucuzu satıp pahalıyı alır; fiyat hiç değişmese bile fon değer kaybeder. Tersine, yakın vadenin ileri vadeden pahalı olduğu duruma backwardation denir ve rollover lehte çalışabilir.",
    "Ev kiralamak gibi düşün: her yıl sözleşmeyi yenilediğinde kira biraz artıyorsa, evin değeri aynı kalsa bile cebinden daha fazla para çıkar. Contango'daki rollover da böyle sürekli bir \"yenileme maliyeti\"dir.",
  ],
  examples: [],
  diagram: {
    id: "contango",
    title: "Contango'da rollover maliyeti",
    caption: "Yakın vade 70 $, bir sonraki vade 72 $. Fon her ay vadesi gelen kontratı satıp bir sonrakini alır. Spot fiyat yatay kalsa bile fon her yenilemede fark kadar geride kalır. Rakamlar örnektir.",
  },
  steps: [
    "Bir emtia ETF'i ya da fonu almadan önce fiziki emtia mı tuttuğunu, yoksa vadeli kontrat mı kullandığını öğren (izahname ve tanıtım formunda yazar).",
    "Vadeli kontrat kullanan fonun getirisini spot (anlık) fiyatla değil, kendi geçmiş performansıyla değerlendir; ikisi zamanla çok farklılaşabilir.",
    "Vade eğrisine bak: ileri vadeler yakın vadelerden belirgin pahalıysa (contango) uzun vadeli tutmanın gizli bir maliyeti vardır.",
    "Emtia ürünlerini kısa ve orta vadeli bir araç olarak düşünmek, uzun vadeli \"al-unut\" yatırımı olarak düşünmekten genellikle daha gerçekçidir.",
  ],
  mistakes: [
    "\"Petrol 5 yıl sonra yine aynı fiyatta, demek ki ETF'im de aynı yerdedir\" diye düşünmek.",
    "Kaldıraçlı emtia ETF'lerini uzun vadede tutmak.",
    "Fonun fiziki mi vadeli mi olduğunu hiç kontrol etmemek.",
  ],
  quiz: [
    {
      question: "Contango nedir?",
      options: ["İleri vadeli kontratın yakın vadeden pahalı olması", "Emtia fiyatının sıfıra düşmesi", "Fonun temettü dağıtması"],
      answer: 0,
      explanation: "İleri vade yakın vadeden pahalıysa piyasa contango'dadır.",
    },
    {
      question: "Contango'da rollover yapan bir fon için ne olur?",
      options: ["Fiyat sabitken bile değer kaybeder", "Her yenilemede kazanır", "Hiçbir etkisi olmaz"],
      answer: 0,
      explanation: "Ucuz kontratı satıp pahalısını aldığı için fon zamanla geride kalır.",
    },
    {
      question: "Rollover ne demektir?",
      options: ["Vadesi gelen kontratı kapatıp sonraki vadeye geçmek", "Fiziki teslim almak", "Fonu başka bir kuruma taşımak"],
      answer: 0,
      explanation: "Rollover, pozisyonu bir sonraki vadeye taşımaktır.",
    },
  ],
  tryIt: [
    { href: detailHref("foreign:CL=F", "Ham petrol (vadeli)"), label: "Ham petrol vadeli fiyatı", hint: "Grafikte gördüğün fiyat yakın vadeli kontrattır; vade değişimlerinde ani sıçramalar olabilir." },
    { href: "/egitim/vadeli-kontrat", label: "Vadeli kontrat dersine dön", hint: "Teminat ve kaldıraç mantığını tekrar et." },
  ],
};
