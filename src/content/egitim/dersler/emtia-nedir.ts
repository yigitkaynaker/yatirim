import type { Lesson } from "../types";
import { detailHref } from "../shared";

export const emtiaNedir: Lesson = {
  slug: "emtia-nedir",
  title: "Emtia nedir? Gümüş, petrol ve diğerleri",
  summary: "Emtia fiyatlarını neyin belirlediğini ve bunlara hangi yollarla yatırım yapıldığını öğren.",
  level: "baslangic",
  track: "emtia",
  minutes: 5,
  what: [
    "Emtia, standart ve birbirinin yerine geçebilen ham maddedir: gümüş, platin ve bakır gibi metaller; ham petrol ve doğal gaz gibi enerji ürünleri; buğday, mısır, kahve gibi tarım ürünleri. Altın da bir emtiadır, ama onun için ayrı bir bölüm var.",
    "Emtia fiyatları arz ve talebe çok duyarlıdır. Bir petrol üreticisi üretimi kısarsa ya da kötü hava hasadı bozarsa fiyat hızla değişebilir. Pazardaki domates gibi: bol olduğu yaz aylarında ucuz, kışın pahalıdır.",
    "Dünya piyasalarında emtialar çoğunlukla ABD doları ile fiyatlanır. Bu yüzden Türkiye'den yatırım yapan biri hem emtia fiyatının hem de dolar/TL kurunun etkisini taşır. Gümüşün bir kısmı sanayide kullanıldığı için fiyatı ekonomik büyümeye de bağlıdır.",
  ],
  examples: [],
  steps: [
    "Emtiaya yatırımın başlıca yolları: fiziki ürün (örneğin gümüş külçe), emtia fonları ve ETF'leri, vadeli kontratlar. Yeni başlayan için en anlaşılır yol fonlar ve ETF'lerdir.",
    "Petrol gibi emtiaları fiziki olarak saklamak mümkün olmadığı için bu ürünlere yatırım çoğunlukla vadeli kontratlar üzerinden yapılır (sonraki ders).",
    "Fiyatı dolar ve TL bazında ayrı ayrı izle; kur etkisini ayırt et.",
    "Emtia hisse gibi temettü ya da faiz ödemez; kazanç yalnızca fiyat değişiminden gelir.",
    "Vergilendirme ürünün türüne (fiziki, fon, ETF, vadeli kontrat) göre değişir. Güncel kuralları gib.gov.tr'den ya da aracı kurumundan kontrol et.",
  ],
  mistakes: [
    "Petrol fiyatı yükseldi diye bir petrol ETF'inin de aynı oranda yükseleceğini varsaymak (vadeli kontrat etkisini bilmemek).",
    "Fiziki gümüş alırken alış-satış makasını ve saklama zorluğunu hesaba katmamak.",
    "Emtianın oynaklığını küçümsemek: tek bir haberle günde %5–10 hareket görülebilir.",
  ],
  quiz: [
    {
      question: "Emtia fiyatlarını en çok ne belirler?",
      options: ["Arz ve talep", "Şirket temettüleri", "Mevduat faizi tek başına"],
      answer: 0,
      explanation: "Üretim, tüketim, hava, stoklar ve jeopolitik olaylar arz ve talebi, dolayısıyla fiyatı belirler.",
    },
    {
      question: "Dünya piyasalarında emtialar çoğunlukla hangi para birimiyle fiyatlanır?",
      options: ["TL", "ABD doları", "Japon yeni"],
      answer: 1,
      explanation: "Çoğu emtia dolarla fiyatlanır; Türkiye'deki yatırımcı ayrıca kur riski taşır.",
    },
    {
      question: "Emtiadan düzenli gelir (temettü/faiz) elde edilir mi?",
      options: ["Evet, her ay", "Hayır, kazanç fiyat değişiminden gelir", "Yalnızca gümüşte"],
      answer: 1,
      explanation: "Emtia nakit akışı üretmez; getiri yalnızca fiyat farkından gelir.",
    },
  ],
  tryIt: [
    { href: detailHref("foreign:SI=F", "Gümüş (vadeli)"), label: "Gümüş fiyatına bak", hint: "Bu grafik gümüşün dolar cinsinden vadeli kontrat fiyatıdır; altınla karşılaştır." },
    { href: detailHref("foreign:CL=F", "Ham petrol (vadeli)"), label: "Ham petrol fiyatına bak", hint: "Petrol fiyatının ne kadar sert dalgalandığını 1Y aralığında gör." },
  ],
};
