"use client";

import { formatNumber } from "@/lib/format";
import { SIGNAL_DISCLAIMER, type SignalLabel } from "@/lib/signalRules";
import type { TechnicalAnalysis } from "@/lib/technical";
import { Card } from "./ui";
import { InfoTip } from "./help";

// Teknik analiz bölümü (varlık detayı) ve sinyal rozeti / uyarısı (Sinyaller sayfası da kullanır).

export const SIGNAL_STYLE: Record<SignalLabel, string> = {
  "Güçlü Al": "bg-emerald-500/25 text-emerald-200 ring-emerald-400/40",
  Al: "bg-emerald-500/10 text-emerald-300 ring-emerald-400/25",
  Nötr: "bg-slate-500/15 text-slate-300 ring-slate-400/25",
  Sat: "bg-rose-500/10 text-rose-300 ring-rose-400/25",
  "Güçlü Sat": "bg-rose-500/25 text-rose-200 ring-rose-400/40",
};

export function SignalBadge({ label, score, large = false }: { label: SignalLabel; score?: number | null; large?: boolean }) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-lg font-semibold whitespace-nowrap ring-1 ${SIGNAL_STYLE[label]} ${
        large ? "px-3 py-1.5 text-base" : "px-2 py-0.5 text-xs"
      }`}
    >
      {label}
      {score != null && <span className="num font-normal opacity-75">{score > 0 ? `+${score}` : score}</span>}
    </span>
  );
}

export function SignalDisclaimer({ className = "" }: { className?: string }) {
  return (
    <p className={`rounded-xl border border-amber-500/20 bg-amber-500/5 px-3 py-2 text-xs text-amber-200/90 ${className}`}>
      ⚠ {SIGNAL_DISCLAIMER}
    </p>
  );
}

function formatIndicator(key: string, v: number | null): string {
  if (v == null) return "—";
  if (key === "rsi") return formatNumber(v, 1);
  if (key === "volume") return `${formatNumber(v, 2)}×`;
  if (key === "macd") return formatNumber(v, Math.abs(v) < 1 ? 4 : 2);
  return formatNumber(v, Math.abs(v) < 1 ? 6 : Math.abs(v) < 100 ? 4 : 2);
}

const fmtDay = new Intl.DateTimeFormat("tr-TR", { day: "numeric", month: "long", year: "numeric", timeZone: "Europe/Istanbul" });

export function TechnicalPanel({ data, error }: { data: TechnicalAnalysis | null; error: string | null }) {
  return (
    <Card className="space-y-4 p-4 md:p-6">
      <div>
        <h2 className="font-semibold">Teknik Analiz</h2>
        <p className="mt-1 text-sm text-slate-500">
          Günlük kapanış fiyatlarından hesaplanan göstergeler. Her biri fiyatın geçmiş hareketine farklı bir açıdan bakar.
        </p>
      </div>

      {error ? (
        <p className="rounded-xl bg-rose-500/10 px-3 py-2 text-sm text-rose-300">{error}</p>
      ) : !data ? (
        <p className="text-sm text-slate-500">Göstergeler hesaplanıyor…</p>
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-3">
            <SignalBadge label={data.summary.label} score={data.summary.insufficient ? null : data.summary.score} large />
            <p className="min-w-0 flex-1 text-sm text-slate-300">{data.labelExplain}</p>
          </div>
          <p className="text-xs text-slate-500">
            Puan <InfoTip term="sinyal-skoru" className="mx-0.5" />, aşağıdaki nedenlerin toplamıdır: +2 ve üstü Al, +5 ve üstü Güçlü Al; −2 ve altı Sat, −5 ve altı Güçlü Sat; arası Nötr.
            {data.asOf ? ` Son veri: ${fmtDay.format(new Date(data.asOf * 1000))} (${data.snapshot.bars} gün).` : ""}
          </p>

          {data.summary.reasons.length > 0 && (
            <div>
              <h3 className="mb-2 text-sm font-medium text-slate-300">Neden bu sinyal?</h3>
              <ul className="space-y-2">
                {data.summary.reasons.map((r) => (
                  <li key={r.id} className="flex gap-3 rounded-xl border border-line bg-bg px-3 py-2.5">
                    <span
                      className={`num mt-0.5 h-6 min-w-9 shrink-0 rounded-md px-1.5 text-center text-sm leading-6 font-semibold ${
                        r.points > 0 ? "bg-emerald-500/15 text-emerald-300" : "bg-rose-500/15 text-rose-300"
                      }`}
                    >
                      {r.points > 0 ? `+${r.points}` : r.points}
                    </span>
                    <div className="min-w-0">
                      <div className="text-sm font-medium text-slate-100">{r.title}</div>
                      <div className="text-sm text-slate-400">{r.explain}</div>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div>
            <h3 className="mb-2 text-sm font-medium text-slate-300">Gösterge değerleri</h3>
            <dl className="grid gap-2 sm:grid-cols-2">
              {data.indicators.map((row) => (
                <div key={row.key} className="rounded-xl border border-line bg-bg px-3 py-2.5">
                  <div className="flex items-baseline justify-between gap-2">
                    <dt className="text-sm text-slate-300">{row.label}</dt>
                    <dd className="num font-semibold">{formatIndicator(row.key, row.value)}</dd>
                  </div>
                  <p className="mt-1 text-sm text-slate-200">{row.state}</p>
                  <p className="mt-0.5 text-xs text-slate-500">{row.explain}</p>
                </div>
              ))}
            </dl>
          </div>
        </>
      )}

      <SignalDisclaimer />
    </Card>
  );
}
