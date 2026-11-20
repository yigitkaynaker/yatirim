"use client";

import { useEffect, useRef } from "react";
import type { IChartApi, ISeriesApi, Time, UTCTimestamp } from "lightweight-charts";

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
}: {
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
  const seriesRef = useRef<ISeriesApi<"Area"> | null>(null);
  const libRef = useRef<ChartLib | null>(null);
  const overlayRefs = useRef(new Map<string, ISeriesApi<"Line">>());
  const rsiRef = useRef<ISeriesApi<"Line"> | null>(null);
  const propsRef = useRef({ points, currency, intraday, tone, overlays, rsi, height });
  propsRef.current = { points, currency, intraday, tone, overlays, rsi, height };

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
      const series = chart.addSeries(AreaSeries, { lineWidth: 2, priceLineVisible: false, lastValueVisible: true });
      chartRef.current = chart;
      seriesRef.current = series;
      apply();
    });
    return () => {
      disposed = true;
      chartRef.current?.remove();
      chartRef.current = null;
      seriesRef.current = null;
      overlaySeries.clear();
      rsiRef.current = null;
    };
    // Grafik yalnızca bir kez oluşturulur; apply güncel değerleri propsRef'ten okur.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function apply() {
    const series = seriesRef.current;
    const chart = chartRef.current;
    if (!series || !chart) return;
    const { points: pts, tone: tn } = propsRef.current;
    const first = pts[0]?.value;
    const last = pts[pts.length - 1]?.value;
    const c = tn === "neutral" || first == null || last == null ? COLORS.neutral : last >= first ? COLORS.up : COLORS.down;
    series.applyOptions({ lineColor: c.line, topColor: c.top, bottomColor: c.bottom });
    series.setData(pts.map((p) => ({ time: (p.time + IST_OFFSET_S) as UTCTimestamp, value: p.value })));
    chart.applyOptions({ timeScale: { timeVisible: propsRef.current.intraday, secondsVisible: false } });
    applyIndicators(chart, pts);
    chart.timeScale().fitContent();
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
        for (const level of [30, 70]) {
          s.createPriceLine({ price: level, color: "rgba(148,163,184,0.6)", lineWidth: 1, lineStyle: lib.LineStyle.Dashed, axisLabelVisible: true, title: "" });
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
  useEffect(apply, [points, currency, intraday, tone, overlays, rsi]);

  const total = height + (rsi && rsi.length > 0 ? RSI_PANE_HEIGHT : 0);
  return <div ref={boxRef} style={{ height: total }} className="w-full touch-pan-y" aria-label={`Fiyat grafiği (${currency})`} role="img" />;
}
