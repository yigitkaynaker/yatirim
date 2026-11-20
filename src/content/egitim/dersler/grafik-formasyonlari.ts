import { pathCandles } from "../sampleData";
import { BTC, C, THYAO } from "../shared";
import type { Lesson } from "../types";

const doubleTop = pathCandles(
  [[0, 100], [15, 125], [23, 114], [32, 125], [42, 111], [50, 104]],
  { seed: 101, noise: 0.007 },
);
const doubleBottom = pathCandles(
  [[0, 125], [15, 100], [23, 111], [32, 100], [42, 114], [50, 121]],
  { seed: 102, noise: 0.007 },
);
const headShoulders = pathCandles(
  [[0, 100], [10, 115], [16, 108], [26, 124], [34, 108.5], [43, 116], [50, 105], [58, 98]],
  { seed: 103, noise: 0.007 },
);
const triangle = pathCandles(
  [[0, 100], [6, 120], [14, 104], [22, 117], [30, 107], [37, 114], [43, 109], [47, 112], [52, 121], [58, 126]],
  { seed: 104, noise: 0.005 },
);
const flag = pathCandles(
  [[0, 100], [3, 101], [11, 125], [14, 121], [17, 123.5], [20, 119.5], [23, 122], [26, 118.5], [28, 120.5], [34, 134], [40, 138]],
  { seed: 105, noise: 0.005, volumeBoost: [[5, 1.8], [6, 2], [7, 2.2], [8, 2], [9, 1.8], [29, 2], [30, 2.2]] },
);

// Üçgen: alçalan tepeler ve yükselen dipler
const tUpper = (i: number) => 120.8 - 0.2 * (i - 6);
const tLower = (i: number) => 103.4 + 0.18 * (i - 14);
// Bayrak: hafif aşağı eğimli kanal
const fUpper = (i: number) => 125.8 - 0.25 * (i - 11);
const fLower = (i: number) => 120.4 - 0.24 * (i - 14);

export const grafikFormasyonlari: Lesson = {
  slug: "grafik-formasyonlari",
  title: "Klasik grafik formasyonları",
  summary: "İkili tepe/dip, omuz-baş-omuz, üçgen ve bayrak gibi sık görülen şekilleri tanımayı öğren.",
  level: "ileri",
  minutes: 9,
  what: [
    "Grafik formasyonları, fiyatın haftalar içinde çizdiği ve sık tekrar eden şekillerdir. Bazıları trendin döneceğine (ikili tepe, omuz-baş-omuz), bazıları ise kısa bir moladan sonra devam edeceğine (bayrak, üçgen) işaret eder.",
    "Bulutlara bakıp şekil tanımaya benzer, ama burada şekiller insanların davranışından doğar: aynı tepeyi iki kez aşamayan alıcılar yorulmuştur, sıkışan fiyat ise bir yöne patlamaya hazırlanır.",
    "Formasyon ancak kırılımla tamamlanır. Kırılım olmadan şekil yalnızca bir ihtimaldir.",
  ],
  examples: [
    {
      tab: "İkili tepe",
      caption:
        "Fiyat aynı seviyeyi iki kez denemiş ama aşamamış (\"M\" harfi gibi). Aradaki dibin seviyesi \"boyun çizgisi\"dir. Fiyat bu çizgiyi aşağı kırınca düşüş hızlanmış.",
      chart: {
        candles: doubleTop,
        annotations: [
          { type: "segment", points: [{ i: 12, price: 113.6 }, { i: 50, price: 113.6 }], color: C.note, dashed: true, label: "Boyun" },
          { type: "marker", i: 15, position: "above", color: C.down, text: "1. tepe" },
          { type: "marker", i: 32, position: "above", color: C.down, text: "2. tepe" },
          { type: "marker", i: 41, position: "above", color: C.note, text: "Kırılım" },
        ],
        legend: [
          { color: C.down, label: "İki eşit tepe: yükseliş aşılamadı" },
          { color: C.note, label: "Boyun çizgisi: kırılınca formasyon tamamlanır" },
        ],
      },
    },
    {
      tab: "İkili dip",
      caption:
        "İkili tepenin tersi (\"W\" harfi gibi): fiyat aynı dibi iki kez test etmiş ve altına inememiş. Boyun çizgisi yukarı kırılınca yükseliş başlamış.",
      chart: {
        candles: doubleBottom,
        annotations: [
          { type: "segment", points: [{ i: 12, price: 111.6 }, { i: 50, price: 111.6 }], color: C.note, dashed: true, label: "Boyun" },
          { type: "marker", i: 15, position: "below", color: C.up, text: "1. dip" },
          { type: "marker", i: 32, position: "below", color: C.up, text: "2. dip" },
          { type: "marker", i: 41, position: "below", color: C.note, text: "Kırılım" },
        ],
        legend: [
          { color: C.up, label: "İki eşit dip: düşüş durduruldu" },
          { color: C.note, label: "Boyun çizgisi" },
        ],
      },
    },
    {
      tab: "Omuz-baş-omuz",
      caption:
        "Ortada daha yüksek bir tepe (baş), iki yanında daha alçak iki tepe (omuzlar). Omuzların altındaki dipleri birleştiren boyun çizgisi kırılınca yükseliş trendi sona ermiş.",
      chart: {
        candles: headShoulders,
        annotations: [
          { type: "segment", points: [{ i: 13, price: 107.8 }, { i: 58, price: 107.8 }], color: C.note, dashed: true, label: "Boyun" },
          { type: "marker", i: 10, position: "above", color: C.down, text: "Sol omuz" },
          { type: "marker", i: 26, position: "above", color: C.down, text: "Baş" },
          { type: "marker", i: 43, position: "above", color: C.down, text: "Sağ omuz" },
          { type: "marker", i: 49, position: "above", color: C.note, text: "Kırılım" },
        ],
        legend: [
          { color: C.down, label: "Sol omuz – baş – sağ omuz" },
          { color: C.note, label: "Boyun çizgisi" },
        ],
      },
    },
    {
      tab: "Üçgen",
      caption:
        "Tepeler alçalırken dipler yükseliyor; fiyat gittikçe daralan bir üçgenin içine sıkışıyor. Sonunda üst kenarı yukarı kırıp yeni bir hareket başlatmış. Üçgende kırılım iki yöne de olabilir.",
      chart: {
        candles: triangle,
        annotations: [
          { type: "segment", points: [{ i: 6, price: tUpper(6) }, { i: 50, price: tUpper(50) }], color: C.down, width: 2 },
          { type: "segment", points: [{ i: 14, price: tLower(14) }, { i: 50, price: tLower(50) }], color: C.up, width: 2 },
          { type: "marker", i: 48, position: "below", color: C.note, text: "Kırılım" },
        ],
        legend: [
          { color: C.down, label: "Alçalan tepeler" },
          { color: C.up, label: "Yükselen dipler" },
        ],
      },
    },
    {
      tab: "Bayrak",
      caption:
        "Hızlı ve hacimli bir yükseliş (direk), ardından hafif aşağı eğimli dar bir kanalda dinlenme (bayrak). Fiyat kanalı yukarı kırınca yükseliş kaldığı yerden devam etmiş.",
      chart: {
        candles: flag,
        panes: ["volume"],
        annotations: [
          { type: "segment", points: [{ i: 11, price: fUpper(11) }, { i: 29, price: fUpper(29) }], color: C.trend, width: 2 },
          { type: "segment", points: [{ i: 14, price: fLower(14) }, { i: 29, price: fLower(29) }], color: C.trend, width: 2 },
          { type: "segment", points: [{ i: 3, price: 100 }, { i: 11, price: 100 }], color: C.neutral, dashed: true },
          { type: "marker", i: 7, position: "below", color: C.up, text: "Direk" },
          { type: "marker", i: 20, position: "below", shape: "circle", color: C.trend, text: "Bayrak" },
          { type: "marker", i: 29, position: "below", color: C.note, text: "Kırılım" },
        ],
        legend: [
          { color: C.up, label: "Direk: hızlı, hacimli yükseliş" },
          { color: C.trend, label: "Bayrak: dar, hafif aşağı eğimli kanal" },
        ],
      },
    },
  ],
  steps: [
    "Önce öncesindeki trende bak: dönüş formasyonları (ikili tepe, omuz-baş-omuz) uzun bir trendin sonunda anlamlıdır.",
    "Formasyonun kilit çizgisini çiz: ikili tepe/dipte ve omuz-baş-omuzda boyun çizgisi, üçgende ve bayrakta kenar çizgileri.",
    "Kırılımı bekle: fiyat kilit çizginin ötesinde net bir kapanış yapmadan formasyon tamamlanmış sayılmaz.",
    "Kırılımı hacimle teyit et: güçlü formasyon kırılımları genelde ortalamanın üstünde hacimle gelir.",
    "Kırılan boyun çizgisine geri dönüş (\"geri test\") sık görülür; bu, işlem için ikinci bir fırsat olabilir.",
  ],
  mistakes: [
    "Formasyonu kırılım olmadan tamamlanmış saymak: iki tepe görmek ikili tepe için yetmez; boyun çizgisinin kırılması gerekir.",
    "Her şekilde formasyon görmek: gözün istediğin şekli aramaya başlarsa her grafikte bir şey bulursun. Net ve belirgin olanlarla yetin.",
    "Hedef fiyatı kesin bilgi sanmak: formasyonlardan hesaplanan hedefler yalnızca kabaca bir tahmindir.",
  ],
  quiz: [
    {
      question: "İkili tepe formasyonu ne zaman tamamlanmış sayılır?",
      options: ["İkinci tepe oluşur oluşmaz", "Fiyat boyun çizgisini aşağı kırdığında", "Hacim azaldığında"],
      answer: 1,
      explanation: "İki tepe yalnızca bir ihtimaldir. Formasyon, fiyat iki tepenin arasındaki dip seviyesini (boyun çizgisini) aşağı kırınca tamamlanır.",
    },
    {
      question: "Omuz-baş-omuz formasyonunda en yüksek tepe hangisidir?",
      options: ["Sol omuz", "Baş", "Sağ omuz"],
      answer: 1,
      explanation: "Ortadaki tepe (baş) iki omuzdan daha yüksektir. Formasyon genelde yükselişin sona erdiğine işaret eder.",
    },
    {
      question: "Bayrak formasyonu genellikle neye işaret eder?",
      options: ["Trendin kısa bir moladan sonra devam edeceğine", "Trendin kesin döneceğine", "Hacmin sıfıra ineceğine"],
      answer: 0,
      explanation: "Bayrak bir devam formasyonudur: hızlı bir hareketten sonra kısa bir dinlenme ve ardından aynı yönde devam beklenir.",
    },
  ],
  tryIt: [
    {
      href: THYAO,
      label: "THYAO grafiğinde formasyon ara",
      hint: "1Y ya da 5Y aralığını seç. Aynı seviyede iki kez dönen tepeler ya da dipler, daralan bir üçgen görebiliyor musun? Önemli olan, fiyatın kilit çizgiyi kırıp kırmadığıdır.",
    },
    {
      href: BTC,
      label: "Bitcoin grafiği",
      hint: "Kripto paralar hızlı hareket ettiği için bayrak ve üçgen gibi formasyonlar sık görülür. 3A aralığında incele.",
    },
  ],
};
