"use client";

import Link from "next/link";
import { useState } from "react";
import type { NewsReport } from "@/lib/news";
import { goToLogin, usePolling } from "@/lib/usePolling";
import { AiMissingKey } from "./AiNotice";
import { fmtDateTime, NewsItemView } from "./NewsView";
import { Card } from "./ui";

interface Data {
  configured: boolean;
  running: boolean;
  latest: NewsReport | null;
}

/** Varlık detay sayfasındaki yapay zeka haber bölümü: son değerlendirme + "Bu varlığı analiz et". */
export function AssetNewsPanel({ instrument }: { instrument: string }) {
  const [fast, setFast] = useState(false);
  const { data, reload } = usePolling<Data>(`/api/news?instrument=${encodeURIComponent(instrument)}`, fast ? 4_000 : 120_000);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [starting, setStarting] = useState(false);
  const running = !!data?.running;
  if (data && fast !== running) setFast(running);
  const item = data?.latest?.items.find((i) => i.instrument === instrument) ?? null;

  async function analyze() {
    setStarting(true);
    setMsg(null);
    try {
      const res = await fetch("/api/news/scan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ instrument }),
      });
      if (res.status === 401) return goToLogin();
      const d = (await res.json().catch(() => ({}))) as { error?: string; warning?: string | null };
      if (!res.ok) throw new Error(d.error ?? "Analiz başlatılamadı.");
      setMsg({ ok: true, text: d.warning ?? "Analiz başladı; sonuç birazdan burada ve Analizler sayfasında görünecek." });
      setFast(true);
      void reload();
    } catch (err) {
      setMsg({ ok: false, text: (err as Error).message });
    } finally {
      setStarting(false);
    }
  }

  return (
    <Card className="overflow-hidden">
      <div className="flex flex-wrap items-center gap-2 px-4 py-3">
        <div className="min-w-0 flex-1">
          <h2 className="font-semibold">Yapay zeka haber analizi</h2>
          {data?.latest && item && <p className="text-xs text-slate-500">Son değerlendirme: {fmtDateTime(data.latest.createdAt)}</p>}
        </div>
        {data?.configured && (
          <button
            onClick={analyze}
            disabled={starting || running}
            className="rounded-xl bg-violet-500 px-3 py-2 text-sm font-semibold text-white hover:brightness-110 disabled:opacity-50"
          >
            {running ? "Analiz sürüyor…" : starting ? "Başlatılıyor…" : "Bu varlığı analiz et"}
          </button>
        )}
      </div>
      {data && !data.configured ? (
        <div className="px-4 pb-4">
          <AiMissingKey compact />
        </div>
      ) : (
        <>
          {msg && <p className={`mx-4 mb-3 rounded-xl px-3 py-2 text-sm ${msg.ok ? "bg-emerald-500/10 text-emerald-300" : "bg-rose-500/10 text-rose-300"}`}>{msg.text}</p>}
          {item ? (
            <ul className="border-t border-line">
              <NewsItemView it={item} />
            </ul>
          ) : (
            data && <p className="px-4 pb-4 text-sm text-slate-500">Bu varlık için henüz analiz yok.</p>
          )}
          <div className="border-t border-line px-4 py-2 text-xs text-slate-500">
            Yatırım tavsiyesi değildir.{" "}
            <Link href="/analizler" className="text-accent">
              Tüm analizler
            </Link>
          </div>
        </>
      )}
    </Card>
  );
}
