"use client";

import Link from "next/link";
import { useState } from "react";
import { displaySymbol } from "@/lib/assets";
import type { NewsItem, NewsReport } from "@/lib/news";
import { goToLogin, usePolling } from "@/lib/usePolling";
import { AiMissingKey, BudgetLine } from "./AiNotice";
import { Card } from "./ui";
import { EmptyState } from "./help";

interface NewsData {
  configured: boolean;
  sharedMissing?: boolean;
  running: boolean;
  budget: { spentUsd: number; budgetUsd: number; overBudget: boolean };
  settings: { scheduleEnabled: boolean; scheduleTimes: string[]; maxSearches: number };
  reports: NewsReport[];
}

const SENTIMENT: Record<NewsItem["sentiment"], { label: string; cls: string }> = {
  olumlu: { label: "Olumlu", cls: "bg-emerald-500/15 text-emerald-300" },
  olumsuz: { label: "Olumsuz", cls: "bg-rose-500/15 text-rose-300" },
  nötr: { label: "Nötr", cls: "bg-slate-500/20 text-slate-300" },
};

const TRIGGER: Record<NewsReport["trigger"], string> = { otomatik: "Otomatik", manuel: "Elle", varlik: "Tek varlık" };

export function fmtDateTime(sqlUtc: string) {
  return new Date(sqlUtc.replace(" ", "T") + "Z").toLocaleString("tr-TR", { dateStyle: "medium", timeStyle: "short" });
}

function host(url: string) {
  try {
    return new URL(url).host.replace(/^www\./, "");
  } catch {
    return url;
  }
}

function Importance({ n }: { n: number }) {
  return (
    <span className="inline-flex items-center gap-0.5" title={`Önem: ${n}/5`} aria-label={`Önem ${n} / 5`}>
      {[1, 2, 3, 4, 5].map((i) => (
        <span key={i} className={`h-1.5 w-3 rounded-full ${i <= n ? (n >= 4 ? "bg-amber-400" : "bg-sky-400") : "bg-surface-2"}`} />
      ))}
    </span>
  );
}

export function NewsItemView({ it }: { it: NewsItem }) {
  const s = SENTIMENT[it.sentiment];
  return (
    <li className="space-y-1.5 px-4 py-3">
      <div className="flex flex-wrap items-center gap-2">
        <Link href={`/piyasa/detay?id=${encodeURIComponent(it.instrument)}`} className="font-medium hover:underline">
          {displaySymbol(it.assetType, it.symbol)}
        </Link>
        <span className={`rounded-md px-1.5 py-0.5 text-xs font-medium ${s.cls}`}>{s.label}</span>
        <Importance n={it.importance} />
        {it.confidence && (
          <span className="rounded-md bg-surface-2 px-1.5 py-0.5 text-[11px] text-slate-300" title="Yapay zekanın bu değerlendirmeye güveni. Kaynak az ya da çelişkiliyse düşüktür.">
            güven: {it.confidence}
          </span>
        )}
        {it.unverified && it.unverified.length > 0 && (
          <span
            className="rounded-md bg-amber-500/15 px-1.5 py-0.5 text-[11px] font-medium text-amber-200"
            title={`Şu rakamlar yapay zekaya verilen verilerde bulunamadı: ${it.unverified.join(", ")}. Hesaplanmış ya da hatalı olabilir.`}
          >
            doğrulanamayan rakam
          </span>
        )}
      </div>
      <p className="text-sm text-slate-300">{it.summary}</p>
      {it.positionImpact && (
        <p className="text-sm text-slate-400">
          <span className="text-slate-500">Pozisyonunuza etkisi: </span>
          {it.positionImpact}
        </p>
      )}
      {(it.scenarioPositive || it.scenarioNegative) && (
        <div className="grid gap-1.5 text-xs sm:grid-cols-2">
          {it.scenarioPositive && (
            <p className="rounded-lg bg-emerald-500/5 px-2 py-1.5 text-slate-300">
              <span className="text-emerald-300">Olumlu senaryo: </span>
              {it.scenarioPositive}
            </p>
          )}
          {it.scenarioNegative && (
            <p className="rounded-lg bg-rose-500/5 px-2 py-1.5 text-slate-300">
              <span className="text-rose-300">Olumsuz senaryo: </span>
              {it.scenarioNegative}
            </p>
          )}
        </div>
      )}
      {it.sources.length > 0 ? (
        <div className="flex flex-wrap gap-1.5 text-xs">
          {it.sources.map((u) => (
            <a key={u} href={u} target="_blank" rel="noreferrer" className="rounded-md bg-surface-2 px-1.5 py-0.5 text-sky-300 hover:underline">
              {host(u)}
            </a>
          ))}
        </div>
      ) : (
        <p className="text-xs text-slate-500">Kaynak yok</p>
      )}
    </li>
  );
}

function ReportCard({ r, open, onToggle }: { r: NewsReport; open: boolean; onToggle: () => void }) {
  const top = r.items.filter((i) => i.importance >= 4).length;
  return (
    <Card className="overflow-hidden">
      <button onClick={onToggle} className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-surface-2/50">
        <div className="min-w-0 flex-1">
          <div className="text-sm font-medium">
            {fmtDateTime(r.createdAt)} · <span className="text-slate-400">{TRIGGER[r.trigger]}</span>
            {r.scope && <span className="text-slate-400"> · {r.scope.split(":")[1]}</span>}
          </div>
          <div className="text-xs text-slate-500">
            {r.status === "running" && <span className="text-violet-300">Analiz sürüyor…</span>}
            {r.status === "error" && <span className="text-rose-300">Hata: {r.error}</span>}
            {r.status === "ok" && (
              <>
                {r.items.length} varlık{top > 0 && <span className="text-amber-300"> · {top} önemli</span>} · {r.webSearches} arama · ~${r.costUsd.toFixed(3)}
              </>
            )}
          </div>
        </div>
        {r.status === "ok" && <span className="text-slate-500">{open ? "▴" : "▾"}</span>}
      </button>
      {open && r.status === "ok" && (
        <div className="border-t border-line">
          {r.marketSummary && (
            <div className="bg-surface-2/40 px-4 py-3 text-sm">
              <div className="mb-1 text-xs font-medium tracking-wide text-slate-500 uppercase">Genel piyasa</div>
              <p className="text-slate-300">{r.marketSummary}</p>
            </div>
          )}
          <ul className="divide-y divide-line/70">
            {r.items.map((it) => (
              <NewsItemView key={it.instrument} it={it} />
            ))}
          </ul>
        </div>
      )}
    </Card>
  );
}

export function NewsView() {
  const [fast, setFast] = useState(false);
  const { data, reload } = usePolling<NewsData>("/api/news", fast ? 4_000 : 60_000);
  const [openId, setOpenId] = useState<number | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [starting, setStarting] = useState(false);

  const running = !!data?.running || !!data?.reports.some((r) => r.status === "running");
  if (fast !== running && data) setFast(running);
  const shownOpen = openId ?? data?.reports.find((r) => r.status === "ok")?.id ?? null;

  async function scan() {
    setStarting(true);
    setMsg(null);
    try {
      const res = await fetch("/api/news/scan", { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" });
      if (res.status === 401) return goToLogin();
      const d = (await res.json().catch(() => ({}))) as { error?: string; warning?: string | null; report?: NewsReport };
      if (!res.ok) throw new Error(d.error ?? "Analiz başlatılamadı.");
      setMsg({ ok: true, text: d.warning ?? "Analiz başladı. Genellikle 30–90 saniye sürer." });
      if (d.report) setOpenId(d.report.id);
      setFast(true);
      void reload();
    } catch (err) {
      setMsg({ ok: false, text: (err as Error).message });
    } finally {
      setStarting(false);
    }
  }

  return (
    <div className="space-y-4 md:space-y-6">
      <div className="flex flex-wrap items-center gap-2">
        <h1 className="text-xl font-semibold tracking-tight">Analizler</h1>
        {data?.configured && (
          <button
            onClick={scan}
            disabled={starting || running}
            className="ml-auto rounded-xl bg-violet-500 px-4 py-2 text-sm font-semibold text-white hover:brightness-110 disabled:opacity-50"
          >
            {running ? "Analiz sürüyor…" : starting ? "Başlatılıyor…" : "Şimdi analiz et"}
          </button>
        )}
      </div>

      {!data ? (
        <p className="text-sm text-slate-500">Yükleniyor…</p>
      ) : !data.configured ? (
        <AiMissingKey shared={data.sharedMissing} />
      ) : (
        <>
          <Card className="space-y-3 p-4">
            <p className="text-sm text-slate-400">
              Yapay zeka; gerçek ve sanal pozisyonlarınızı, izleme listenizi ve bekleyen emirlerinizi webde arayıp her varlık için kısa bir değerlendirme yazar. Önemi 4 ve
              üzeri olan haberler bildirim olarak gelir.{" "}
              {data.settings.scheduleEnabled ? (
                <>Otomatik tarama: hafta içi {data.settings.scheduleTimes.join(", ")}.</>
              ) : (
                <>Otomatik tarama kapalı.</>
              )}{" "}
              <Link href="/ayarlar" className="text-accent">
                Ayarlar
              </Link>
            </p>
            <BudgetLine spentUsd={data.budget.spentUsd} budgetUsd={data.budget.budgetUsd} />
          </Card>

          {msg && (
            <p role="status" className={`rounded-xl px-3 py-2 text-sm ${msg.ok ? "bg-emerald-500/10 text-emerald-300" : "bg-rose-500/10 text-rose-300"}`}>
              {msg.text}
            </p>
          )}

          {data.reports.length === 0 ? (
            <EmptyState
              title="Henüz analiz yok"
              action={data.configured ? { label: "Şimdi analiz et", onClick: () => void scan() } : { label: "Yapay zeka anahtarı ekle", href: "/ayarlar#anahtar" }}
              guide={{ href: "/kilavuz#yapay-zeka", label: "Kılavuz: Haber analizi ve maliyeti" }}
            >
              Analizler, portföyündeki ve izleme listendeki varlıklarla ilgili haberleri yapay zekayla tarar; her biri için kısa özet, önem ve kaynak bağlantıları
              verir. Her tarama küçük bir ücret tutar.
            </EmptyState>
          ) : (
            <div className="space-y-3">
              {data.reports.map((r) => (
                <ReportCard key={r.id} r={r} open={shownOpen === r.id} onToggle={() => setOpenId(shownOpen === r.id ? -1 : r.id)} />
              ))}
            </div>
          )}
          <p className="text-center text-xs text-slate-500">Analizler yapay zeka tarafından üretilir ve hata içerebilir. Yatırım tavsiyesi değildir.</p>
        </>
      )}
    </div>
  );
}
