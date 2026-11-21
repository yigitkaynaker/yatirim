"use client";

import { formatMoney, formatPercent, formatSigned, pnlClass } from "@/lib/format";
import type { SanalRealityCheck } from "@/lib/reports";
import { usePolling } from "@/lib/usePolling";
import { Card } from "./ui";

// Sanal → gerçek gerçeklik kontrolü: sanal sonuçların ne kadar "gerçekçi" olduğunu gösterir.

export const REALITY_NOTE = "Sanal sonuçlar gerçek parayla aynı olmayabilir; duygular ve maliyetler farklıdır.";

export function SanalRealityCard({ compact = false }: { compact?: boolean }) {
  const { data, error } = usePolling<SanalRealityCheck>("/api/reality", 5 * 60_000);
  if (!data) {
    return compact ? null : <Card className="p-4 text-sm text-slate-500">{error ? "Sanal özet alınamadı." : "Sanal özet yükleniyor…"}</Card>;
  }
  const d = data;
  const pctTxt = d.feePct.toLocaleString("tr-TR", { maximumFractionDigits: 3 });
  const body = (
    <>
      <dl className={`num grid gap-x-4 gap-y-2.5 text-sm ${compact ? "grid-cols-2" : "grid-cols-2 sm:grid-cols-4"}`}>
        <div>
          <dt className="text-xs text-slate-500">Sanal işlem</dt>
          <dd>{d.trades}</dd>
        </div>
        <div>
          <dt className="text-xs text-slate-500">Kazanan / kaybeden</dt>
          <dd>
            <span className="text-emerald-300">{d.wins}</span> / <span className="text-rose-300">{d.losses}</span>
          </dd>
        </div>
        <div>
          <dt className="text-xs text-slate-500">En iyi</dt>
          <dd className={pnlClass(d.best?.pnlPct)}>{d.best ? `${d.best.name} ${formatPercent(d.best.pnlPct)}` : "—"}</dd>
        </div>
        <div>
          <dt className="text-xs text-slate-500">En kötü</dt>
          <dd className={pnlClass(d.worst?.pnlPct)}>{d.worst ? `${d.worst.name} ${formatPercent(d.worst.pnlPct)}` : "—"}</dd>
        </div>
        <div>
          <dt className="text-xs text-slate-500" title="Sanal portföyün en yüksek noktasından sonraki en derin düşüşü (para ekleme/çıkarma hariç).">
            En büyük düşüş
          </dt>
          <dd className={d.maxDrawdownPct ? "text-rose-300" : ""}>
            {d.maxDrawdownPct != null ? `−%${d.maxDrawdownPct.toLocaleString("tr-TR", { maximumFractionDigits: 1 })}` : "—"}
            {d.maxDrawdownPct == null && <span className="block text-[11px] text-slate-500">en az 2 günlük kayıt gerekir</span>}
          </dd>
        </div>
        <div>
          <dt className="text-xs text-slate-500">Tahmini komisyon</dt>
          <dd>
            {formatMoney(d.estFeesTry)}
            <span className="block text-[11px] text-slate-500">
              %{pctTxt} {d.feeAssumed ? "varsayımıyla" : "(hesap oranı)"}
            </span>
          </dd>
        </div>
        {d.best && !compact && (
          <div className="col-span-2">
            <dt className="text-xs text-slate-500">En iyi işlemin TL sonucu</dt>
            <dd className={pnlClass(d.best.pnlTry)}>
              {formatSigned(d.best.pnlTry)} {d.best.open ? "(açık pozisyon)" : "(kapandı)"}
            </dd>
          </div>
        )}
      </dl>
      <p className="mt-3 rounded-lg bg-violet-500/10 px-3 py-2 text-xs text-violet-100/90">{REALITY_NOTE} Gerçekte her alış-satışta komisyon ödenir ve düşüş anında sakin kalmak sanal portföydekinden zordur.</p>
    </>
  );
  if (compact) return <div className="mb-4 rounded-xl border border-violet-500/30 p-3">{body}</div>;
  return (
    <Card className="border-violet-500/30 p-4 md:p-6">
      <h2 className="font-semibold">Gerçeklik kontrolü</h2>
      <p className="mb-3 mt-1 text-xs text-slate-500">Sanal işlemlerin özeti. Gerçek paraya geçmeden önce bir bak.</p>
      {body}
    </Card>
  );
}
