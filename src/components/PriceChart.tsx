"use client";

import { useEffect, useRef } from "react";
import type { IChartApi, ISeriesApi, Time, UTCTimestamp } from "lightweight-charts";

// lightweight-charts sarmalayıcısı (alan grafiği). Kütüphane yalnızca tarayıcıda
// yüklenir. Zaman ekseni UTC çizdiği için noktalar İstanbul saatine (UTC+3)
// kaydırılır; etiketler Türkçe biçimlenir.

export interface ChartPointIn {
  /** Unix saniye (UTC) */
  time: number;
  value: number;
}

const IST_OFFSET_S = 3 * 3600;

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
}: {
  points: ChartPointIn[];
  currency?: string;
  /** true: ipucunda saat de gösterilir */
  intraday?: boolean;
  /** auto: ilk ve son değere göre yeşil / kırmızı */
  tone?: "auto" | "neutral";
  height?: number;
}) {
  const boxRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const seriesRef = useRef<ISeriesApi<"Area"> | null>(null);
  const propsRef = useRef({ points, currency, intraday, tone });
  propsRef.current = { points, currency, intraday, tone };

  // Grafiği bir kez oluştur.
  useEffect(() => {
    let disposed = false;
    void import("lightweight-charts").then(({ createChart, AreaSeries, ColorType, LineStyle, TickMarkType }) => {
      if (disposed || !boxRef.current) return;
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
    };
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
    chart.timeScale().fitContent();
  }

  // Veri değişince güncelle.
  useEffect(apply, [points, currency, intraday, tone]);

  return <div ref={boxRef} style={{ height }} className="w-full touch-pan-y" aria-label={`Fiyat grafiği (${currency})`} role="img" />;
}
