"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { ASSET_TYPE_INFO, displaySymbol, FUND_EXPLAIN, GOLD_SPREAD_EXPLAIN, GOLD_SYMBOL, isCurrency, parseInstrumentId, supportsDividends } from "@/lib/assets";
import { formatMoney, formatPercent, formatTime, pnlClass } from "@/lib/format";
import type { ChartData, ChartRange, WatchItem } from "@/lib/market";
import type { Quote } from "@/lib/prices";
import type { TechnicalAnalysis } from "@/lib/technical";
import { fetchJson, goToLogin, UnauthorizedError, usePolling } from "@/lib/usePolling";
import { formatQuotePrice, isIndex, OVERVIEW } from "./MarketView";
import { AssetNewsPanel } from "./AssetNewsPanel";
import { OrderForm } from "./OrdersView";
import { PriceChart, type ChartOverlay } from "./PriceChart";
import { SignalBadge, TechnicalPanel } from "./TechnicalPanel";
import { TransactionForm, toInput } from "./TransactionForm";
import { Card, Explain, Modal, PriceMeta, Segmented } from "./ui";
import { DividendPanel, KapPanel } from "./AssetPanels";
import { VirtualEntryForm } from "./VirtualEntryForm";

const RANGES: { value: ChartRange; label: string }[] = [
  { value: "1G", label: "1G" },
  { value: "1H", label: "1H" },
  { value: "1A", label: "1A" },
  { value: "3A", label: "3A" },
  { value: "1Y", label: "1Y" },
  { value: "5Y", label: "5Y" },
];

const RANGE_HINT: Record<ChartRange, string> = {
  "1G": "son işlem günü",
  "1H": "son 1 hafta",
  "1A": "son 1 ay",
  "3A": "son 3 ay",
  "1Y": "son 1 yıl",
  "5Y": "son 5 yıl",
};

type Action = "virtual" | "order" | "tx" | null;

type Layer = "sma50" | "sma200" | "bb" | "rsi";

/** Grafik katman düğmeleri: renk ve kısa açıklama */
const LAYERS: { key: Layer; label: string; color: string; hint: string }[] = [
  { key: "sma50", label: "SMA 50", color: "#fbbf24", hint: "son 50 günün ortalama fiyatı (sarı çizgi). Fiyat üstündeyse orta vadeli eğilim yukarı." },
  { key: "sma200", label: "SMA 200", color: "#f472b6", hint: "son 200 günün ortalama fiyatı (pembe çizgi). Uzun vadeli eğilimi gösterir." },
  { key: "bb", label: "Bollinger", color: "#60a5fa", hint: "olağan fiyat aralığı (mavi kesikli çizgiler). Fiyat çoğu zaman bu bantların arasında kalır." },
  { key: "rsi", label: "RSI", color: "#a78bfa", hint: "alttaki panel. 70 üstü: kısa sürede çok yükseldi, 30 altı: kısa sürede çok düştü." },
];

export function AssetDetailView() {
  const params = useSearchParams();
  const router = useRouter();
  const rawId = params.get("id") ?? "";
  const ref = parseInstrumentId(rawId);
  const id = ref ? `${ref.type}:${ref.symbol}` : "";
  const nameParam = params.get("ad");
  const isFund = ref?.type === "fund";
  // Fon fiyatı günde bir açıklanır: gün içi aralıklar yerine 1 ay ve üstü.
  const [range, setRange] = useState<ChartRange>(isFund ? "3A" : "1A");
  const [chart, setChart] = useState<{ key: string; data: ChartData | null; error?: string } | null>(null);
  const [action, setAction] = useState<Action>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [tech, setTech] = useState<{ id: string; data: TechnicalAnalysis | null; error: string | null } | null>(null);
  const [layers, setLayers] = useState<Record<Layer, boolean>>({ sma50: false, sma200: false, bb: false, rsi: true });

  const price = usePolling<{ quotes: Quote[] }>(`/api/prices?ids=${encodeURIComponent(id || "fx:USD")}`);
  const watch = usePolling<{ items: WatchItem[] }>("/api/watchlist", 120_000);
  const q = id ? price.data?.quotes[0] : undefined;
  const watched = watch.data?.items.find((w) => w.instrument === id) ?? null;

  const key = `${id}|${range}`;
  useEffect(() => {
    if (!id) return;
    let alive = true;
    fetchJson<ChartData>(`/api/chart?id=${encodeURIComponent(id)}&range=${range}`)
      .then((data) => alive && setChart({ key: `${id}|${range}`, data }))
      .catch((err: unknown) => {
        if (err instanceof UnauthorizedError) return goToLogin();
        if (alive) setChart({ key: `${id}|${range}`, data: null, error: "Grafik verisi alınamadı." });
      });
    return () => {
      alive = false;
    };
  }, [id, range]);

  useEffect(() => {
    if (!id) return;
    let alive = true;
    fetchJson<TechnicalAnalysis>(`/api/technical?id=${encodeURIComponent(id)}`)
      .then((data) => alive && setTech({ id, data, error: null }))
      .catch((err: unknown) => {
        if (err instanceof UnauthorizedError) return goToLogin();
        if (alive) setTech({ id, data: null, error: "Teknik analiz için fiyat verisi alınamadı." });
      });
    return () => {
      alive = false;
    };
  }, [id]);

  const techData = tech && tech.id === id ? tech.data : null;
  const overlays = useMemo<ChartOverlay[]>(() => {
    const o = techData?.overlays;
    if (!o) return [];
    const out: ChartOverlay[] = [];
    if (layers.sma50) out.push({ id: "sma50", color: "#fbbf24", points: o.sma50 });
    if (layers.sma200) out.push({ id: "sma200", color: "#f472b6", points: o.sma200 });
    if (layers.bb) {
      out.push({ id: "bbUpper", color: "#60a5fa", points: o.bbUpper, dashed: true });
      out.push({ id: "bbLower", color: "#60a5fa", points: o.bbLower, dashed: true });
    }
    return out;
  }, [techData, layers.sma50, layers.sma200, layers.bb]);
  const rsiPoints = layers.rsi ? (techData?.overlays?.rsi ?? null) : null;

  if (!ref) {
    return (
      <Card className="p-8 text-center">
        <p className="text-slate-300">Varlık bulunamadı.</p>
        <Link href="/piyasa" className="mt-3 inline-block text-sm text-accent">
          Piyasa sayfasına dön
        </Link>
      </Card>
    );
  }

  const current = chart && chart.key === key ? chart : null;
  const points = current?.data?.points ?? [];
  const first = points[0]?.value;
  const last = points[points.length - 1]?.value;
  const rangeChange = first && last != null ? ((last - first) / first) * 100 : null;
  const overviewLabel = OVERVIEW.find((o) => o.id === id)?.label;
  const title = overviewLabel ?? displaySymbol(ref.type, ref.symbol);
  const subtitle = nameParam && nameParam !== title ? nameParam : (current?.data?.name ?? ASSET_TYPE_INFO[ref.type].label);
  const index = isIndex(id);
  const currency = q?.currency || current?.data?.currency || "TRY";

  async function toggleWatch() {
    if (!ref) return;
    const res = watched
      ? await fetch(`/api/watchlist/${watched.id}`, { method: "DELETE" })
      : await fetch("/api/watchlist", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ assetType: ref.type, symbol: ref.symbol, name: nameParam ?? current?.data?.name ?? null }),
        });
    if (res.status === 401) return goToLogin();
    void watch.reload();
  }

  function done(msg: string) {
    setAction(null);
    setToast(msg);
    setTimeout(() => setToast(null), 3500);
  }

  return (
    <div className="space-y-4 md:space-y-6">
      <div className="flex items-center gap-2">
        <button
          onClick={() => (window.history.length > 1 ? router.back() : router.push("/piyasa"))}
          className="-ml-2 rounded-lg p-2 text-slate-400 hover:text-white"
          aria-label="Geri"
        >
          <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
            <path d="M15 18l-6-6 6-6" />
          </svg>
        </button>
        <div className="min-w-0 flex-1">
          <h1 className="flex items-center gap-2 text-xl font-semibold tracking-tight">
            <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: ASSET_TYPE_INFO[ref.type].color }} />
            {title}
          </h1>
          <p className="truncate text-sm text-slate-500">{subtitle}</p>
        </div>
        <button
          onClick={toggleWatch}
          className={`shrink-0 rounded-xl border px-3 py-2 text-sm ${watched ? "border-accent/50 text-accent" : "border-line text-slate-300 hover:bg-surface-2"}`}
        >
          {watched ? "★ Listede" : "☆ İzle"}
        </button>
      </div>

      <Card className="p-4 md:p-6">
        <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-1">
          <div>
            <div className="num text-3xl font-semibold tracking-tight">{formatQuotePrice(id, q)}</div>
            <div className="num mt-1 flex flex-wrap items-center gap-2 text-sm">
              <span className={pnlClass(q?.changePct)} title={isFund ? "Son açıklanan fiyatın bir önceki güne göre değişimi" : "Bir önceki kapanışa göre değişim"}>
                {isFund ? "Son gün" : "Bugün"} {formatPercent(q?.changePct)}
              </span>
              {rangeChange != null && (
                <span className="text-slate-500">
                  · {ref.type === "crypto" && range === "1G" ? "son 24 saat" : RANGE_HINT[range]}: <span className={pnlClass(rangeChange)}>{formatPercent(rangeChange)}</span>
                </span>
              )}
            </div>
            {q && q.price != null && <PriceMeta q={q} className="mt-1" />}
          </div>
          <span className="text-xs text-slate-500">{price.lastSuccess ? `Güncellendi ${formatTime(price.lastSuccess)}` : ""}</span>
        </div>

        {ref.type === "gold" && ref.symbol !== GOLD_SYMBOL && q?.price != null && (
          <div className="num mt-3 grid grid-cols-2 gap-2 text-sm">
            <div className="rounded-xl border border-line px-3 py-2">
              <div className="text-xs text-slate-500">Satış (siz alırken)</div>
              <div className="font-medium">{formatMoney(q.price, "TRY")}</div>
            </div>
            <div className="rounded-xl border border-line px-3 py-2">
              <div className="text-xs text-slate-500">Alış (siz satarken)</div>
              <div className="font-medium">{q.bid != null ? formatMoney(q.bid, "TRY") : "—"}</div>
            </div>
          </div>
        )}
        {ref.type === "gold" && (
          <Explain title="Alış / satış (makas):" className="mt-3">
            {GOLD_SPREAD_EXPLAIN}
            {ref.symbol === GOLD_SYMBOL && " Gram altın fiyatı ons altın ve dolar kurundan hesaplanır (makassız)."}
          </Explain>
        )}
        {isFund && (
          <Explain title="Fon nedir?" className="mt-3">
            {FUND_EXPLAIN} Fiyat TEFAS’tan alınır.
          </Explain>
        )}

        <div className="mt-4">
          <Segmented<ChartRange> value={range} onChange={setRange} options={isFund ? RANGES.filter((r) => r.value !== "1G" && r.value !== "1H") : RANGES} />
        </div>

        <div className="relative mt-3">
          <PriceChart points={points} currency={currency} intraday={!!current?.data?.intraday} overlays={overlays} rsi={rsiPoints} />
          {(!current || current.error || points.length === 0) && (
            <div className="absolute inset-0 flex items-center justify-center text-sm text-slate-500">
              {!current ? "Grafik yükleniyor…" : current.error ? <span className="text-rose-400">{current.error}</span> : "Bu aralık için veri yok."}
            </div>
          )}
        </div>
        <p className="mt-2 text-xs text-slate-500">
          {index ? "Endeks puanı" : `Fiyat birimi: ${currency}`}. Parmağınızı grafikte gezdirerek o andaki değeri görebilirsiniz.
        </p>

        <div className="mt-4 border-t border-line/70 pt-3">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs text-slate-400">Grafikte göster:</span>
            {LAYERS.map((l) => {
              const on = layers[l.key];
              return (
                <button
                  key={l.key}
                  type="button"
                  aria-pressed={on}
                  disabled={!techData}
                  onClick={() => setLayers((cur) => ({ ...cur, [l.key]: !cur[l.key] }))}
                  className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-medium transition disabled:opacity-40 ${
                    on ? "border-slate-500 bg-surface-2 text-white" : "border-line text-slate-400 hover:text-white"
                  }`}
                >
                  <span className="h-2 w-2 rounded-full" style={{ background: on ? l.color : "transparent", boxShadow: `inset 0 0 0 1.5px ${l.color}` }} />
                  {l.label}
                </button>
              );
            })}
            {techData && (
              <span className="ml-auto">
                <SignalBadge label={techData.summary.label} score={techData.summary.insufficient ? null : techData.summary.score} />
              </span>
            )}
          </div>
          {LAYERS.some((l) => layers[l.key]) && (
            <ul className="mt-2 space-y-0.5 text-xs text-slate-500">
              {LAYERS.filter((l) => layers[l.key]).map((l) => (
                <li key={l.key}>
                  <span style={{ color: l.color }}>●</span> <span className="text-slate-300">{l.label}:</span> {l.hint}
                </li>
              ))}
              <li>Göstergeler günlük kapanışlarla hesaplanır; en anlamlı görünüm 3A ve 1Y aralığındadır.</li>
            </ul>
          )}
        </div>
      </Card>

      {!index && (
        <div className="grid grid-cols-3 gap-2">
          <button onClick={() => setAction("virtual")} className="rounded-xl bg-violet-500 px-2 py-3 text-sm font-semibold text-white hover:brightness-110">
            Sanal al
          </button>
          <button onClick={() => setAction("order")} className="rounded-xl border border-line bg-surface px-2 py-3 text-sm font-semibold text-slate-100 hover:bg-surface-2">
            Emir ver
          </button>
          <button onClick={() => setAction("tx")} className="rounded-xl bg-accent px-2 py-3 text-sm font-semibold text-emerald-950 hover:brightness-110">
            İşlem ekle
          </button>
        </div>
      )}

      {toast && (
        <p role="status" className="rounded-xl bg-emerald-500/10 px-3 py-2 text-sm text-emerald-300">
          {toast}
        </p>
      )}

      <TechnicalPanel data={techData} error={tech && tech.id === id ? tech.error : null} />

      {ref.type === "bist" && !index && <KapPanel symbol={ref.symbol} />}

      {supportsDividends(ref.type) && !index && <DividendPanel instrument={id} assetType={ref.type} />}

      <AssetNewsPanel instrument={id} />

      {action === "virtual" && (
        <Modal title="Sanal pozisyon aç" onClose={() => setAction(null)}>
          <VirtualEntryForm initialAssetType={ref.type} initialSymbol={ref.symbol} onSaved={() => done("Sanal pozisyon açıldı. Portföy › Sanal sekmesinde görebilirsiniz.")} />
        </Modal>
      )}
      {action === "order" && (
        <Modal title="Yeni emir" onClose={() => setAction(null)}>
          <OrderForm initialAssetType={ref.type} initialSymbol={ref.symbol} onSaved={() => done("Emir kaydedildi. Emirler sayfasından takip edebilirsiniz.")} />
        </Modal>
      )}
      {action === "tx" && (
        <Modal title="Yeni işlem" onClose={() => setAction(null)}>
          <TransactionForm
            mode="real"
            endpoint="/api/transactions"
            method="POST"
            initial={{
              assetType: ref.type,
              symbol: ref.symbol,
              price: q?.price != null ? toInput(q.price, 6) : "",
              currency: isCurrency(q?.currency) ? q.currency : ASSET_TYPE_INFO[ref.type].defaultCurrency,
            }}
            onSaved={() => done("İşlem gerçek portföye eklendi.")}
          />
        </Modal>
      )}
    </div>
  );
}
