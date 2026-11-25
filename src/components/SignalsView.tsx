"use client";

import Link from "next/link";
import { useState } from "react";
import { ASSET_TYPE_INFO } from "@/lib/assets";
import { formatNumber, formatPercent, formatTime, pnlClass } from "@/lib/format";
import { LABEL_EXPLAIN, labelRank, SIGNAL_LABELS } from "@/lib/signalRules";
import type { SignalRow } from "@/lib/technical";
import { usePolling } from "@/lib/usePolling";
import { detailHref } from "./MarketView";
import { SignalBadge, SignalDisclaimer } from "./TechnicalPanel";
import { Card, Segmented } from "./ui";
import { EmptyState, InfoTip } from "./help";

type SortKey = "signal" | "rsi" | "change" | "name";

const SORTS: { value: SortKey; label: string }[] = [
  { value: "signal", label: "Sinyal" },
  { value: "rsi", label: "RSI" },
  { value: "change", label: "Değişim" },
  { value: "name", label: "Ad" },
];

const SOURCE_STYLE: Record<string, string> = {
  gerçek: "bg-emerald-500/10 text-emerald-300",
  sanal: "bg-violet-500/15 text-violet-200",
  izleme: "bg-sky-500/10 text-sky-300",
};

/** Sıralama değeri: sinyalde önce etiket sırası, sonra puan. Veri yoksa en sona. */
function sortValue(r: SignalRow, key: SortKey): number | string | null {
  switch (key) {
    case "signal":
      return r.label ? labelRank(r.label) * 100 + (r.score ?? 0) : null;
    case "rsi":
      return r.rsi;
    case "change":
      return r.changePct;
    case "name":
      return r.name.toLocaleLowerCase("tr-TR");
  }
}

export function SignalsView() {
  const { data, error, loading, lastSuccess } = usePolling<{ items: SignalRow[] }>("/api/signals", 5 * 60_000);
  const [sort, setSort] = useState<SortKey>("signal");
  const [desc, setDesc] = useState(true);
  const items = data?.items ?? null;

  const sorted = items
    ? [...items].sort((a, b) => {
        const va = sortValue(a, sort);
        const vb = sortValue(b, sort);
        if (va == null && vb == null) return 0;
        if (va == null) return 1;
        if (vb == null) return -1;
        const c = typeof va === "string" ? va.localeCompare(vb as string, "tr-TR") : va - (vb as number);
        return desc ? -c : c;
      })
    : null;

  const counts = new Map(SIGNAL_LABELS.map((l) => [l, items?.filter((r) => r.label === l).length ?? 0]));

  return (
    <div className="space-y-4 md:space-y-6">
      <div className="flex items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Sinyaller</h1>
          <p className="text-sm text-slate-500">
            Portföyünüzdeki (gerçek + sanal) ve izleme listenizdeki varlıkların teknik görünümü. Ayrıntı ve nedenler için bir varlığa dokunun.
          </p>
        </div>
        <span className="shrink-0 text-xs text-slate-500">{loading ? "Hesaplanıyor…" : lastSuccess ? formatTime(lastSuccess) : ""}</span>
      </div>

      <SignalDisclaimer />

      {error && <p className="rounded-xl bg-amber-500/10 px-3 py-2 text-sm text-amber-300">{error}</p>}

      <div className="flex flex-wrap items-center gap-2">
        <div className="min-w-64 flex-1 sm:max-w-sm">
          <Segmented<SortKey>
            value={sort}
            onChange={(v) => {
              if (v === sort) setDesc((d) => !d);
              else {
                setSort(v);
                setDesc(v !== "name");
              }
            }}
            options={SORTS.map((s) => ({ ...s, label: s.value === sort ? `${s.label} ${desc ? "↓" : "↑"}` : s.label }))}
          />
        </div>
        <span className="text-xs text-slate-500">Sıralamak için dokunun; aynı düğmeye tekrar dokunmak yönü çevirir.</span>
      </div>

      {!sorted ? (
        <Card className="p-6 text-center text-sm text-slate-500">Göstergeler hesaplanıyor… (ilk açılışta birkaç saniye sürebilir)</Card>
      ) : sorted.length === 0 ? (
        <EmptyState
          title="Gösterilecek varlık yok"
          action={{ label: "İzleme listesine varlık ekle", href: "/piyasa" }}
          guide={{ href: "/kilavuz#grafikler", label: "Kılavuz: Sinyaller nasıl okunur?" }}
        >
          Sinyaller, portföyündeki ve izleme listendeki varlıkların teknik göstergelerini tek listede özetler. Önce takip etmek istediğin bir varlık ekle.
        </EmptyState>
      ) : (
        <Card className="divide-y divide-line/70">
          {sorted.map((r) => (
            <Link key={r.instrument} href={detailHref(r.instrument, r.name)} className="flex items-center gap-3 px-4 py-3 transition hover:bg-surface-2/50">
              <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: ASSET_TYPE_INFO[r.assetType].color }} />
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="font-medium">{r.name}</span>
                  {r.sources.map((s) => (
                    <span key={s} className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${SOURCE_STYLE[s]}`}>
                      {s}
                    </span>
                  ))}
                </div>
                <div className="truncate text-xs text-slate-500">
                  {r.error ?? r.insufficient ?? r.topReason ?? "Belirgin bir neden yok"}
                </div>
              </div>
              <div className="shrink-0 text-right">
                {r.label ? <SignalBadge label={r.label} score={r.insufficient ? null : r.score} /> : <span className="text-xs text-slate-500">—</span>}
                <div className="num mt-1 text-xs text-slate-400">
                  RSI {r.rsi != null ? formatNumber(r.rsi, 0) : "—"} · <span className={pnlClass(r.changePct)}>{formatPercent(r.changePct)}</span>
                </div>
              </div>
            </Link>
          ))}
        </Card>
      )}

      <Card className="space-y-2 p-4 md:p-6">
        <h2 className="text-sm font-medium text-slate-300">Sinyaller ne anlama gelir?</h2>
        <ul className="space-y-1.5">
          {[...SIGNAL_LABELS].reverse().map((l) => (
            <li key={l} className="flex items-start gap-3 text-sm">
              <span className="w-24 shrink-0">
                <SignalBadge label={l} />
              </span>
              <span className="text-slate-400">
                {LABEL_EXPLAIN[l]}
                {items ? <span className="text-slate-500"> ({counts.get(l)} varlık)</span> : null}
              </span>
            </li>
          ))}
        </ul>
        <p className="text-xs text-slate-500">
          Sinyal <InfoTip term="sinyal-skoru" className="mx-0.5" />; RSI, MACD, 50 ve 200 günlük ortalamalar, altın/ölüm kesişimi, Bollinger bantları ve hacimden gelen puanların toplamıdır.
          RSI <InfoTip term="rsi" className="mx-0.5" /> (0–100) son 14 günün yükseliş/düşüş gücünü gösterir: 70 üstü çok hızlı yükseliş, 30 altı çok hızlı düşüş demektir.
          Değişim, son günün kapanışa göre yüzde değişimidir.
        </p>
      </Card>
    </div>
  );
}
