"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { ASSET_TYPE_INFO, displaySymbol, isCurrency, parseInstrumentId } from "@/lib/assets";
import { formatPercent, formatTime, pnlClass } from "@/lib/format";
import type { ChartData, ChartRange, WatchItem } from "@/lib/market";
import type { Quote } from "@/lib/prices";
import { fetchJson, goToLogin, UnauthorizedError, usePolling } from "@/lib/usePolling";
import { formatQuotePrice, isIndex, OVERVIEW } from "./MarketView";
import { AssetNewsPanel } from "./AssetNewsPanel";
import { OrderForm } from "./OrdersView";
import { PriceChart } from "./PriceChart";
import { TransactionForm, toInput } from "./TransactionForm";
import { Card, Modal, Segmented, StaleBadge } from "./ui";
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

export function AssetDetailView() {
  const params = useSearchParams();
  const router = useRouter();
  const rawId = params.get("id") ?? "";
  const ref = parseInstrumentId(rawId);
  const id = ref ? `${ref.type}:${ref.symbol}` : "";
  const nameParam = params.get("ad");
  const [range, setRange] = useState<ChartRange>("1A");
  const [chart, setChart] = useState<{ key: string; data: ChartData | null; error?: string } | null>(null);
  const [action, setAction] = useState<Action>(null);
  const [toast, setToast] = useState<string | null>(null);

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
            <div className="num mt-1 flex items-center gap-2 text-sm">
              <span className={pnlClass(q?.changePct)}>Bugün {formatPercent(q?.changePct)}</span>
              {rangeChange != null && (
                <span className="text-slate-500">
                  · {ref.type === "crypto" && range === "1G" ? "son 24 saat" : RANGE_HINT[range]}: <span className={pnlClass(rangeChange)}>{formatPercent(rangeChange)}</span>
                </span>
              )}
              {q?.stale && q.price != null && <StaleBadge fetchedAt={q.fetchedAt} />}
            </div>
          </div>
          <span className="text-xs text-slate-500">{price.lastSuccess ? `Güncellendi ${formatTime(price.lastSuccess)}` : ""}</span>
        </div>

        <div className="mt-4">
          <Segmented<ChartRange> value={range} onChange={setRange} options={RANGES} />
        </div>

        <div className="relative mt-3">
          <PriceChart points={points} currency={currency} intraday={!!current?.data?.intraday} />
          {(!current || current.error || points.length === 0) && (
            <div className="absolute inset-0 flex items-center justify-center text-sm text-slate-500">
              {!current ? "Grafik yükleniyor…" : current.error ? <span className="text-rose-400">{current.error}</span> : "Bu aralık için veri yok."}
            </div>
          )}
        </div>
        <p className="mt-2 text-xs text-slate-500">
          {index ? "Endeks puanı" : `Fiyat birimi: ${currency}`}. Parmağınızı grafikte gezdirerek o andaki değeri görebilirsiniz.
        </p>
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
