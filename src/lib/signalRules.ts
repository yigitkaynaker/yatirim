// TEKNİK SİNYAL KURALLARI (tek dosya, kolayca değiştirilebilir)
// Göstergelerin son değerlerinden (TechnicalSnapshot) bir puan ve
// Güçlü Al / Al / Nötr / Sat / Güçlü Sat özeti üretir. Her kural, katkısını
// ve yeni başlayanlar için sade Türkçe açıklamasını döndürür.
// Saf modül: istemci ve sunucuda kullanılabilir.

export type SignalLabel = "Güçlü Al" | "Al" | "Nötr" | "Sat" | "Güçlü Sat";
export const SIGNAL_LABELS: SignalLabel[] = ["Güçlü Sat", "Sat", "Nötr", "Al", "Güçlü Al"];

/** Ayarlanabilir eşikler ve puanlar. Kuralları değiştirmek için yalnızca burayı düzenleyin. */
export const RULES = {
  rsi: { oversold: 30, overbought: 70, points: 2 },
  macd: { crossLookback: 3, crossPoints: 2, trendPoints: 1 },
  sma50: { points: 1 },
  sma200: { points: 1 },
  goldenCross: { lookback: 10, crossPoints: 2, trendPoints: 1 },
  bollinger: { points: 1 },
  volume: { highRatio: 1.5, points: 1 },
  /** Toplam puana göre özet: >= strongBuy → Güçlü Al, >= buy → Al, <= sell → Sat, <= strongSell → Güçlü Sat */
  thresholds: { strongBuy: 5, buy: 2, sell: -2, strongSell: -5 },
  /** Bu kadar günlük mumdan azsa sinyal üretilmez */
  minBars: 35,
};

export interface CrossInfo {
  /** 1: yukarı kesti, -1: aşağı kesti, 0: yakın zamanda kesişme yok */
  dir: 1 | -1 | 0;
  barsAgo: number | null;
}

/** Göstergelerin son değerleri (günlük kapanışlarla) */
export interface TechnicalSnapshot {
  bars: number;
  close: number;
  /** Son günün değişimi (%) */
  changePct: number | null;
  sma20: number | null;
  sma50: number | null;
  sma200: number | null;
  ema20: number | null;
  ema50: number | null;
  ema200: number | null;
  rsi: number | null;
  macd: number | null;
  macdSignal: number | null;
  macdHist: number | null;
  macdCross: CrossInfo;
  bbUpper: number | null;
  bbMiddle: number | null;
  bbLower: number | null;
  /** SMA50'nin SMA200'ü kesmesi (altın / ölüm kesişimi) */
  smaCross: CrossInfo;
  /** Son hacim / 20 günlük ortalama hacim */
  volumeRatio: number | null;
}

export interface SignalReason {
  id: string;
  /** Kısa başlık, örn. "RSI 30'un altında" */
  title: string;
  /** +: al yönünde, −: sat yönünde */
  points: number;
  /** Yeni başlayanlar için 1-2 cümlelik açıklama */
  explain: string;
}

export interface SignalSummary {
  label: SignalLabel;
  score: number;
  /** Katkısı olan nedenler (puanı büyük olandan küçüğe) */
  reasons: SignalReason[];
  /** Veri yetersizse açıklama (sinyal Nötr kabul edilir) */
  insufficient: string | null;
}

const gt = (a: number | null, b: number | null) => a != null && b != null && a > b;
const lt = (a: number | null, b: number | null) => a != null && b != null && a < b;
const fmt = (v: number, d = 1) => v.toLocaleString("tr-TR", { minimumFractionDigits: d, maximumFractionDigits: d });

export function labelForScore(score: number): SignalLabel {
  const t = RULES.thresholds;
  if (score >= t.strongBuy) return "Güçlü Al";
  if (score >= t.buy) return "Al";
  if (score <= t.strongSell) return "Güçlü Sat";
  if (score <= t.sell) return "Sat";
  return "Nötr";
}

/** Sıralama için: Güçlü Sat = -2 … Güçlü Al = 2 */
export function labelRank(l: SignalLabel): number {
  return SIGNAL_LABELS.indexOf(l) - 2;
}

export function evaluateSignals(s: TechnicalSnapshot): SignalSummary {
  if (s.bars < RULES.minBars) {
    return {
      label: "Nötr",
      score: 0,
      reasons: [],
      insufficient: `Yalnızca ${s.bars} günlük veri var; güvenilir sinyal için en az ${RULES.minBars} gün gerekir.`,
    };
  }
  const reasons: SignalReason[] = [];
  const add = (r: SignalReason) => r.points !== 0 && reasons.push(r);

  // RSI bölgeleri
  if (s.rsi != null) {
    if (s.rsi < RULES.rsi.oversold) {
      add({
        id: "rsi_low",
        title: `RSI ${RULES.rsi.oversold}'un altında (${fmt(s.rsi)})`,
        points: RULES.rsi.points,
        explain: "Fiyat kısa sürede çok düştü. Bazı yatırımcılar bunu ucuzlama ve olası bir toparlanma işareti olarak görür.",
      });
    } else if (s.rsi > RULES.rsi.overbought) {
      add({
        id: "rsi_high",
        title: `RSI ${RULES.rsi.overbought}'in üstünde (${fmt(s.rsi)})`,
        points: -RULES.rsi.points,
        explain: "Fiyat kısa sürede çok yükseldi. Bazı yatırımcılar bunu pahalılaşma ve olası bir geri çekilme işareti olarak görür.",
      });
    }
  }

  // MACD kesişimi ya da yönü
  if (s.macdCross.dir !== 0 && s.macdCross.barsAgo != null && s.macdCross.barsAgo < RULES.macd.crossLookback) {
    const up = s.macdCross.dir === 1;
    const when = s.macdCross.barsAgo === 0 ? "bugün" : `${s.macdCross.barsAgo} gün önce`;
    add({
      id: up ? "macd_cross_up" : "macd_cross_down",
      title: `MACD sinyal çizgisini ${up ? "yukarı" : "aşağı"} kesti (${when})`,
      points: up ? RULES.macd.crossPoints : -RULES.macd.crossPoints,
      explain: up
        ? "Kısa vadeli ivme uzun vadeliyi geçti; fiyatın yükseliş hızı artıyor olabilir."
        : "Kısa vadeli ivme uzun vadelinin altına indi; fiyatın düşüş yönünde hız kazanıyor olabilir.",
    });
  } else if (gt(s.macd, s.macdSignal) || lt(s.macd, s.macdSignal)) {
    const up = gt(s.macd, s.macdSignal);
    add({
      id: up ? "macd_above" : "macd_below",
      title: `MACD sinyal çizgisinin ${up ? "üstünde" : "altında"}`,
      points: up ? RULES.macd.trendPoints : -RULES.macd.trendPoints,
      explain: up ? "Son günlerdeki ivme yukarı yönlü." : "Son günlerdeki ivme aşağı yönlü.",
    });
  }

  // Fiyat ve hareketli ortalamalar
  if (gt(s.close, s.sma50) || lt(s.close, s.sma50)) {
    const above = gt(s.close, s.sma50);
    add({
      id: above ? "above_sma50" : "below_sma50",
      title: `Fiyat 50 günlük ortalamanın ${above ? "üstünde" : "altında"}`,
      points: above ? RULES.sma50.points : -RULES.sma50.points,
      explain: above
        ? "Fiyat son 2-3 ayın ortalamasından yüksek; orta vadeli eğilim yukarı."
        : "Fiyat son 2-3 ayın ortalamasından düşük; orta vadeli eğilim aşağı.",
    });
  }
  if (gt(s.close, s.sma200) || lt(s.close, s.sma200)) {
    const above = gt(s.close, s.sma200);
    add({
      id: above ? "above_sma200" : "below_sma200",
      title: `Fiyat 200 günlük ortalamanın ${above ? "üstünde" : "altında"}`,
      points: above ? RULES.sma200.points : -RULES.sma200.points,
      explain: above
        ? "Fiyat yaklaşık son 1 yılın ortalamasından yüksek; uzun vadeli eğilim yukarı."
        : "Fiyat yaklaşık son 1 yılın ortalamasından düşük; uzun vadeli eğilim aşağı.",
    });
  }

  // Altın / ölüm kesişimi
  if (s.smaCross.dir !== 0 && s.smaCross.barsAgo != null && s.smaCross.barsAgo < RULES.goldenCross.lookback) {
    const golden = s.smaCross.dir === 1;
    add({
      id: golden ? "golden_cross" : "death_cross",
      title: golden ? "Altın kesişim (SMA50, SMA200'ü yukarı kesti)" : "Ölüm kesişimi (SMA50, SMA200'ü aşağı kesti)",
      points: golden ? RULES.goldenCross.crossPoints : -RULES.goldenCross.crossPoints,
      explain: golden
        ? "Orta vadeli ortalama uzun vadeliyi yukarı geçti. Bu, uzun süreli bir yükselişin başlangıcı olarak yorumlanır."
        : "Orta vadeli ortalama uzun vadelinin altına indi. Bu, uzun süreli bir düşüşün başlangıcı olarak yorumlanır.",
    });
  } else if (gt(s.sma50, s.sma200) || lt(s.sma50, s.sma200)) {
    const up = gt(s.sma50, s.sma200);
    add({
      id: up ? "sma50_over_200" : "sma50_under_200",
      title: `50 günlük ortalama 200 günlüğün ${up ? "üstünde" : "altında"}`,
      points: up ? RULES.goldenCross.trendPoints : -RULES.goldenCross.trendPoints,
      explain: up ? "Genel eğilim bir süredir yukarı yönlü." : "Genel eğilim bir süredir aşağı yönlü.",
    });
  }

  // Bollinger bandına temas
  if (s.bbLower != null && s.close <= s.bbLower) {
    add({
      id: "bb_lower",
      title: "Fiyat Bollinger alt bandına değdi",
      points: RULES.bollinger.points,
      explain: "Fiyat son 20 günün olağan aralığının altına indi. Çoğu zaman bu bölgeden geri dönüş beklenir, ama düşüş sürebilir de.",
    });
  } else if (s.bbUpper != null && s.close >= s.bbUpper) {
    add({
      id: "bb_upper",
      title: "Fiyat Bollinger üst bandına değdi",
      points: -RULES.bollinger.points,
      explain: "Fiyat son 20 günün olağan aralığının üstüne çıktı. Çoğu zaman bu bölgeden geri çekilme beklenir, ama yükseliş sürebilir de.",
    });
  }

  // Hacim teyidi
  if (s.volumeRatio != null && s.volumeRatio >= RULES.volume.highRatio && s.changePct != null && s.changePct !== 0) {
    const up = s.changePct > 0;
    add({
      id: up ? "volume_up" : "volume_down",
      title: `Yüksek hacimle ${up ? "yükseliş" : "düşüş"} (ortalamanın ${fmt(s.volumeRatio)} katı)`,
      points: up ? RULES.volume.points : -RULES.volume.points,
      explain: `Bugün her zamankinden çok daha fazla alım-satım oldu. Yüksek hacim, fiyatın ${up ? "yükselişinin" : "düşüşünün"} daha güçlü olduğunu düşündürür.`,
    });
  }

  reasons.sort((a, b) => Math.abs(b.points) - Math.abs(a.points));
  const score = reasons.reduce((t, r) => t + r.points, 0);
  return { label: labelForScore(score), score, reasons, insufficient: null };
}

// ---- Gösterge açıklamaları (değer listesi için) -----------------------------------

export interface IndicatorRow {
  key: string;
  label: string;
  value: number | null;
  /** Değerin şu anki durumu, sade dille */
  state: string;
  /** Göstergenin ne olduğu */
  explain: string;
}

export function indicatorRows(s: TechnicalSnapshot): IndicatorRow[] {
  const vs = (ma: number | null, days: string) =>
    ma == null ? "Hesaplamak için yeterli geçmiş veri yok." : s.close > ma ? `Fiyat bu ortalamanın üstünde (${days}).` : `Fiyat bu ortalamanın altında (${days}).`;
  const rsiState =
    s.rsi == null
      ? "Yeterli veri yok."
      : s.rsi < RULES.rsi.oversold
        ? "Aşırı satım bölgesi: fiyat kısa sürede çok düştü."
        : s.rsi > RULES.rsi.overbought
          ? "Aşırı alım bölgesi: fiyat kısa sürede çok yükseldi."
          : "Normal bölge (30–70 arası): ne aşırı alım ne aşırı satım var.";
  const bbState =
    s.bbUpper == null || s.bbLower == null
      ? "Yeterli veri yok."
      : s.close >= s.bbUpper
        ? "Fiyat üst bandın üstünde: olağandan yüksek."
        : s.close <= s.bbLower
          ? "Fiyat alt bandın altında: olağandan düşük."
          : "Fiyat bantların arasında: olağan aralıkta.";
  return [
    {
      key: "rsi",
      label: "RSI (14)",
      value: s.rsi,
      state: rsiState,
      explain: "0–100 arası bir ölçü. Son 14 günde yükselişlerin düşüşlere göre ne kadar güçlü olduğunu gösterir.",
    },
    {
      key: "macd",
      label: "MACD (12, 26, 9)",
      value: s.macd,
      state:
        s.macd == null || s.macdSignal == null
          ? "Yeterli veri yok."
          : s.macd > s.macdSignal
            ? `Sinyal çizgisinin (${fmt(s.macdSignal, 2)}) üstünde: ivme yukarı.`
            : `Sinyal çizgisinin (${fmt(s.macdSignal, 2)}) altında: ivme aşağı.`,
      explain: "Kısa ve uzun vadeli ortalamaların farkı. Sinyal çizgisini yukarı kesmesi yükseliş, aşağı kesmesi düşüş ivmesi olarak okunur.",
    },
    { key: "sma20", label: "SMA 20", value: s.sma20, state: vs(s.sma20, "son ~1 ay"), explain: "Son 20 işlem gününün ortalama kapanış fiyatı (kısa vade)." },
    { key: "sma50", label: "SMA 50", value: s.sma50, state: vs(s.sma50, "son ~2,5 ay"), explain: "Son 50 işlem gününün ortalama kapanış fiyatı (orta vade)." },
    { key: "sma200", label: "SMA 200", value: s.sma200, state: vs(s.sma200, "son ~1 yıl"), explain: "Son 200 işlem gününün ortalama kapanış fiyatı (uzun vade). Çok izlenen bir eğilim çizgisidir." },
    { key: "ema20", label: "EMA 20", value: s.ema20, state: vs(s.ema20, "kısa vade"), explain: "Üssel ortalama: son günlere daha fazla ağırlık verir, fiyat değişimine SMA'dan hızlı tepki verir." },
    { key: "ema50", label: "EMA 50", value: s.ema50, state: vs(s.ema50, "orta vade"), explain: "50 günlük üssel ortalama; orta vadeli eğilimi yakın günlere ağırlık vererek gösterir." },
    { key: "ema200", label: "EMA 200", value: s.ema200, state: vs(s.ema200, "uzun vade"), explain: "200 günlük üssel ortalama; uzun vadeli eğilimi yakın günlere ağırlık vererek gösterir." },
    {
      key: "bollinger",
      label: "Bollinger (20, 2)",
      value: s.bbMiddle,
      state: bbState,
      explain: "20 günlük ortalamanın etrafındaki olağan fiyat aralığı. Fiyat çoğu zaman alt ve üst bandın arasında kalır.",
    },
    {
      key: "volume",
      label: "Hacim / ortalama",
      value: s.volumeRatio,
      state:
        s.volumeRatio == null
          ? "Bu varlık için hacim verisi yok."
          : s.volumeRatio >= RULES.volume.highRatio
            ? "Bugün ortalamadan belirgin şekilde fazla işlem oldu."
            : s.volumeRatio < 0.6
              ? "Bugün ortalamadan az işlem oldu."
              : "İşlem miktarı olağan seviyede.",
      explain: "Son günün alım-satım miktarının son 20 günün ortalamasına oranı. 1'den büyükse ilgi artmış demektir.",
    },
  ];
}

/** Sinyal etiketinin kısa açıklaması */
export const LABEL_EXPLAIN: Record<SignalLabel, string> = {
  "Güçlü Al": "Göstergelerin çoğu yükseliş yönünü işaret ediyor.",
  Al: "Göstergeler ağırlıklı olarak yükseliş yönünde.",
  Nötr: "Göstergeler belirgin bir yön göstermiyor ya da birbirini dengeliyor.",
  Sat: "Göstergeler ağırlıklı olarak düşüş yönünde.",
  "Güçlü Sat": "Göstergelerin çoğu düşüş yönünü işaret ediyor.",
};

export const SIGNAL_DISCLAIMER = "Teknik sinyaller geçmiş fiyatlara dayanır, geleceği garanti etmez; yatırım tavsiyesi değildir.";
