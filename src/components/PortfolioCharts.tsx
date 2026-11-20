"use client";

import { useState } from "react";
import { ASSET_TYPE_INFO, type Mode } from "@/lib/assets";
import { formatDate, formatMoney, formatPercent, pnlClass } from "@/lib/format";
import type { PortfolioSummary } from "@/lib/portfolio";
import type { SnapshotPoint } from "@/lib/snapshots";
import { usePolling } from "@/lib/usePolling";
import { PriceChart } from "./PriceChart";
import { Card } from "./ui";

const pct = (v: number) => `%${v.toLocaleString("tr-TR", { maximumFractionDigits: 1 })}`;

/** Varlık dağılımı: halka grafik + etiketli liste (renk tek başına kimlik taşımaz). */
export function AllocationDonut({ summary }: { summary: PortfolioSummary }) {
  const [hover, setHover] = useState<string | null>(null);
  const slices = summary.allocation;
  const R = 42;
  const C = 2 * Math.PI * R;
  // Dilimler arasında 2px boşluk (yüzey rengi) bırak.
  const gap = slices.length > 1 ? 1.2 : 0;
  // Her dilimin başlangıç konumu (önceki dilimlerin toplam uzunluğu)
  const starts = slices.map((_, i) => slices.slice(0, i).reduce((sum, x) => sum + (x.pct / 100) * C, 0));
  const active = slices.find((s) => s.assetType === hover) ?? null;

  return (
    <Card className="p-4 md:p-6">
      <h2 className="mb-3 text-sm font-medium text-slate-300">Varlık dağılımı</h2>
      <div className="flex flex-col items-center gap-5 sm:flex-row sm:items-center">
        <div className="relative h-40 w-40 shrink-0">
          <svg viewBox="0 0 100 100" className="h-full w-full -rotate-90" role="img" aria-label="Varlık dağılımı halka grafiği">
            <circle cx="50" cy="50" r={R} fill="none" stroke="var(--color-surface-2)" strokeWidth="12" />
            {slices.map((s, i) => {
              const len = (s.pct / 100) * C;
              const dash = Math.max(len - gap, 0.01);
              return (
                <circle
                  key={s.assetType}
                  cx="50"
                  cy="50"
                  r={R}
                  fill="none"
                  stroke={ASSET_TYPE_INFO[s.assetType].color}
                  strokeWidth={hover === s.assetType ? 14 : 12}
                  strokeDasharray={`${dash} ${C - dash}`}
                  strokeDashoffset={-starts[i]}
                  opacity={hover && hover !== s.assetType ? 0.45 : 1}
                  onMouseEnter={() => setHover(s.assetType)}
                  onMouseLeave={() => setHover(null)}
                  onClick={() => setHover((h) => (h === s.assetType ? null : s.assetType))}
                  className="cursor-pointer transition-[stroke-width,opacity]"
                >
                  <title>{`${ASSET_TYPE_INFO[s.assetType].label}: ${formatMoney(s.valueTry)} (${pct(s.pct)})`}</title>
                </circle>
              );
            })}
          </svg>
          <div className="num pointer-events-none absolute inset-0 flex flex-col items-center justify-center text-center">
            <span className="text-xs text-slate-400">{active ? ASSET_TYPE_INFO[active.assetType].label : "Toplam"}</span>
            <span className="text-sm font-semibold">{formatMoney(active ? active.valueTry : summary.totals.valueTry, "TRY", 0)}</span>
            {active && <span className="text-xs text-slate-400">{pct(active.pct)}</span>}
          </div>
        </div>
        <ul className="num w-full space-y-2 text-sm">
          {slices.map((s) => (
            <li
              key={s.assetType}
              className={`flex items-center gap-2 rounded-lg px-1 ${hover === s.assetType ? "bg-surface-2" : ""}`}
              onMouseEnter={() => setHover(s.assetType)}
              onMouseLeave={() => setHover(null)}
            >
              <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: ASSET_TYPE_INFO[s.assetType].color }} />
              <span className="text-slate-300">{ASSET_TYPE_INFO[s.assetType].label}</span>
              <span className="ml-auto text-slate-400">{formatMoney(s.valueTry)}</span>
              <span className="w-14 text-right font-medium">{pct(s.pct)}</span>
            </li>
          ))}
        </ul>
      </div>
    </Card>
  );
}

/** Günlük anlık görüntülerden portföy değeri çizgisi (ilk kayıttan başlar). */
export function PortfolioHistory({ mode }: { mode: Mode }) {
  const { data } = usePolling<{ mode: Mode; points: SnapshotPoint[] }>(`/api/portfolio/history?mode=${mode}`, 5 * 60_000);
  const points = data && data.mode === mode ? data.points : null;
  if (!points) return null;

  const first = points[0];
  const last = points[points.length - 1];
  const change = first && last && first.valueTry > 0 ? ((last.valueTry - first.valueTry) / first.valueTry) * 100 : null;
  // Gün tarihleri İstanbul gece yarısı olarak çizilir (PriceChart +3 saat kaydırır).
  const series = points.map((p) => ({ time: Date.UTC(+p.date.slice(0, 4), +p.date.slice(5, 7) - 1, +p.date.slice(8, 10)) / 1000 - 3 * 3600, value: p.valueTry }));

  return (
    <Card className="p-4 md:p-6">
      <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-sm font-medium text-slate-300">{mode === "virtual" ? "Sanal portföy değeri" : "Portföy değeri"} (günlük)</h2>
        {points.length >= 2 && change != null && (
          <span className="num text-sm text-slate-400">
            {formatDate(first.date)}’den bu yana <span className={pnlClass(change)}>{formatPercent(change)}</span>
          </span>
        )}
      </div>
      {points.length >= 2 ? (
        <PriceChart points={series} currency="TRY" height={220} />
      ) : (
        <p className="py-6 text-center text-sm text-slate-500">
          {points.length === 0
            ? "Değer geçmişi henüz yok. Uygulama açık kaldıkça her gün portföy değeri kaydedilir."
            : `İlk kayıt ${formatDate(points[0].date)} tarihinde alındı (${formatMoney(points[0].valueTry)}). Grafik için en az iki günlük kayıt gerekir.`}
        </p>
      )}
    </Card>
  );
}
