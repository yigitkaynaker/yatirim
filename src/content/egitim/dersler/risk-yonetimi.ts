import { pathCandles } from "../sampleData";
import { C } from "../shared";
import type { Lesson } from "../types";

// Düşüş → 104 civarında destek → ikinci kez destekten dönüş (giriş) → yükseliş
const candles = pathCandles(
  [[0, 122], [20, 104.5], [28, 112], [38, 104.8], [41, 107], [62, 126], [70, 122]],
  { seed: 121, noise: 0.009, volumeBoost: [[40, 1.8], [41, 2]] },
);

export const riskYonetimi: Lesson = {
  slug: "risk-yonetimi",
  title: "Göstergeleri birlikte kullanmak ve risk yönetimi",
  summary: "Birden çok göstergeyle teyit aramayı, stop seviyesi koymayı ve pozisyon büyüklüğünü hesaplamayı öğren.",
  level: "ileri",
  minutes: 9,
  what: [
    "Hiçbir gösterge her zaman doğru değildir. Bu yüzden deneyimli yatırımcılar birkaç farklı aracın aynı şeyi söylemesini bekler: örneğin fiyat bir destekte, RSI aşırı satımdan dönüyor ve hacim artıyor.",
    "Bunu doktorun teşhis koyarken tek bir teste değil, ateşe, tahlile ve muayeneye birlikte bakmasına benzetebilirsin. Ama en iyi teşhis bile bazen yanılır; bu yüzden işin ikinci yarısı risk yönetimidir.",
    "Risk yönetimi, yanıldığında ne kadar kaybedeceğini işleme girmeden önce belirlemektir: nereden çıkacağını (stop seviyesi) ve ne kadar alacağını (pozisyon büyüklüğü) önceden hesaplarsın.",
  ],
  examples: [
    {
      tab: "Teyit, stop ve hedef",
      caption:
        "Fiyat 104 civarındaki desteğe ikinci kez geldi; aynı anda RSI aşırı satım bölgesinden yukarı döndü. İki farklı türden işaret (seviye ve momentum) aynı yönü gösterdiği için giriş yapılmış. Stop, desteğin biraz altına (101) konmuş; hedef ise önceki tepenin üstü. Olası kazanç, olası kayıptan birkaç kat büyük.",
      chart: {
        candles,
        panes: ["rsi"],
        overlays: [{ type: "ma", kind: "sma", period: 20, color: C.sma, label: "SMA 20" }],
        annotations: [
          { type: "hline", price: 104, color: C.up, label: "Destek", dashed: true },
          { type: "hline", price: 101, color: C.down, label: "Stop", dashed: false },
          { type: "hline", price: 122, color: C.trend, label: "Hedef", dashed: false },
          { type: "marker", i: 41, position: "below", color: C.note, text: "Giriş ~107" },
          { type: "marker", i: 20, position: "below", shape: "circle", color: C.up, text: "1. test" },
          { type: "marker", i: 38, position: "below", shape: "circle", color: C.up, text: "2. test" },
          { type: "marker", i: 40, position: "below", shape: "circle", color: C.note, text: "RSI dönüyor", pane: "rsi" },
        ],
        legend: [
          { color: C.up, label: "Destek seviyesi" },
          { color: C.down, label: "Stop: yanılırsan çıkacağın yer" },
          { color: C.trend, label: "Hedef: kâr alma bölgesi" },
          { color: C.sma, label: "SMA 20" },
        ],
      },
    },
  ],
  steps: [
    "Tek bir göstergeye güvenme: trend, destek/direnç, bir momentum göstergesi (RSI ya da MACD) ve hacim gibi farklı türden en az 2–3 teyit ara.",
    "İşleme girmeden önce stop seviyeni belirle: fikrinin yanlış çıktığını gösterecek yer neresi? Genelde desteğin biraz altı ya da son dibin altıdır.",
    "Tek bir işlemde sermayenin küçük bir kısmını riske at. Yaygın kural: işlem başına sermayenin %1–2'si.",
    "Pozisyon büyüklüğünü hesapla: adet = (sermaye × risk oranı) ÷ (giriş fiyatı − stop fiyatı).",
    "Olası kazancın olası kayıptan büyük olmasına dikkat et (örneğin en az 2'ye 1). Stop'a gelindiğinde plana sadık kal ve çık.",
  ],
  mistakes: [
    "Tek göstergeye güvenmek: \"RSI 30'un altında, kesin yükselir\" diye düşünmek sık yapılan ve pahalıya mal olan bir hatadır.",
    "Stop koymamak ya da fiyat stop'a yaklaşınca onu aşağı çekmek: küçük bir kayıp böylece büyük bir kayba dönüşebilir.",
    "Tüm parayı tek bir işleme yatırmak: en iyi kurulum bile yanılabilir; sermayeni korumak, kazanmaktan daha önemlidir.",
  ],
  quiz: [
    {
      question: "100.000 TL sermayen var ve işlem başına %1 risk almak istiyorsun. Giriş 50 TL, stop 48 TL. Kaç adet almalısın?",
      options: ["200 adet", "500 adet", "2.000 adet"],
      answer: 1,
      explanation: "Riske atılacak tutar 100.000 × %1 = 1.000 TL. Hisse başına risk 50 − 48 = 2 TL. 1.000 ÷ 2 = 500 adet.",
    },
    {
      question: "Hangisi \"teyit\" yaklaşımına en uygun örnektir?",
      options: [
        "Yalnızca RSI 30'un altına indi diye almak",
        "Fiyat destekte, RSI aşırı satımdan dönüyor ve hacim artıyorken almak",
        "Bir arkadaşın tavsiyesiyle almak",
      ],
      answer: 1,
      explanation: "Farklı türden üç işaretin (seviye, momentum, hacim) aynı yönü göstermesi, tek bir göstergeye göre çok daha güçlü bir dayanaktır.",
    },
    {
      question: "Fiyat stop seviyene geldi. En doğru davranış hangisi?",
      options: ["Planına sadık kalıp çıkmak", "Stop'u biraz daha aşağı çekip beklemek", "Zararı kapatmak için daha fazla almak"],
      answer: 0,
      explanation: "Stop, yanıldığını kabul ettiğin yerdir. Onu sürekli aşağı çekmek küçük kayıpları büyük kayıplara dönüştürür.",
    },
  ],
  tryIt: [
    {
      href: "/sinyaller",
      label: "Sinyaller sayfası",
      hint: "Sinyaller sayfası RSI, MACD, ortalamalar, Bollinger ve hacmi birlikte değerlendirir. Bir varlığa dokunup \"Neden bu sinyal?\" listesinde hangi göstergelerin aynı yönü gösterdiğine bak.",
    },
    {
      href: "/emirler",
      label: "Emirler: stop seviyeni kaydet",
      hint: "Belirlediğin stop seviyesini koşullu satış emri olarak kaydedebilirsin; fiyat oraya gelince bildirim alırsın. Önce sanal portföyde denemek iyi bir başlangıçtır.",
    },
  ],
  extra: "positionCalculator",
};
