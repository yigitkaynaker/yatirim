"use client";

import { useState } from "react";
import { ASSET_TYPE_INFO, ASSET_TYPES, type AssetType, type Mode } from "@/lib/assets";
import type { BenchmarkResult, RiskResult } from "@/lib/analytics";
import type { DailySummary } from "@/lib/dailySummary";
import { formatMoney, formatPercent, pnlClass } from "@/lib/format";
import { usePolling } from "@/lib/usePolling";
import { Card, Explain, inputCls, PrimaryButton } from "./ui";
import { InfoTip } from "./help";

// Portföy sayfası ek kartları: Günlük özet, kıyaslama (benchmark) ve risk.

// ---- Günlük özet ---------------------------------------------------------------------------

export function DailySummaryCard() {
  const { data, reload } = usePolling<{ summary: DailySummary | null; aiConfigured: boolean; time: string }>("/api/summary", 10 * 60_000);
  const [busy, setBusy] = useState(false);
  const s = data?.summary ?? null;

  async function generate() {
    setBusy(true);
    await fetch("/api/summary", { method: "POST" }).catch(() => null);
    await reload();
    setBusy(false);
  }

  return (
    <Card className="p-4 md:p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-semibold">Günlük özet</h2>
        <div className="flex items-center gap-2 text-xs text-slate-500">
          {s && (
            <span>
              {s.date.split("-").reverse().join(".")} · {s.ai ? "yapay zeka (web araması yok)" : "otomatik, yapay zekasız"}
            </span>
          )}
          <button onClick={generate} disabled={busy} className="rounded-lg border border-line px-2.5 py-1 text-xs text-slate-300 hover:bg-surface-2 disabled:opacity-50">
            {busy ? "Hazırlanıyor…" : s ? "Yenile" : "Şimdi oluştur"}
          </button>
        </div>
      </div>
      {s ? (
        <>
          <div className="mt-2 space-y-1 whitespace-pre-line text-sm leading-relaxed text-slate-300">{s.text}</div>
          {s.unverified.length > 0 && (
            <p className="mt-2 text-xs text-amber-200" title="Bu rakamlar özete verilen verilerde bulunamadı; hesaplanmış ya da hatalı olabilir.">
              <span className="mr-1 rounded bg-amber-500/20 px-1.5 py-0.5 font-semibold">doğrulanamayan rakam</span>
              {s.unverified.join(" · ")}
            </p>
          )}
        </>
      ) : !data ? (
        <p className="mt-2 text-sm text-slate-500">Yükleniyor…</p>
      ) : (
        <p className="mt-2 text-sm text-slate-400">Henüz özet yok. Her iş günü {data?.time ?? "18:45"}&apos;te otomatik hazırlanır ve bildirim olarak gelir.</p>
      )}
      <p className="mt-2 text-xs text-slate-500">
        Özet yalnızca uygulamadaki hazır verilerden (portföy, günün hareketleri, sinyaller, KAP, haber başlıkları, alarmlar) yazılır; ücretli web araması yapılmaz.
        {data && !data.aiConfigured && " Yapay zeka anahtarı olmadığı için kurallı özet gösteriliyor."}
      </p>
    </Card>
  );
}

// ---- Çizgi grafik (bağımlılıksız SVG) ----------------------------------------------------

function MultiLine({ dates, series, height = 180 }: { dates: string[]; series: { key: string; color: string; points: (number | null)[] }[]; height?: number }) {
  const all = series.flatMap((s) => s.points.filter((v): v is number => v != null));
  if (all.length === 0 || dates.length < 2) return null;
  const min = Math.min(...all, 100);
  const max = Math.max(...all, 100);
  const pad = (max - min) * 0.08 || 1;
  const lo = min - pad;
  const hi = max + pad;
  const W = 600;
  const x = (i: number) => (i / (dates.length - 1)) * W;
  const y = (v: number) => height - ((v - lo) / (hi - lo)) * height;
  return (
    <svg viewBox={`0 0 ${W} ${height}`} className="h-44 w-full" preserveAspectRatio="none" role="img" aria-label="Kıyaslama grafiği">
      <line x1={0} x2={W} y1={y(100)} y2={y(100)} stroke="#475569" strokeDasharray="4 4" strokeWidth={1} vectorEffect="non-scaling-stroke" />
      {series.map((s) => {
        let d = "";
        s.points.forEach((v, i) => {
          if (v == null) return;
          d += `${d ? "L" : "M"}${x(i).toFixed(1)},${y(v).toFixed(1)}`;
        });
        return <path key={s.key} d={d} fill="none" stroke={s.color} strokeWidth={s.key === "portfolio" ? 2.5 : 1.5} vectorEffect="non-scaling-stroke" />;
      })}
    </svg>
  );
}

// ---- Kıyaslama + risk (tek istek) ----------------------------------------------------------

export function PortfolioAnalytics({ mode }: { mode: Mode }) {
  const { data, reload } = usePolling<{ benchmark: BenchmarkResult; risk: RiskResult }>(`/api/analytics?mode=${mode}`, 10 * 60_000);
  const ok = data && data.benchmark.mode === mode ? data : null;
  return (
    <>
      <BenchmarkCard b={ok?.benchmark ?? null} />
      <RiskCard r={ok?.risk ?? null} onSaved={() => reload()} />
    </>
  );
}

function BenchmarkCard({ b }: { b: BenchmarkResult | null }) {
  return (
    <Card className="p-4 md:p-5">
      <h2 className="flex items-center gap-1.5 font-semibold">
        Portföyüm vs BIST 100 / Dolar / Gram altın <InfoTip term="benchmark" />
      </h2>
      <Explain className="mt-2" title="Kıyaslama (benchmark) nedir?">
        Yatırımınızın iyi gidip gitmediğini anlamak için onu basit alternatiflerle karşılaştırırız: &quot;Bu parayı BIST 100&apos;e, dolara ya da gram altına koysaydım ne olurdu?&quot;
        Hepsi ilk işleminizin olduğu gün 100 kabul edilir. Portföy çizgisi, eklediğiniz ya da çektiğiniz parayı getiri saymaz (zaman ağırlıklı getiri).
      </Explain>
      {!b ? (
        <p className="mt-3 text-sm text-slate-500">Yükleniyor…</p>
      ) : b.note ? (
        <p className="mt-3 text-sm text-slate-400">{b.note}</p>
      ) : (
        <>
          <div className="mt-3">
            <MultiLine dates={b.dates} series={b.series} />
            <div className="mt-1 flex justify-between text-[11px] text-slate-500">
              <span>{b.dates[0]?.split("-").reverse().join(".")}</span>
              <span>{b.dates[b.dates.length - 1]?.split("-").reverse().join(".")}</span>
            </div>
          </div>
          <ul className="num mt-2 grid grid-cols-2 gap-x-4 gap-y-1 text-sm sm:grid-cols-4">
            {b.series.map((s) => (
              <li key={s.key} className="flex items-center gap-2">
                <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: s.color }} />
                <span className="text-slate-400">{s.label}</span>
                <span className={`ml-auto ${pnlClass(s.returnPct)}`}>{formatPercent(s.returnPct)}</span>
              </li>
            ))}
          </ul>
        </>
      )}
    </Card>
  );
}

function Metric({ label, value, explain }: { label: string; value: string; explain: string }) {
  return (
    <div className="rounded-xl border border-line/70 px-3 py-2">
      <div className="text-xs text-slate-500">{label}</div>
      <div className="num font-medium">{value}</div>
      <div className="mt-0.5 text-[11px] leading-snug text-slate-500">{explain}</div>
    </div>
  );
}

const pctStr = (v: number) => `%${v.toLocaleString("tr-TR", { maximumFractionDigits: 1 })}`;

function RiskCard({ r, onSaved }: { r: RiskResult | null; onSaved: () => void }) {
  const [editing, setEditing] = useState(false);
  if (!r) return <Card className="p-4 text-sm text-slate-500">Risk hesaplanıyor…</Card>;
  const m = r.metrics;
  if (m.positionCount === 0) return null;
  const scoreCls = m.concentrationLabel === "yoğun" ? "text-rose-300" : m.concentrationLabel === "orta" ? "text-amber-300" : "text-emerald-300";
  return (
    <Card className="p-4 md:p-5">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="font-semibold">Risk</h2>
        <span className={`text-sm font-medium ${scoreCls}`}>
          Yoğunlaşma puanı {m.concentrationScore}/100 · {m.concentrationLabel}
        </span>
        <InfoTip term="risk-puani" />
      </div>
      <p className="mt-1 text-xs text-slate-500">
        Yoğunlaşma puanı, paranızın birkaç varlıkta ne kadar toplandığını gösterir (0: çok dağınık, 100: hepsi tek varlıkta). Tüm yumurtaları aynı sepete koymak, o
        varlık düşerse portföyün tamamının düşmesi demektir.
      </p>
      <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
        <Metric label="En büyük pozisyon" value={m.largest ? `${m.largest.name} · ${pctStr(m.largest.pct)}` : "—"} explain="Tek bir varlığın portföydeki payı. %30'un üstü yüksek sayılır." />
        <Metric label="İlk 3 pozisyon" value={pctStr(m.top3Pct)} explain="En büyük üç varlığın toplam payı. Ne kadar yüksekse o kadar yoğun." />
        <Metric label="Varlık türü sayısı" value={`${m.assetTypeCount} tür · ${m.positionCount} pozisyon`} explain="Hisse, altın, döviz, fon gibi farklı türler genelde birlikte aynı yöne gitmez; çeşitlilik riski azaltır." />
        <Metric
          label="Döviz / TL payı"
          value={`Döviz ${pctStr(m.foreignCurrencyPct)} · TL ${pctStr(m.tryPct)}`}
          explain="Fiyatı dolar gibi yabancı parayla belirlenen varlıkların payı. Kur yükselince TL değeri artar, düşünce azalır. (Altın TL fiyatlıdır ama dolarla birlikte hareket etme eğilimindedir.)"
        />
        <Metric
          label="Oynaklık (yıllık)"
          value={m.volatilityPct == null ? `Yetersiz veri (${m.volatilityDays} gün)` : pctStr(m.volatilityPct)}
          explain={`Portföy değerinin günden güne ne kadar inip çıktığı (yıllığa çevrilmiş). Yüksekse kısa vadede büyük düşüşler görebilirsiniz. En az 10 günlük kayıt gerekir.`}
        />
      </div>

      <div className="mt-4 border-t border-line/70 pt-3">
        <div className="flex items-center justify-between gap-2">
          <h3 className="text-sm font-medium">Hedef dağılım {r.target ? "" : "(isteğe bağlı)"}</h3>
          <button onClick={() => setEditing((e) => !e)} className="rounded-lg border border-line px-2.5 py-1 text-xs text-slate-300 hover:bg-surface-2">
            {editing ? "Vazgeç" : r.target ? "Düzenle" : "Hedef belirle"}
          </button>
        </div>
        <p className="mt-1 text-xs text-slate-500">Her varlık türüne ayırmak istediğiniz payı yazın; uygulama gerçek dağılımın hedeften ne kadar saptığını gösterir.</p>
        {editing && <TargetForm initial={r.target} onSaved={() => (setEditing(false), onSaved())} />}
        {!editing && r.drift.length > 0 && (
          <>
            <ul className="mt-3 space-y-2">
              {r.drift.map((d) => (
                <li key={d.key} className="text-sm">
                  <div className="flex justify-between gap-2">
                    <span>{d.label}</span>
                    <span className="num text-slate-400">
                      {pctStr(d.actualPct)} / hedef {pctStr(d.targetPct)}{" "}
                      <span className={Math.abs(d.driftPct) >= 5 ? "text-amber-300" : "text-slate-500"}>
                        ({d.driftPct > 0 ? "+" : ""}
                        {d.driftPct.toLocaleString("tr-TR", { maximumFractionDigits: 1 })} puan)
                      </span>
                    </span>
                  </div>
                  <div className="relative mt-1 h-2 overflow-hidden rounded-full bg-surface-2">
                    <div className="absolute inset-y-0 left-0 rounded-full" style={{ width: `${Math.min(100, d.actualPct)}%`, background: ASSET_TYPE_INFO[d.key as AssetType]?.color ?? "#94a3b8" }} />
                    <div className="absolute inset-y-[-2px] w-0.5 bg-white" style={{ left: `${Math.min(100, d.targetPct)}%` }} title="Hedef" />
                  </div>
                </li>
              ))}
            </ul>
            <div className="mt-3 rounded-xl border border-line/70 bg-bg/40 px-3 py-2 text-sm">
              <div className="font-medium">Dengelemek için</div>
              <ul className="num mt-1 space-y-0.5 text-slate-300">
                {r.drift
                  .filter((d) => Math.abs(d.adjustTry) >= 1)
                  .map((d) => (
                    <li key={d.key}>
                      {d.label}: {d.adjustTry > 0 ? "yaklaşık " + formatMoney(d.adjustTry) + " ekle" : "yaklaşık " + formatMoney(-d.adjustTry) + " azalt"}
                    </li>
                  ))}
              </ul>
              <p className="mt-1 text-xs text-slate-500">
                Basit bir hesaptır: hedef payları bugünkü toplam değerle çarpar. Alım satım maliyeti ve vergi hesaba katılmaz. Yatırım tavsiyesi değildir.
              </p>
            </div>
          </>
        )}
      </div>
    </Card>
  );
}

function TargetForm({ initial, onSaved }: { initial: Partial<Record<AssetType, number>> | null; onSaved: () => void }) {
  const [vals, setVals] = useState<Record<string, string>>(() => Object.fromEntries(ASSET_TYPES.map((t) => [t, initial?.[t] != null ? String(initial[t]) : ""])));
  const [error, setError] = useState<string | null>(null);
  const sum = Object.values(vals).reduce((s, v) => s + (Number(v.replace(",", ".")) || 0), 0);
  async function save(clear = false) {
    setError(null);
    const body = clear ? {} : Object.fromEntries(Object.entries(vals).filter(([, v]) => v.trim() !== ""));
    const res = await fetch("/api/analytics/target", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    if (!res.ok) return setError(((await res.json().catch(() => ({}))) as { error?: string }).error ?? "Kaydedilemedi.");
    onSaved();
  }
  return (
    <div className="mt-3 space-y-2">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        {ASSET_TYPES.map((t) => (
          <label key={t} className="text-xs text-slate-400">
            {ASSET_TYPE_INFO[t].label} (%)
            <input className={`${inputCls} mt-1`} inputMode="decimal" value={vals[t]} onChange={(e) => setVals((v) => ({ ...v, [t]: e.target.value }))} />
          </label>
        ))}
      </div>
      <p className={`text-xs ${Math.abs(sum - 100) < 0.5 ? "text-emerald-300" : "text-slate-500"}`}>Toplam: %{sum.toLocaleString("tr-TR")} (100 olmalı)</p>
      {error && <p className="rounded-xl bg-rose-500/10 px-3 py-2 text-sm text-rose-300">{error}</p>}
      <div className="flex gap-2">
        <PrimaryButton onClick={() => save()}>Kaydet</PrimaryButton>
        {initial && (
          <button onClick={() => save(true)} className="rounded-xl border border-line px-3 py-2 text-sm text-slate-300 hover:bg-surface-2">
            Hedefi kaldır
          </button>
        )}
      </div>
    </div>
  );
}
