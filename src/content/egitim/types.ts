// ÖĞRETİCİ ANALİZ DESTEĞİ: ders içeriğinin veri tipleri.
// Dersler src/content/egitim/dersler/*.ts dosyalarında, bileşenlerden ayrı tutulur.
// Metni düzenlemek için yalnızca ilgili ders dosyasını değiştirmek yeterlidir.

export type Level = "baslangic" | "orta" | "ileri";

export const LEVEL_LABEL: Record<Level, string> = {
  baslangic: "Başlangıç",
  orta: "Orta",
  ileri: "İleri",
};

/** Bir mum: açılış, yüksek, düşük, kapanış ve (isteğe bağlı) hacim */
export interface Candle {
  o: number;
  h: number;
  l: number;
  c: number;
  v?: number;
}

/** Grafiğin hangi bölmesine çizileceği (fiyat ya da alttaki gösterge panelleri) */
export type PaneId = "price" | "volume" | "rsi" | "macd";

/**
 * Bir noktanın fiyatı: sayı ya da o mumun değeri
 * (o: açılış, h: yüksek, l: düşük, c: kapanış, v: bölmedeki göstergenin değeri, örn. RSI).
 */
export type PriceRef = number | "o" | "h" | "l" | "c" | "v";

export interface ChartPoint {
  /** Mum sırası (0'dan başlar) */
  i: number;
  price: PriceRef;
}

export type MaKind = "sma" | "ema";

/** Fiyatın üstüne çizilen hareketli ortalama */
export interface MaLayer {
  type: "ma";
  kind: MaKind;
  period: number;
  color: string;
  label: string;
}

/** Bollinger bantları (orta çizgi + üst/alt bant) */
export interface BollingerLayer {
  type: "bollinger";
  period?: number;
  mult?: number;
  color: string;
}

/** İki ya da daha fazla noktayı birleştiren çizgi (trend çizgisi, boyun çizgisi…) */
export interface SegmentLayer {
  type: "segment";
  points: ChartPoint[];
  color: string;
  dashed?: boolean;
  width?: number;
  /** Fiyat ekseninde görünen kısa etiket */
  label?: string;
  pane?: PaneId;
}

/** Tüm grafik boyunca yatay çizgi (destek, direnç, stop…) */
export interface HLineLayer {
  type: "hline";
  price: number;
  color: string;
  label: string;
  dashed?: boolean;
  pane?: PaneId;
}

/** Bir mumun üstüne / altına konan işaret ve yazı */
export interface MarkerLayer {
  type: "marker";
  i: number;
  position: "above" | "below";
  shape?: "arrowUp" | "arrowDown" | "circle" | "square";
  color: string;
  text: string;
  pane?: PaneId;
}

/** İki nokta arasındaki Fibonacci düzeltme seviyeleri */
export interface FibLayer {
  type: "fib";
  from: ChartPoint;
  to: ChartPoint;
  levels?: number[];
  color: string;
}

/** İki hareketli ortalamanın kesiştiği yerleri kendiliğinden işaretler */
export interface MaCrossLayer {
  type: "maCross";
  fast: { kind: MaKind; period: number };
  slow: { kind: MaKind; period: number };
  upText: string;
  downText: string;
}

/** MACD ile sinyal çizgisinin kesişimlerini MACD panelinde işaretler */
export interface MacdCrossLayer {
  type: "macdCross";
  upText: string;
  downText: string;
}

/** RSI'ın 70 üstüne / 30 altına girdiği ilk mumları işaretler */
export interface RsiZoneLayer {
  type: "rsiZones";
  overText: string;
  underText: string;
}

export type OverlayLayer = MaLayer | BollingerLayer;
export type Annotation = OverlayLayer | SegmentLayer | HLineLayer | MarkerLayer | FibLayer | MaCrossLayer | MacdCrossLayer | RsiZoneLayer;

export interface ChartSpec {
  candles: Candle[];
  /** Her zaman görünen çizgiler (ortalama, Bollinger) */
  overlays?: OverlayLayer[];
  /** Alttaki gösterge panelleri, verilen sırayla */
  panes?: ("volume" | "rsi" | "macd")[];
  /** "Göster / Gizle" düğmesiyle açılıp kapanan işaretlemeler */
  annotations: Annotation[];
  /** Grafiğin altındaki renk açıklamaları */
  legend?: { color: string; label: string }[];
  /** Fiyat bölmesinin yüksekliği (px) */
  height?: number;
}

export interface ChartExample {
  /** Birden çok örnek varsa sekme adı */
  tab: string;
  /** Grafiğin altında, ne görüldüğünü anlatan kısa açıklama */
  caption: string;
  chart: ChartSpec;
}

export interface QuizQuestion {
  question: string;
  options: string[];
  /** Doğru seçeneğin sırası (0'dan başlar) */
  answer: number;
  explanation: string;
}

export interface TryLink {
  href: string;
  label: string;
  hint: string;
}

export interface Lesson {
  slug: string;
  title: string;
  /** Kart üzerindeki tek cümlelik özet */
  summary: string;
  level: Level;
  /** Tahmini okuma süresi (dakika) */
  minutes: number;
  /** "Nedir?": 2–3 kısa paragraf */
  what: string[];
  /** "Grafikte nasıl görünür?" örnekleri (fiyat grafiği gerekmeyen derslerde boş, yerine diagram) */
  examples: ChartExample[];
  /** Fiyat grafiği yerine gösterilecek açıklayıcı çizim (src/components/egitim/LessonDiagram.tsx) */
  diagram?: { id: DiagramId; title: string; caption: string };
  /** Dizinde hangi bölümde listelenir: yoksa grafik analizi, varsa TRACKS'teki bölüm */
  track?: Track;
  /** "Nasıl yorumlanır?": adım adım */
  steps: string[];
  /** "Sık yapılan hatalar" */
  mistakes: string[];
  /** "Kendini dene": 3 soru */
  quiz: QuizQuestion[];
  /** "Uygulamada dene" bağlantıları */
  tryIt: TryLink[];
  /** Derse özel ek araç */
  extra?: "positionCalculator";
  /** Videolu anlatım için isteğe bağlı elle yazılmış senaryo; yoksa sahneler ders metninden üretilir (video.ts) */
  video?: VideoScript;
}

/** Videolu anlatımın orta sahneleri (giriş ve "mini sınavı dene" kapanışı her zaman eklenir) */
export interface VideoScript {
  scenes: {
    heading: string;
    /** Ekranda sırayla beliren kısa maddeler */
    points: string[];
    /** Her madde için okunacak metin (yoksa maddenin kendisi okunur) */
    narration?: string[];
    /** "diagram": dersin çizimi, sayı: o sıradaki grafik örneği */
    visual?: "diagram" | number;
  }[];
}

export type DiagramId = "ucret" | "stopaj" | "cesitlendirme" | "duygular" | "saatler" | "kur" | "gider" | "contango" | "altinMakas";

/** Grafik analizi dışındaki ders bölümleri (dizinde bu sırayla, grafik analizinden sonra listelenir) */
export type Track = "temel" | "kripto" | "bist" | "abd" | "etf" | "endeks" | "emtia" | "doviz" | "altin" | "fon";

export const TRACKS: { id: Track; label: string; intro: string }[] = [
  { id: "temel", label: "Temel Bilgiler", intro: "Her yatırımcı için: ücretler, vergi, çeşitlendirme ve duygular." },
  { id: "kripto", label: "Kripto Paralar", intro: "Blokzincir, borsalar, USDT ve TL pariteleri, cüzdan güvenliği." },
  { id: "bist", label: "BIST Hisseleri", intro: "Borsa İstanbul'da hisse almak: seanslar, maliyetler ve vergi." },
  { id: "abd", label: "ABD Hisseleri", intro: "Türkiye'den ABD borsalarına yatırım: saatler, kur riski, W-8BEN." },
  { id: "etf", label: "ETF'ler", intro: "Borsada işlem gören fonlar: endeks takibi ve gider oranı." },
  { id: "endeks", label: "Endeksler", intro: "BIST 100, S&P 500 gibi endeksler ne ölçer, endekse nasıl yatırım yapılır." },
  { id: "emtia", label: "Emtia", intro: "Gümüş, petrol ve diğerleri: vadeli kontratlar, contango ve rollover." },
  { id: "doviz", label: "Döviz", intro: "Kur nasıl oluşur, makas, maliyetler ve dövizin riskleri." },
  { id: "altin", label: "Altın", intro: "Gram, çeyrek, cumhuriyet, has altın; makas ve fiziki ile hesap farkı." },
  { id: "fon", label: "Yatırım Fonları", intro: "Fon türleri, TEFAS, valör, ücretler ve stopaj." },
];

/** Dizin sayfası ve gezinme için hafif özet (grafik verisi olmadan) */
export type LessonSummary = Pick<Lesson, "slug" | "title" | "summary" | "level" | "minutes" | "track">;

/** Her eğitim sayfasının altındaki uyarı */
export const DISCLAIMER = "Bu içerik eğitim amaçlıdır, yatırım tavsiyesi değildir.";
