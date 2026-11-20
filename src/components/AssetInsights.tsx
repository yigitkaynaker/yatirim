"use client";

import { useState } from "react";
import type { Mode } from "@/lib/assets";
import type { HeadlineSet } from "@/lib/freeNews";
import type { WhyMoving } from "@/lib/dailySummary";
import type { MarketMood } from "@/lib/analytics";
import { formatPercent, pnlClass } from "@/lib/format";
import { usePolling } from "@/lib/usePolling";
import { Card, Explain } from "./ui";

// Varlık / pozisyon sayfası ek bölümleri: ücretsiz "Son haberler", "Neden hareket ediyor?",
// "aldığımdan beri" kıyaslaması; Piyasa sayfası için "Piyasa duygusu".

function when(ms: number | null) {
  if (!ms) return "";
  const d = new Date(ms);
  const mins = Math.round((Date.now() - ms) / 60_000);
  if (mins < 60) return `${Math.max(1, mins)} dk önce`;
  if (mins < 24 * 60) return `${Math.round(mins / 60)} sa önce`;
  return d.toLocaleString("tr-TR", { timeZone: "Europe/Istanbul", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
}

// ---- Son haberler ---------------------------------------------------------------------------

export function HeadlinesPanel({ instrument, name }: { instrument: string; name?: string | null }) {
  const { data, loading } = usePolling<HeadlineSet>(`/api/headlines?id=${encodeURIComponent(instrument)}${name ? `&ad=${encodeURIComponent(name)}` : ""}`, 20 * 60_000);
  const items = data && data.instrument === instrument ? data.items : null;
  return (
    <Card className="p-4 md:p-5">
      <div className="flex items-baseline justify-between gap-2">
        <h2 className="font-semibold">Son haberler</h2>
        <span className="text-[11px] text-slate-500">Google Haberler · Yahoo Finance (ücretsiz)</span>
      </div>
      <p className="mt-1 text-xs text-slate-500">Son 1 günün haber başlıkları. Yapay zeka kullanılmaz; başlığa dokununca haber yeni sekmede açılır. Başlık tek başına bütün hikâyeyi anlatmaz.</p>
      {!items ? (
        <p className="mt-3 text-sm text-slate-500">{loading ? "Yükleniyor…" : "Başlıklar alınamadı."}</p>
      ) : items.length === 0 ? (
        <p className="mt-3 text-sm text-slate-400">Son 1 günde bu varlıkla ilgili başlık bulunamadı.</p>
      ) : (
        <ul className="mt-2 divide-y divide-line/60">
          {items.slice(0, 8).map((h) => (
            <li key={h.url} className="py-2">
              <a href={h.url} target="_blank" rel="noopener noreferrer" className="text-sm text-slate-200 hover:underline">
                {h.title}
              </a>
              <div className="text-[11px] text-slate-500">
                {h.publisher ?? h.feed}
                {h.publishedAt ? ` · ${when(h.publishedAt)}` : ""}
              </div>
            </li>
          ))}
        </ul>
      )}
      {data?.stale && items && items.length > 0 && <p className="mt-1 text-[11px] text-amber-300">Kaynağa şu an ulaşılamıyor; son alınan başlıklar gösteriliyor.</p>}
    </Card>
  );
}

// ---- Neden hareket ediyor? ----------------------------------------------------------------

export const WHY_MIN_MOVE = 3;

export function WhyMovingButton({ instrument, changePct }: { instrument: string; changePct: number | null | undefined }) {
  const [state, setState] = useState<{ loading: boolean; data: WhyMoving | null; error: string | null }>({ loading: false, data: null, error: null });
  if (changePct == null || Math.abs(changePct) < WHY_MIN_MOVE) return null;
  async function run() {
    setState({ loading: true, data: null, error: null });
    const res = await fetch(`/api/why?id=${encodeURIComponent(instrument)}`, { method: "POST" }).catch(() => null);
    if (!res || !res.ok) return setState({ loading: false, data: null, error: "Açıklama alınamadı." });
    setState({ loading: false, data: (await res.json()) as WhyMoving, error: null });
  }
  const d = state.data;
  return (
    <Card className="p-4 md:p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="font-semibold">
            Bugün <span className={pnlClass(changePct)}>{formatPercent(changePct)}</span> — neden hareket ediyor?
          </h2>
          <p className="text-xs text-slate-500">Önce ücretsiz haber başlıklarına ve KAP&apos;a bakılır; yapay zeka (varsa) yalnızca bunları özetler, web araması yapmaz.</p>
        </div>
        <button onClick={run} disabled={state.loading} className="rounded-xl border border-line px-3 py-2 text-sm text-slate-200 hover:bg-surface-2 disabled:opacity-50">
          {state.loading ? "Bakılıyor…" : d ? "Yenile" : "Neden hareket ediyor?"}
        </button>
      </div>
      {state.error && <p className="mt-2 text-sm text-rose-300">{state.error}</p>}
      {d && (
        <div className="mt-3 space-y-2">
          <p className="whitespace-pre-line text-sm leading-relaxed text-slate-300">{d.text}</p>
          {d.unverified.length > 0 && (
            <p className="text-xs text-amber-200">
              <span className="mr-1 rounded bg-amber-500/20 px-1.5 py-0.5 font-semibold">doğrulanamayan rakam</span>
              {d.unverified.join(" · ")}
            </p>
          )}
          {(d.kap.length > 0 || d.headlines.length > 0) && (
            <ul className="space-y-1 text-xs">
              {d.kap.map((k) => (
                <li key={k.url}>
                  <a href={k.url} target="_blank" rel="noopener noreferrer" className="text-sky-300 hover:underline">
                    KAP: {k.subject}
                  </a>
                </li>
              ))}
              {d.headlines.slice(0, 5).map((h) => (
                <li key={h.url}>
                  <a href={h.url} target="_blank" rel="noopener noreferrer" className="text-sky-300 hover:underline">
                    {h.title}
                  </a>{" "}
                  <span className="text-slate-500">— {h.publisher ?? h.feed}</span>
                </li>
              ))}
            </ul>
          )}
          <p className="text-[11px] text-slate-500">{d.ai ? "Yapay zeka özeti (ucuz model, web araması yok)." : "Yapay zekasız: yalnızca kaynak listesi."} Yatırım tavsiyesi değildir.</p>
        </div>
      )}
    </Card>
  );
}

// ---- Aldığımdan beri ----------------------------------------------------------------------

interface PositionBench {
  position: { since: string; asset: { label: string; returnPct: number | null }; benchmark: { label: string; returnPct: number | null } } | null;
}

export function SincePurchase({ mode, instrument }: { mode: Mode; instrument: string }) {
  const { data } = usePolling<PositionBench>(`/api/analytics?mode=${mode}&id=${encodeURIComponent(instrument)}`, 30 * 60_000);
  const p = data?.position;
  if (!p) return null;
  const diff = p.asset.returnPct != null && p.benchmark.returnPct != null ? p.asset.returnPct - p.benchmark.returnPct : null;
  return (
    <Card className="p-4 md:p-5">
      <h2 className="font-semibold">Aldığımdan beri ({p.since.split("-").reverse().join(".")})</h2>
      <div className="num mt-2 grid grid-cols-2 gap-2 text-sm">
        <div className="rounded-xl border border-line px-3 py-2">
          <div className="text-xs text-slate-500">{p.asset.label}</div>
          <div className={`font-medium ${pnlClass(p.asset.returnPct)}`}>{formatPercent(p.asset.returnPct)}</div>
        </div>
        <div className="rounded-xl border border-line px-3 py-2">
          <div className="text-xs text-slate-500">{p.benchmark.label}</div>
          <div className={`font-medium ${pnlClass(p.benchmark.returnPct)}`}>{formatPercent(p.benchmark.returnPct)}</div>
        </div>
      </div>
      {diff != null && (
        <p className="mt-2 text-sm text-slate-300">
          Bu varlık, aynı sürede {p.benchmark.label}&apos;e göre <span className={pnlClass(diff)}>{Math.abs(diff).toLocaleString("tr-TR", { maximumFractionDigits: 1 })} puan {diff >= 0 ? "daha iyi" : "daha kötü"}</span> gitti.
        </p>
      )}
      <Explain className="mt-2" title="Neden karşılaştırıyoruz?">
        Kıyaslama (benchmark), &quot;bu parayı genel piyasaya koysaydım ne olurdu?&quot; sorusunun cevabıdır. Her ikisi de ilk alış gününden bugüne fiyat değişimidir (kendi para
        biriminde, temettü ve kur hariç).
      </Explain>
    </Card>
  );
}

// ---- Piyasa duygusu -----------------------------------------------------------------------

const MOOD_COLOR = (v: number) => (v <= 24 ? "#f43f5e" : v <= 44 ? "#fb923c" : v <= 55 ? "#94a3b8" : v <= 75 ? "#4ade80" : "#22c55e");

export function MarketMoodCard() {
  const { data } = usePolling<{ mood: MarketMood | null }>("/api/mood", 60 * 60_000);
  const m = data?.mood;
  if (data && !m) return null;
  const hist = m?.history ?? [];
  const W = 200;
  const H = 40;
  const path = hist.map((p, i) => `${i ? "L" : "M"}${((i / Math.max(1, hist.length - 1)) * W).toFixed(1)},${(H - (p.value / 100) * H).toFixed(1)}`).join("");
  return (
    <Card className="p-4 md:p-5">
      <div className="flex items-baseline justify-between gap-2">
        <h2 className="font-semibold">Piyasa duygusu (kripto)</h2>
        <a href="https://alternative.me/crypto/fear-and-greed-index/" target="_blank" rel="noopener noreferrer" className="text-[11px] text-slate-400 hover:underline">
          Kaynak: alternative.me
        </a>
      </div>
      {!m ? (
        <p className="mt-2 text-sm text-slate-500">Yükleniyor…</p>
      ) : (
        <div className="mt-2 flex flex-wrap items-center gap-4">
          <div>
            <div className="num text-3xl font-semibold" style={{ color: MOOD_COLOR(m.value) }}>
              {m.value}
            </div>
            <div className="text-sm font-medium" style={{ color: MOOD_COLOR(m.value) }}>
              {m.label}
            </div>
          </div>
          <div className="min-w-0 flex-1">
            <svg viewBox={`0 0 ${W} ${H}`} className="h-10 w-full" preserveAspectRatio="none" role="img" aria-label="Son 30 günün endeks değeri">
              <line x1={0} x2={W} y1={H / 2} y2={H / 2} stroke="#334155" strokeDasharray="3 3" vectorEffect="non-scaling-stroke" />
              <path d={path} fill="none" stroke={MOOD_COLOR(m.value)} strokeWidth={1.8} vectorEffect="non-scaling-stroke" />
            </svg>
            <div className="text-[11px] text-slate-500">
              Son 30 gün · {new Date(m.time).toLocaleDateString("tr-TR", { timeZone: "Europe/Istanbul" })} verisi{m.stale ? " · güncellenemedi" : ""}
            </div>
          </div>
        </div>
      )}
      <p className="mt-2 text-xs text-slate-500">
        Kripto piyasasındaki genel ruh hâlini 0 (Aşırı Korku) ile 100 (Aşırı Açgözlülük) arasında ölçen bir endekstir; herkes korkarken fiyatlar çoğu zaman düşmüş,
        herkes açgözlüyken yükselmiş olur. Al/sat sinyali değildir. Veri: alternative.me Crypto Fear &amp; Greed Index, günde bir kez güncellenir.
      </p>
    </Card>
  );
}
