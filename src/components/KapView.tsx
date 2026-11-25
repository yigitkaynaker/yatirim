"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import type { KapDisclosure } from "@/lib/kap";
import { goToLogin, usePolling } from "@/lib/usePolling";
import { KAP_EXPLAIN, KapItem } from "./AssetPanels";
import { Card, Explain, formatSourceTime } from "./ui";
import { EmptyState } from "./help";

interface KapData {
  items: KapDisclosure[];
  tickers: { symbol: string; real: boolean; virtual: boolean; watch: boolean }[];
  status: { lastOk: number | null; lastError: string | null };
  message?: string | null;
}

export function KapView() {
  const params = useSearchParams();
  const router = useRouter();
  const ticker = (params.get("hisse") ?? "").toUpperCase();
  const { data, error, reload } = usePolling<KapData>(`/api/kap?limit=150${ticker ? `&hisse=${encodeURIComponent(ticker)}` : ""}`, 2 * 60_000);
  const [checking, setChecking] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function checkNow() {
    setChecking(true);
    setMessage(null);
    try {
      const res = await fetch("/api/kap", { method: "POST" });
      if (res.status === 401) return goToLogin();
      const d = (await res.json().catch(() => ({}))) as KapData & { error?: string };
      setMessage(d.message ?? d.error ?? null);
      void reload();
    } catch {
      setMessage("Sunucuya ulaşılamadı.");
    } finally {
      setChecking(false);
    }
  }

  const setTicker = (t: string) => router.replace(t ? `/kap?hisse=${encodeURIComponent(t)}` : "/kap");

  return (
    <div className="space-y-4 md:space-y-6">
      <div className="flex items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">KAP bildirimleri</h1>
          <p className="text-sm text-slate-500">Portföyünüzdeki ve izleme listenizdeki hisselerin resmi açıklamaları</p>
        </div>
        <button onClick={checkNow} disabled={checking} className="shrink-0 rounded-xl border border-line px-3 py-2 text-sm text-slate-300 hover:bg-surface-2 disabled:opacity-50">
          {checking ? "Kontrol ediliyor…" : "Şimdi kontrol et"}
        </button>
      </div>

      <Explain>
        {KAP_EXPLAIN} Uygulama hafta içi 08:00–22:00 arasında 10 dakikada bir yeni bildirimleri kontrol eder. Gerçek portföyünüzdeki hisseler için bildirim
        gönderilir (Ayarlar’dan değiştirilebilir).
      </Explain>

      {message && <p className="rounded-xl bg-surface-2 px-3 py-2 text-sm text-slate-300">{message}</p>}
      {error && <p className="rounded-xl bg-amber-500/10 px-3 py-2 text-sm text-amber-300">{error}</p>}

      {data && (
        <>
          <div className="flex flex-wrap gap-1.5">
            <button
              onClick={() => setTicker("")}
              className={`rounded-lg border px-2.5 py-1 text-xs ${!ticker ? "border-accent/50 text-accent" : "border-line text-slate-400 hover:text-white"}`}
            >
              Tümü
            </button>
            {data.tickers.map((t) => (
              <button
                key={t.symbol}
                onClick={() => setTicker(t.symbol)}
                title={[t.real && "gerçek portföy", t.virtual && "sanal portföy", t.watch && "izleme listesi"].filter(Boolean).join(", ")}
                className={`rounded-lg border px-2.5 py-1 text-xs ${ticker === t.symbol ? "border-accent/50 text-accent" : "border-line text-slate-400 hover:text-white"}`}
              >
                {t.symbol}
                {t.real ? " ●" : ""}
              </button>
            ))}
          </div>
          {data.tickers.length === 0 && (
            <EmptyState
              title="Takip edilen BIST hissesi yok"
              action={{ label: "İzleme listesine hisse ekle", href: "/piyasa" }}
              guide={{ href: "/kilavuz#turkiye", label: "Kılavuz: KAP nedir?" }}
            >
              KAP, şirketlerin resmî duyurularını yayımladığı yerdir. Portföyüne ya da izleme listene bir BIST hissesi eklediğinde o şirketin duyuruları burada
              görünür.
            </EmptyState>
          )}
          {data.tickers.length > 0 && data.items.length === 0 && (
            <EmptyState
              compact
              title={ticker ? `${ticker} için kayıtlı bildirim yok` : "Henüz kayıtlı bildirim yok"}
              action={{ label: "Şimdi kontrol et", onClick: () => void checkNow() }}
              guide={{ href: "/kilavuz#turkiye", label: "Kılavuz: KAP bildirimleri" }}
            >
              Takip ettiğin hisseler için KAP hafta içi 08:00–22:00 arasında düzenli kontrol edilir; yeni bir duyuru olunca burada listelenir.
            </EmptyState>
          )}
          {data.items.length > 0 && (
            <Card>
              <ul className="divide-y divide-line/60">
                {data.items.map((d) => (
                  <KapItem key={d.id} d={d} showCodes={!ticker} />
                ))}
              </ul>
            </Card>
          )}
          <p className="text-xs text-slate-500">
            {data.status.lastOk ? `Son başarılı kontrol: ${formatSourceTime(data.status.lastOk)}` : "Bu oturumda henüz kontrol edilmedi."}
            {data.status.lastError && " · Son denemede KAP’a ulaşılamadı; kayıtlı bildirimler gösteriliyor."}
            {" "}● = gerçek portföyde.
          </p>
        </>
      )}
    </div>
  );
}
