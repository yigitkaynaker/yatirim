"use client";

import { useEffect, useRef } from "react";
import type { IChartApi, IPriceLine, ISeriesApi, ISeriesMarkersPluginApi, SeriesMarker, Time, UTCTimestamp } from "lightweight-charts";

type ChartLib = typeof import("lightweight-charts");

// lightweight-charts sarmalayıcısı (alan grafiği). Kütüphane yalnızca tarayıcıda
// yüklenir. Zaman ekseni UTC çizdiği için noktalar İstanbul saatine (UTC+3)
// kaydırılır; etiketler Türkçe biçimlenir. İsteğe bağlı olarak gösterge
// çizgileri (overlays: SMA, Bollinger) ve altta ayrı bir RSI paneli çizer.

export interface ChartPointIn {
  /** Unix saniye (UTC) */
  time: number;
  value: number;
}

/** Fiyat grafiğinin üstüne çizilen gösterge çizgisi */
export interface ChartOverlay {
  id: string;
  color: string;
  points: ChartPointIn[];
  dashed?: boolean;
}

/** Grafikte işaret (alış / satış noktası). time grafiğin en yakın önceki noktasına oturtulur. */
export interface ChartMarkerIn {
  time: number;
  side: "buy" | "sell";
  price: number;
  text: string;
}

/** Grafikte yatay çizgi (örn. hedef / stop fiyatı) */
export interface ChartPriceLine {
  price: number;
  color: string;
  title: string;
}

const IST_OFFSET_S = 3 * 3600;
const RSI_PANE_HEIGHT = 120;

const COLORS = {
  up: { line: "#34d399", top: "rgba(52,211,153,0.28)", bottom: "rgba(52,211,153,0.02)" },
  down: { line: "#fb7185", top: "rgba(251,113,133,0.25)", bottom: "rgba(251,113,133,0.02)" },
  neutral: { line: "#38bdf8", top: "rgba(56,189,248,0.25)", bottom: "rgba(56,189,248,0.02)" },
};

const dateFmt = (opts: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat("tr-TR", { ...opts, timeZone: "UTC" });
const fmtDayMonth = dateFmt({ day: "numeric", month: "short" });
const fmtMonth = dateFmt({ month: "short" });
const fmtYear = dateFmt({ year: "numeric" });
const fmtTime = dateFmt({ hour: "2-digit", minute: "2-digit" });
const fmtFull = dateFmt({ day: "2-digit", month: "short", year: "numeric" });
const fmtFullTime = dateFmt({ day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });

const toDate = (t: Time) => new Date((typeof t === "number" ? t : 0) * 1000);

export function PriceChart({
  points,
  currency = "TRY",
  intraday = false,
  tone = "auto",
  height = 280,
  overlays = [],
  rsi = null,
  baseline = null,
  baselineLabel = "Maliyetin",
  markers = [],
  priceLines = [],
}: {
  /** Ek yatay çizgiler (hedef / stop); ölçek bunları da kapsar */
  priceLines?: ChartPriceLine[];
  /**
   * Verilirse (ilk çizimde) grafik bu fiyatın üstünde yeşil, altında kırmızı boyanır ve
   * fiyatta kesikli bir çizgi (baselineLabel) çizilir. Örn. pozisyonun ortalama maliyeti.
   */
  baseline?: number | null;
  baselineLabel?: string;
  /** Alış / satış işaretleri */
  markers?: ChartMarkerIn[];
  points: ChartPointIn[];
  currency?: string;
  /** true: ipucunda saat de gösterilir */
  intraday?: boolean;
  /** auto: ilk ve son değere göre yeşil / kırmızı */
  tone?: "auto" | "neutral";
  height?: number;
  /** Fiyatın üstüne çizilecek gösterge çizgileri (grafiğin zaman aralığına kırpılır) */
  overlays?: ChartOverlay[];
  /** Verilirse altta 0–100 ölçekli RSI paneli (30 / 70 çizgileriyle) */
  rsi?: ChartPointIn[] | null;
}) {
  const boxRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const seriesRef = useRef<ISeriesApi<"Area"> | ISeriesApi<"Baseline"> | null>(null);
  const libRef = useRef<ChartLib | null>(null);
  const overlayRefs = useRef(new Map<string, ISeriesApi<"Line">>());
  const rsiRef = useRef<ISeriesApi<"Line"> | null>(null);
  const markersRef = useRef<ISeriesMarkersPluginApi<Time> | null>(null);
  const costLineRef = useRef<IPriceLine | null>(null);
  const extraLinesRef = useRef<IPriceLine[]>([]);
  const propsRef = useRef({ points, currency, intraday, tone, overlays, rsi, height, baseline, baselineLabel, markers, priceLines });
  propsRef.current = { points, currency, intraday, tone, overlays, rsi, height, baseline, baselineLabel, markers, priceLines };

  // Grafiği bir kez oluştur.
  useEffect(() => {
    let disposed = false;
    const overlaySeries = overlayRefs.current;
    void import("lightweight-charts").then((lib) => {
      const { createChart, AreaSeries, ColorType, LineStyle, TickMarkType } = lib;
      if (disposed || !boxRef.current) return;
      libRef.current = lib;
      const chart = createChart(boxRef.current, {
        autoSize: true,
        layout: {
          background: { type: ColorType.Solid, color: "transparent" },
          textColor: "#94a3b8",
          fontSize: 11,
          fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, sans-serif",
          attributionLogo: false,
        },
        grid: {
          vertLines: { visible: false },
          horzLines: { color: "rgba(35,49,80,0.6)", style: LineStyle.Solid },
        },
        rightPriceScale: { borderVisible: false, scaleMargins: { top: 0.12, bottom: 0.08 } },
        timeScale: {
          borderVisible: false,
          fixLeftEdge: true,
          fixRightEdge: true,
          tickMarkFormatter: (time: Time, type: number) => {
            const d = toDate(time);
            if (type === TickMarkType.Year) return fmtYear.format(d);
            if (type === TickMarkType.Month) return fmtMonth.format(d);
            if (type === TickMarkType.DayOfMonth) return fmtDayMonth.format(d);
            return fmtTime.format(d);
          },
        },
        crosshair: {
          vertLine: { color: "#475569", labelBackgroundColor: "#17223a" },
          horzLine: { color: "#475569", labelBackgroundColor: "#17223a" },
        },
        localization: {
          locale: "tr-TR",
          timeFormatter: (time: Time) => (propsRef.current.intraday ? fmtFullTime : fmtFull).format(toDate(time)),
          priceFormatter: (p: number) => {
            const abs = Math.abs(p);
            const digits = abs >= 1000 ? 2 : abs >= 1 ? 2 : 6;
            return p.toLocaleString("tr-TR", { minimumFractionDigits: Math.min(2, digits), maximumFractionDigits: digits });
          },
        },
        handleScroll: { vertTouchDrag: false },
        handleScale: { axisPressedMouseMove: false },
      });
      const base = propsRef.current.baseline;
      const series =
        base != null
          ? chart.addSeries(lib.BaselineSeries, {
              lineWidth: 2,
              priceLineVisible: false,
              lastValueVisible: true,
              baseValue: { type: "price", price: base },
              // Maliyet çizgisi her zaman görünsün: ölçek maliyeti de kapsasın.
              autoscaleInfoProvider: (original: () => { priceRange: { minValue: number; maxValue: number } } | null) => {
                const r = original();
                const b = propsRef.current.baseline;
                if (!r || b == null) return withLines(r);
                return withLines({ ...r, priceRange: { minValue: Math.min(r.priceRange.minValue, b), maxValue: Math.max(r.priceRange.maxValue, b) } });
              },
              topLineColor: COLORS.up.line,
              topFillColor1: COLORS.up.top,
              topFillColor2: COLORS.up.bottom,
              bottomLineColor: COLORS.down.line,
              bottomFillColor1: COLORS.down.bottom,
              bottomFillColor2: COLORS.down.top,
            })
          : chart.addSeries(AreaSeries, {
              lineWidth: 2,
              priceLineVisible: false,
              lastValueVisible: true,
              autoscaleInfoProvider: (original: () => { priceRange: { minValue: number; maxValue: number } } | null) => withLines(original()),
            });
      markersRef.current = lib.createSeriesMarkers(series, []);
      chartRef.current = chart;
      seriesRef.current = series;
      apply();
    });
    return () => {
      disposed = true;
      chartRef.current?.remove();
      chartRef.current = null;
      seriesRef.current = null;
      markersRef.current = null;
      costLineRef.current = null;
      extraLinesRef.current = [];
      overlaySeries.clear();
      rsiRef.current = null;
    };
    // Grafik yalnızca bir kez oluşturulur; apply güncel değerleri propsRef'ten okur.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /** Ölçek hedef / stop çizgilerini de kapsasın (çizgi grafiğin dışında kalmasın) */
  function withLines<T extends { priceRange: { minValue: number; maxValue: number } } | null>(r: T): T {
    const lines = propsRef.current.priceLines.filter((l) => Number.isFinite(l.price));
    if (!r || lines.length === 0) return r;
    let lo = r.priceRange.minValue;
    let hi = r.priceRange.maxValue;
    for (const l of lines) {
      lo = Math.min(lo, l.price);
      hi = Math.max(hi, l.price);
    }
    return { ...r, priceRange: { minValue: lo, maxValue: hi } };
  }

  function apply() {
    const series = seriesRef.current;
    const chart = chartRef.current;
    if (!series || !chart) return;
    const { points: pts, tone: tn } = propsRef.current;
    const first = pts[0]?.value;
    const last = pts[pts.length - 1]?.value;
    const c = tn === "neutral" || first == null || last == null ? COLORS.neutral : last >= first ? COLORS.up : COLORS.down;
    const base = propsRef.current.baseline;
    if (series.seriesType() === "Baseline") {
      if (base != null) (series as ISeriesApi<"Baseline">).applyOptions({ baseValue: { type: "price", price: base } });
    } else {
      (series as ISeriesApi<"Area">).applyOptions({ lineColor: c.line, topColor: c.top, bottomColor: c.bottom });
    }
    series.setData(pts.map((p) => ({ time: (p.time + IST_OFFSET_S) as UTCTimestamp, value: p.value })));
    chart.applyOptions({ timeScale: { timeVisible: propsRef.current.intraday, secondsVisible: false } });
    applyCostAndMarkers(pts);
    applyIndicators(chart, pts);
    chart.timeScale().fitContent();
  }

  /** "Maliyetin" kesikli çizgisi ve alış / satış işaretleri */
  function applyCostAndMarkers(pts: ChartPointIn[]) {
    const lib = libRef.current;
    const series = seriesRef.current;
    if (!lib || !series) return;
    const { baseline: base, baselineLabel: label, markers: mks } = propsRef.current;
    if (costLineRef.current) {
      series.removePriceLine(costLineRef.current);
      costLineRef.current = null;
    }
    if (base != null && Number.isFinite(base)) {
      costLineRef.current = series.createPriceLine({
        price: base,
        color: "#fbbf24",
        lineWidth: 1,
        lineStyle: lib.LineStyle.Dashed,
        axisLabelVisible: true,
        axisLabelColor: "#78350f",
        axisLabelTextColor: "#fde68a",
        title: label,
      });
    }
    for (const l of extraLinesRef.current) series.removePriceLine(l);
    extraLinesRef.current = propsRef.current.priceLines
      .filter((l) => Number.isFinite(l.price) && l.price > 0)
      .map((l) =>
        series.createPriceLine({
          price: l.price,
          color: l.color,
          lineWidth: 1,
          lineStyle: lib.LineStyle.LargeDashed,
          axisLabelVisible: true,
          axisLabelColor: l.color,
          axisLabelTextColor: "#0b1220",
          title: l.title,
        }),
      );
    // İşaretler grafikteki bir noktaya oturmalı: işlem zamanına en yakın önceki nokta (yoksa ilk nokta).
    const out: SeriesMarker<Time>[] = [];
    if (pts.length > 0) {
      for (const m of mks) {
        if (m.time < pts[0].time - 86_400 * 3 || m.time > pts[pts.length - 1].time + 86_400) continue;
        let t = pts[0].time;
        for (const p of pts) {
          if (p.time > m.time) break;
          t = p.time;
        }
        out.push({
          time: (t + IST_OFFSET_S) as UTCTimestamp,
          position: m.side === "buy" ? "belowBar" : "aboveBar",
          shape: m.side === "buy" ? "arrowUp" : "arrowDown",
          color: m.side === "buy" ? "#34d399" : "#fb7185",
          text: m.text,
        });
      }
      out.sort((a, b) => (a.time as number) - (b.time as number));
    }
    markersRef.current?.setMarkers(out);
  }

  /** Gösterge çizgilerini ve RSI panelini ekler / günceller / kaldırır. */
  function applyIndicators(chart: IChartApi, pts: ChartPointIn[]) {
    const lib = libRef.current;
    if (!lib) return;
    const { overlays: ovs, rsi: rsiPts, height: h } = propsRef.current;
    // Göstergeler günlük; grafiğin gösterdiği aralığın dışına taşmasın (yoksa zaman ekseni genişler).
    const minT = pts[0]?.time ?? Infinity;
    const maxT = pts[pts.length - 1]?.time ?? -Infinity;
    const clip = (list: ChartPointIn[]) =>
      list.filter((p) => p.time >= minT && p.time <= maxT).map((p) => ({ time: (p.time + IST_OFFSET_S) as UTCTimestamp, value: p.value }));

    const wanted = new Set(ovs.map((o) => o.id));
    for (const [id, s] of overlayRefs.current) {
      if (!wanted.has(id)) {
        chart.removeSeries(s);
        overlayRefs.current.delete(id);
      }
    }
    for (const o of ovs) {
      let s = overlayRefs.current.get(o.id);
      if (!s) {
        s = chart.addSeries(lib.LineSeries, {
          lineWidth: 2,
          priceLineVisible: false,
          lastValueVisible: false,
          crosshairMarkerVisible: false,
        });
        overlayRefs.current.set(o.id, s);
      }
      s.applyOptions({ color: o.color, lineStyle: o.dashed ? lib.LineStyle.Dashed : lib.LineStyle.Solid, lineWidth: o.dashed ? 1 : 2 });
      s.setData(clip(o.points));
    }

    if (rsiPts && rsiPts.length > 0) {
      if (!rsiRef.current) {
        const s = chart.addSeries(
          lib.LineSeries,
          {
            color: "#a78bfa",
            lineWidth: 2,
            priceLineVisible: false,
            lastValueVisible: true,
            autoscaleInfoProvider: () => ({ priceRange: { minValue: 0, maxValue: 100 } }),
          },
          1,
        );
        // RSI ekseninde yalnızca 30 / 70 ve güncel değer etiketleri görünsün: otomatik
        // ölçek işaretleri (0…100) 30/70 etiketleriyle, özellikle 100 ile üst üste biniyordu.
        s.priceScale().applyOptions({ scaleMargins: { top: 0.1, bottom: 0.08 }, textColor: "rgba(0,0,0,0)", ticksVisible: false });
        for (const level of [30, 70]) {
          s.createPriceLine({
            price: level,
            color: "rgba(148,163,184,0.6)",
            lineWidth: 1,
            lineStyle: lib.LineStyle.Dashed,
            axisLabelVisible: true,
            axisLabelColor: "#334155",
            axisLabelTextColor: "#cbd5e1",
            title: "",
          });
        }
        rsiRef.current = s;
      }
      rsiRef.current.setData(clip(rsiPts));
      const panes = chart.panes();
      panes[0]?.setStretchFactor(h);
      panes[1]?.setStretchFactor(RSI_PANE_HEIGHT);
    } else if (rsiRef.current) {
      chart.removeSeries(rsiRef.current);
      rsiRef.current = null;
      if (chart.panes().length > 1) chart.removePane(1);
    }
  }

  // Veri değişince güncelle.
  useEffect(apply, [points, currency, intraday, tone, overlays, rsi, baseline, baselineLabel, markers, priceLines]);

  const total = height + (rsi && rsi.length > 0 ? RSI_PANE_HEIGHT : 0);
  return <div ref={boxRef} style={{ height: total }} className="w-full touch-pan-y" aria-label={`Fiyat grafiği (${currency})`} role="img" />;
}
