"use client";

import { useEffect, useMemo, useRef } from "react";
import type { IChartApi, IPriceLine, ISeriesApi, ISeriesMarkersPluginApi, SeriesMarker, SeriesType, Time, UTCTimestamp } from "lightweight-charts";
import { bollinger, ema, macd, rsi, sma, type Series } from "@/lib/indicators";
import type { Annotation, Candle, ChartSpec, MaKind, OverlayLayer, PaneId, PriceRef } from "@/content/egitim/types";

type ChartLib = typeof import("lightweight-charts");

// Ders grafikleri: örnek mumlar + göstergeler + "Göster / Gizle" ile açılan işaretlemeler.
// Grafik bir kez kurulur; işaretlemeler düğmeye göre eklenip kaldırılır (yakınlaştırma korunur).

const SUB_PANE_HEIGHT = 110;
const UP = "#34d399";
const DOWN = "#fb7185";

/** Örnek verinin zaman ekseni: 5 Ocak 2026'dan başlayan iş günleri */
function makeTimes(n: number): UTCTimestamp[] {
  const out: UTCTimestamp[] = [];
  let t = Date.UTC(2026, 0, 5) / 1000;
  while (out.length < n) {
    const day = new Date(t * 1000).getUTCDay();
    if (day !== 0 && day !== 6) out.push(t as UTCTimestamp);
    t += 86400;
  }
  return out;
}

const fmtDay = new Intl.DateTimeFormat("tr-TR", { day: "numeric", month: "short", timeZone: "UTC" });
const fmtFull = new Intl.DateTimeFormat("tr-TR", { day: "numeric", month: "long", timeZone: "UTC" });
const toDate = (t: Time) => new Date((typeof t === "number" ? t : 0) * 1000);

function maSeries(kind: MaKind, closes: number[], period: number): Series {
  return kind === "sma" ? sma(closes, period) : ema(closes, period);
}

interface ChartState {
  lib: ChartLib;
  chart: IChartApi;
  hosts: Map<PaneId, ISeriesApi<SeriesType>>;
  paneIndex: Map<PaneId, number>;
  markers: Map<PaneId, ISeriesMarkersPluginApi<Time>>;
  /** Görünen işaretlemeleri kaldıran işlevler */
  cleanup: (() => void)[];
  spec: ChartSpec;
  data: Computed;
}

interface Computed {
  times: UTCTimestamp[];
  closes: number[];
  /** "v" fiyat referansı için her bölmenin değeri */
  values: Record<PaneId, Series>;
  macd: ReturnType<typeof macd> | null;
}

function compute(spec: ChartSpec): Computed {
  const closes = spec.candles.map((c) => c.c);
  const m = spec.panes?.includes("macd") ? macd(closes) : null;
  return {
    times: makeTimes(spec.candles.length),
    closes,
    macd: m,
    values: {
      price: closes,
      volume: spec.candles.map((c) => c.v ?? null),
      rsi: spec.panes?.includes("rsi") ? rsi(closes) : [],
      macd: m?.macd ?? [],
    },
  };
}

function resolve(ref: PriceRef, i: number, candle: Candle | undefined, values: Series): number | null {
  if (typeof ref === "number") return ref;
  if (!candle) return null;
  if (ref === "v") return values[i] ?? null;
  return candle[ref];
}

const line = (data: Series, times: UTCTimestamp[]) =>
  data.flatMap((v, i) => (v == null ? [] : [{ time: times[i], value: v }]));

export function LessonChart({ spec, show }: { spec: ChartSpec; show: boolean }) {
  const boxRef = useRef<HTMLDivElement>(null);
  const stateRef = useRef<ChartState | null>(null);
  const showRef = useRef(show);
  const data = useMemo(() => compute(spec), [spec]);

  const priceHeight = spec.height ?? 260;
  const panes = spec.panes ?? [];
  const totalHeight = priceHeight + panes.length * SUB_PANE_HEIGHT;

  // Grafiği kur (örnek değişirse yeniden kur).
  useEffect(() => {
    let disposed = false;
    void import("lightweight-charts").then((lib) => {
      if (disposed || !boxRef.current) return;
      const { createChart, CandlestickSeries, LineSeries, HistogramSeries, ColorType, LineStyle, createSeriesMarkers } = lib;
      const chart = createChart(boxRef.current, {
        autoSize: true,
        layout: {
          background: { type: ColorType.Solid, color: "transparent" },
          textColor: "#94a3b8",
          fontSize: 11,
          fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, sans-serif",
          attributionLogo: false,
          panes: { separatorColor: "#233150" },
        },
        grid: { vertLines: { visible: false }, horzLines: { color: "rgba(35,49,80,0.6)" } },
        rightPriceScale: { borderVisible: false, scaleMargins: { top: 0.12, bottom: 0.1 } },
        timeScale: {
          borderVisible: false,
          fixLeftEdge: true,
          fixRightEdge: true,
          rightOffset: 2,
          tickMarkFormatter: (time: Time) => fmtDay.format(toDate(time)),
        },
        crosshair: {
          vertLine: { color: "#475569", labelBackgroundColor: "#17223a" },
          horzLine: { color: "#475569", labelBackgroundColor: "#17223a" },
        },
        localization: {
          locale: "tr-TR",
          timeFormatter: (time: Time) => fmtFull.format(toDate(time)),
          priceFormatter: (p: number) => p.toLocaleString("tr-TR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
        },
        handleScroll: { vertTouchDrag: false },
        handleScale: { axisPressedMouseMove: false },
      });

      const { times } = data;
      const candles = chart.addSeries(CandlestickSeries, {
        upColor: UP,
        downColor: DOWN,
        borderUpColor: UP,
        borderDownColor: DOWN,
        wickUpColor: UP,
        wickDownColor: DOWN,
        lastValueVisible: false,
        priceLineVisible: false,
      });
      candles.setData(spec.candles.map((c, i) => ({ time: times[i], open: c.o, high: c.h, low: c.l, close: c.c })));

      const hosts = new Map<PaneId, ISeriesApi<SeriesType>>([["price", candles]]);
      const paneIndex = new Map<PaneId, number>([["price", 0]]);

      for (const o of spec.overlays ?? []) addOverlay(lib, chart, o, data);

      panes.forEach((p, k) => {
        const idx = k + 1;
        paneIndex.set(p, idx);
        if (p === "volume") {
          const s = chart.addSeries(HistogramSeries, { priceLineVisible: false, lastValueVisible: false, priceFormat: { type: "volume" } }, idx);
          s.setData(
            spec.candles.map((c, i) => ({
              time: times[i],
              value: c.v ?? 0,
              color: c.c >= c.o ? "rgba(52,211,153,0.55)" : "rgba(251,113,133,0.55)",
            })),
          );
          hosts.set("volume", s);
        } else if (p === "rsi") {
          const s = chart.addSeries(
            LineSeries,
            {
              color: "#a78bfa",
              lineWidth: 2,
              priceLineVisible: false,
              lastValueVisible: false,
              crosshairMarkerVisible: false,
              autoscaleInfoProvider: () => ({ priceRange: { minValue: 0, maxValue: 100 } }),
            },
            idx,
          );
          s.setData(line(data.values.rsi, times));
          // Otomatik ölçek etiketleri 30 / 70 etiketleriyle üst üste binmesin.
          s.priceScale().applyOptions({ textColor: "rgba(0,0,0,0)", ticksVisible: false });
          for (const level of [30, 70]) {
            s.createPriceLine({ price: level, color: "rgba(148,163,184,0.6)", lineWidth: 1, lineStyle: LineStyle.Dashed, axisLabelVisible: true, axisLabelColor: "#334155", axisLabelTextColor: "#cbd5e1", title: "" });
          }
          hosts.set("rsi", s);
        } else if (p === "macd" && data.macd) {
          const hist = chart.addSeries(HistogramSeries, { priceLineVisible: false, lastValueVisible: false }, idx);
          hist.setData(
            data.macd.histogram.flatMap((v, i) =>
              v == null ? [] : [{ time: times[i], value: v, color: v >= 0 ? "rgba(52,211,153,0.5)" : "rgba(251,113,133,0.5)" }],
            ),
          );
          const m = chart.addSeries(LineSeries, { color: "#38bdf8", lineWidth: 2, priceLineVisible: false, lastValueVisible: false, crosshairMarkerVisible: false }, idx);
          m.setData(line(data.macd.macd, times));
          const sig = chart.addSeries(LineSeries, { color: "#f59e0b", lineWidth: 1, priceLineVisible: false, lastValueVisible: false, crosshairMarkerVisible: false }, idx);
          sig.setData(line(data.macd.signal, times));
          hosts.set("macd", m);
        }
      });

      const all = chart.panes();
      all[0]?.setStretchFactor(priceHeight);
      for (let k = 1; k < all.length; k++) all[k].setStretchFactor(SUB_PANE_HEIGHT);

      const markers = new Map<PaneId, ISeriesMarkersPluginApi<Time>>();
      for (const [pane, s] of hosts) markers.set(pane, createSeriesMarkers(s, []));

      chart.timeScale().fitContent();
      const st: ChartState = { lib, chart, hosts, paneIndex, markers, cleanup: [], spec, data };
      stateRef.current = st;
      applyAnnotations(st, showRef.current);
    });
    return () => {
      disposed = true;
      stateRef.current?.chart.remove();
      stateRef.current = null;
    };
    // Kurulum yalnızca örnek değişince; işaretlemeler aşağıdaki efektle güncellenir.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [spec, data]);

  useEffect(() => {
    showRef.current = show;
    if (stateRef.current) applyAnnotations(stateRef.current, show);
  }, [show]);

  return <div ref={boxRef} style={{ height: totalHeight }} className="w-full touch-pan-y" role="img" aria-label="Örnek mum grafiği" />;
}

function applyAnnotations(st: ChartState, visible: boolean) {
  const { spec } = st;
  for (const fn of st.cleanup) fn();
  st.cleanup = [];
  const markerLists = new Map<PaneId, SeriesMarker<Time>[]>();
  if (visible) {
    for (const a of spec.annotations) addAnnotation(st, a, markerLists);
  }
  for (const [pane, plugin] of st.markers) {
    const list = markerLists.get(pane) ?? [];
    list.sort((x, y) => (x.time as number) - (y.time as number));
    plugin.setMarkers(list);
  }
}

function addAnnotation(st: ChartState, a: Annotation, markerLists: Map<PaneId, SeriesMarker<Time>[]>) {
  const { lib, chart, hosts, paneIndex, spec, data } = st;
  const { times, values } = data;
  const pushMarker = (pane: PaneId, m: SeriesMarker<Time>) => {
    if (!hosts.has(pane)) return;
    const list = markerLists.get(pane) ?? [];
    list.push(m);
    markerLists.set(pane, list);
  };

  switch (a.type) {
    case "ma":
    case "bollinger": {
      const series = addOverlay(lib, chart, a, data);
      st.cleanup.push(() => series.forEach((s) => chart.removeSeries(s)));
      break;
    }
    case "segment": {
      const pane = a.pane ?? "price";
      const idx = paneIndex.get(pane);
      if (idx == null) break;
      const pts = a.points
        .map((p) => ({ time: times[p.i], value: resolve(p.price, p.i, spec.candles[p.i], values[pane]) }))
        .filter((p): p is { time: UTCTimestamp; value: number } => p.time != null && p.value != null)
        .sort((x, y) => x.time - y.time);
      const s = chart.addSeries(
        lib.LineSeries,
        {
          color: a.color,
          lineWidth: (a.width ?? 2) as 1 | 2 | 3 | 4,
          lineStyle: a.dashed ? lib.LineStyle.Dashed : lib.LineStyle.Solid,
          priceLineVisible: false,
          lastValueVisible: !!a.label,
          title: a.label ?? "",
          crosshairMarkerVisible: false,
          pointMarkersVisible: false,
          autoscaleInfoProvider: () => null,
        },
        idx,
      );
      s.setData(pts);
      st.cleanup.push(() => chart.removeSeries(s));
      break;
    }
    case "hline": {
      const host = hosts.get(a.pane ?? "price");
      if (!host) break;
      const pl = host.createPriceLine({
        price: a.price,
        color: a.color,
        lineWidth: 2,
        lineStyle: a.dashed ? lib.LineStyle.Dashed : lib.LineStyle.Solid,
        axisLabelVisible: true,
        title: a.label,
      });
      st.cleanup.push(() => host.removePriceLine(pl));
      break;
    }
    case "fib": {
      const host = hosts.get("price")!;
      const from = resolve(a.from.price, a.from.i, spec.candles[a.from.i], values.price);
      const to = resolve(a.to.price, a.to.i, spec.candles[a.to.i], values.price);
      if (from == null || to == null) break;
      const lines: IPriceLine[] = [];
      for (const r of a.levels ?? [0, 0.236, 0.382, 0.5, 0.618, 1]) {
        lines.push(
          host.createPriceLine({
            price: to + (from - to) * r,
            color: a.color,
            lineWidth: 1,
            lineStyle: r === 0 || r === 1 ? lib.LineStyle.Solid : lib.LineStyle.Dashed,
            axisLabelVisible: true,
            title: `%${(r * 100).toLocaleString("tr-TR", { maximumFractionDigits: 1 })}`,
          }),
        );
      }
      st.cleanup.push(() => lines.forEach((l) => host.removePriceLine(l)));
      const s = chart.addSeries(lib.LineSeries, {
        color: a.color,
        lineWidth: 1,
        lineStyle: lib.LineStyle.Dotted,
        priceLineVisible: false,
        lastValueVisible: false,
        crosshairMarkerVisible: false,
      });
      s.setData([
        { time: times[a.from.i], value: from },
        { time: times[a.to.i], value: to },
      ]);
      st.cleanup.push(() => chart.removeSeries(s));
      break;
    }
    case "marker": {
      const up = a.position === "below";
      pushMarker(a.pane ?? "price", {
        time: times[a.i],
        position: up ? "belowBar" : "aboveBar",
        shape: a.shape ?? (up ? "arrowUp" : "arrowDown"),
        color: a.color,
        text: a.text,
      });
      break;
    }
    case "maCross": {
      const f = maSeries(a.fast.kind, data.closes, a.fast.period);
      const s = maSeries(a.slow.kind, data.closes, a.slow.period);
      for (let i = 1; i < f.length; i++) {
        const f0 = f[i - 1], s0 = s[i - 1], f1 = f[i], s1 = s[i];
        if (f0 == null || s0 == null || f1 == null || s1 == null) continue;
        if (f0 <= s0 && f1 > s1) pushMarker("price", { time: times[i], position: "belowBar", shape: "arrowUp", color: "#facc15", text: a.upText });
        if (f0 >= s0 && f1 < s1) pushMarker("price", { time: times[i], position: "aboveBar", shape: "arrowDown", color: "#f87171", text: a.downText });
      }
      break;
    }
    case "macdCross": {
      if (!data.macd) break;
      const { macd: m, signal: sg } = data.macd;
      for (let i = 1; i < m.length; i++) {
        const m0 = m[i - 1], s0 = sg[i - 1], m1 = m[i], s1 = sg[i];
        if (m0 == null || s0 == null || m1 == null || s1 == null) continue;
        if (m0 <= s0 && m1 > s1) pushMarker("macd", { time: times[i], position: "belowBar", shape: "arrowUp", color: UP, text: a.upText });
        if (m0 >= s0 && m1 < s1) pushMarker("macd", { time: times[i], position: "aboveBar", shape: "arrowDown", color: DOWN, text: a.downText });
      }
      break;
    }
    case "rsiZones": {
      const r = values.rsi;
      for (let i = 1; i < r.length; i++) {
        const r0 = r[i - 1], r1 = r[i];
        if (r0 == null || r1 == null) continue;
        if (r0 <= 70 && r1 > 70) pushMarker("rsi", { time: times[i], position: "aboveBar", shape: "circle", color: DOWN, text: a.overText });
        if (r0 >= 30 && r1 < 30) pushMarker("rsi", { time: times[i], position: "belowBar", shape: "circle", color: UP, text: a.underText });
      }
      break;
    }
  }
}

function addOverlay(lib: ChartLib, chart: IChartApi, o: OverlayLayer, data: Computed): ISeriesApi<"Line">[] {
  const opts = { priceLineVisible: false, lastValueVisible: false, crosshairMarkerVisible: false } as const;
  if (o.type === "ma") {
    const s = chart.addSeries(lib.LineSeries, { ...opts, color: o.color, lineWidth: 2 });
    s.setData(line(maSeries(o.kind, data.closes, o.period), data.times));
    return [s];
  }
  const b = bollinger(data.closes, o.period ?? 20, o.mult ?? 2);
  const mid = chart.addSeries(lib.LineSeries, { ...opts, color: o.color, lineWidth: 1, lineStyle: lib.LineStyle.Dotted });
  mid.setData(line(b.middle, data.times));
  const up = chart.addSeries(lib.LineSeries, { ...opts, color: o.color, lineWidth: 1, lineStyle: lib.LineStyle.Dashed });
  up.setData(line(b.upper, data.times));
  const lo = chart.addSeries(lib.LineSeries, { ...opts, color: o.color, lineWidth: 1, lineStyle: lib.LineStyle.Dashed });
  lo.setData(line(b.lower, data.times));
  return [mid, up, lo];
}
