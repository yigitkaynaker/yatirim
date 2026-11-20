"use client";

import Link from "next/link";
import { useState } from "react";
import { type AssetType } from "@/lib/assets";
import type { DividendHistory, DividendRecord, DividendSuggestion } from "@/lib/dividends";
import type { KapDisclosure } from "@/lib/kap";
import { formatDate, formatMoney, formatNumber, formatQuantity } from "@/lib/format";
import { goToLogin, usePolling } from "@/lib/usePolling";
import { Card, Explain } from "./ui";

export const DIVIDEND_EXPLAIN =
  "Temettü (kâr payı), şirketin kârının bir kısmını hissedarlara nakit olarak dağıtmasıdır. Hak kullanım gününden önceki gün hisse elinizdeyse alırsınız; tutarlar brüttür, BIST'te stopaj (vergi) kesilip hesabınıza daha az geçebilir.";

export const KAP_EXPLAIN =
  "KAP (Kamuyu Aydınlatma Platformu), borsadaki şirketlerin bilanço, kâr payı, yeni iş gibi önemli gelişmeleri resmi olarak duyurduğu sitedir.";

const modeLabel = (m: string) => (m === "real" ? "Gerçek" : "Sanal");

/** Öneriyi onayla / gizle (tek tık). Başarılıysa onDone. */
export function DividendSuggestionRow({ s, onDone }: { s: DividendSuggestion; onDone: () => void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function act(action: "confirm" | "dismiss") {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/dividends", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, mode: s.mode, assetType: s.assetType, symbol: s.symbol, exDate: s.exDate }),
      });
      if (res.status === 401) return goToLogin();
      const d = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) return setError(d.error ?? "Kaydedilemedi.");
      onDone();
    } catch {
      setError("Sunucuya ulaşılamadı.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <li className="flex flex-wrap items-center gap-x-3 gap-y-2 px-4 py-3">
      <div className="min-w-0 flex-1">
        <div className="font-medium">
          {s.name} <span className={`ml-1 rounded px-1.5 py-0.5 text-[11px] ${s.mode === "real" ? "bg-emerald-500/15 text-emerald-300" : "bg-violet-500/20 text-violet-200"}`}>{modeLabel(s.mode)}</span>
        </div>
        <div className="num text-xs text-slate-500">
          {formatDate(s.exDate)} · {formatQuantity(s.quantity)} adet × {formatNumber(s.perShare, 6)} {s.currency}
        </div>
        <div className="num text-xs text-slate-500" title="Stopaj, temettü ödenirken kesilen vergidir. Oranı Ayarlar'dan değiştirebilirsiniz; hesabınıza geçen tutar farklıysa onaydan sonra düzenleyin.">
          Brüt {formatMoney(s.grossAmount, s.currency)} − %{formatNumber(s.withholdingPct, 1)} stopaj = net {formatMoney(s.amount, s.currency)}
        </div>
        {s.splitAdjusted && (
          <div className="text-[11px] text-amber-300/90">
            Bu tarihten sonra hisse bölünmesi / bedelsiz yapıldı; pay başı tutar o günkü pay sayısına göre çevrildi. Hesabınıza geçen tutarla karşılaştırın.
          </div>
        )}
        <div className="text-[11px] text-slate-500">Tutar kaynaktaki verilerden tahmindir; kesin tutar için aracı kurum ekstrenize bakın.</div>
        {error && <div className="text-xs text-rose-400">{error}</div>}
      </div>
      <div className="num font-semibold text-emerald-300" title="Net (stopaj sonrası) tahmini tutar">
        {formatMoney(s.amount, s.currency)}
        <span className="block text-[10px] font-normal text-slate-500">net</span>
      </div>
      <div className="flex gap-2">
        <button disabled={busy} onClick={() => act("confirm")} className="rounded-lg bg-accent px-3 py-1.5 text-xs font-semibold text-emerald-950 disabled:opacity-50">
          Onayla
        </button>
        <button disabled={busy} onClick={() => act("dismiss")} className="rounded-lg border border-line px-3 py-1.5 text-xs text-slate-400 hover:text-white disabled:opacity-50" title="Bu temettüyü almadıysanız gizleyin">
          Gizle
        </button>
      </div>
    </li>
  );
}

/** Varlık detayında temettü geçmişi, onay bekleyenler ve kaydedilenler (BIST / yabancı hisse). */
export function DividendPanel({ instrument }: { instrument: string; assetType: AssetType }) {
  const { data, error, reload } = usePolling<{ history: DividendHistory; records: DividendRecord[]; suggestions: DividendSuggestion[] }>(
    `/api/dividends/history?id=${encodeURIComponent(instrument)}`,
    30 * 60_000,
  );
  const events = data ? [...data.history.events].reverse() : [];
  return (
    <Card className="p-4 md:p-6">
      <div className="flex items-center justify-between gap-2">
        <h2 className="font-semibold">Temettü (kâr payı)</h2>
        <Link href="/temettu" className="text-xs text-accent">
          Tüm temettüler ›
        </Link>
      </div>
      <Explain className="mt-2">{DIVIDEND_EXPLAIN}</Explain>
      {error && !data && <p className="mt-3 text-sm text-amber-300">{error}</p>}
      {!data && !error && <p className="mt-3 text-sm text-slate-500">Yükleniyor…</p>}
      {data && (
        <>
          {data.suggestions.length > 0 && (
            <div className="mt-3 rounded-xl border border-amber-500/30">
              <p className="px-4 pt-3 text-sm font-medium text-amber-200">Temettü geliri önerisi</p>
              <p className="px-4 text-xs text-slate-400">Bu hisse elinizdeyken kâr payı ödenmiş. Onaylarsanız gelir olarak kaydedilir ve gerçekleşen K/Z’ye eklenir.</p>
              <ul className="divide-y divide-line/60">
                {data.suggestions.map((s) => (
                  <DividendSuggestionRow key={`${s.mode}-${s.exDate}`} s={s} onDone={() => void reload()} />
                ))}
              </ul>
            </div>
          )}
          {data.records.length > 0 && (
            <div className="mt-3 text-sm">
              <p className="text-slate-400">Kaydedilen temettü gelirleri</p>
              <ul className="num mt-1 space-y-0.5">
                {data.records.map((r) => (
                  <li key={r.id} className="flex justify-between gap-2">
                    <span className="text-slate-400">
                      {formatDate(r.exDate)} · {modeLabel(r.mode)}
                    </span>
                    <span className="text-emerald-300">{formatMoney(r.amount, r.currency)}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
          <div className="mt-3">
            <p className="text-sm text-slate-400">
              Geçmiş ödemeler (pay başına, {data.history.currency})
              {data.history.stale && data.history.fetchedAt && <span className="text-amber-300"> · kaynak şu an yanıt vermiyor, son kayıt gösteriliyor</span>}
            </p>
            {data.history.error && events.length === 0 ? (
              <p className="mt-1 text-sm text-slate-500">{data.history.error}</p>
            ) : events.length === 0 ? (
              <p className="mt-1 text-sm text-slate-500">Son 10 yılda temettü ödemesi bulunamadı.</p>
            ) : (
              <ul className="num mt-1 grid grid-cols-2 gap-x-6 gap-y-0.5 text-sm sm:grid-cols-3">
                {events.slice(0, 15).map((e) => (
                  <li key={e.date} className="flex justify-between gap-2">
                    <span className="text-slate-500">{formatDate(e.date)}</span>
                    <span>{formatNumber(e.amount, 4)}</span>
                  </li>
                ))}
              </ul>
            )}
            <p className="mt-2 text-[11px] text-slate-500">Kaynak: Yahoo Finance. Tarih, hak kullanım (temettüsüz işlem görmeye başlama) günüdür.</p>
          </div>
        </>
      )}
    </Card>
  );
}

export function KapItem({ d, showCodes = false }: { d: KapDisclosure; showCodes?: boolean }) {
  const when = new Date(d.publishAt).toLocaleString("tr-TR", { timeZone: "Europe/Istanbul", day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
  return (
    <li className="px-4 py-3">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
        <span className="text-sm font-medium text-slate-100">
          {showCodes && <span className="mr-1.5 text-accent">{d.stockCodes.join(", ")}</span>}
          {d.subject ?? "Bildirim"}
          {d.isDividend && <span className="ml-1.5 rounded bg-amber-500/15 px-1.5 py-0.5 text-[11px] text-amber-300">kâr payı</span>}
        </span>
        <span className="num text-xs text-slate-500">{when}</span>
      </div>
      {d.summary && d.summary !== d.subject && <p className="mt-0.5 text-sm text-slate-400">{d.summary}</p>}
      <div className="mt-1 flex flex-wrap items-center gap-x-3 text-xs">
        {d.companyTitle && <span className="text-slate-500">{d.companyTitle}</span>}
        <a href={d.url} target="_blank" rel="noopener noreferrer" className="text-accent hover:underline">
          kap.org.tr’de aç ↗
        </a>
      </div>
    </li>
  );
}

/** Varlık detayında son KAP bildirimleri (BIST) */
export function KapPanel({ symbol }: { symbol: string }) {
  const { data, error } = usePolling<{ items: KapDisclosure[]; tickers: { symbol: string }[] }>(`/api/kap?hisse=${encodeURIComponent(symbol)}&limit=10`, 5 * 60_000);
  const tracked = data?.tickers.some((t) => t.symbol === symbol);
  return (
    <Card className="overflow-hidden">
      <div className="flex items-center justify-between gap-2 px-4 pt-4 md:px-6">
        <h2 className="font-semibold">KAP bildirimleri</h2>
        <Link href={`/kap?hisse=${encodeURIComponent(symbol)}`} className="text-xs text-accent">
          Tümü ›
        </Link>
      </div>
      <Explain className="mx-4 mt-2 md:mx-6">{KAP_EXPLAIN}</Explain>
      {error && !data && <p className="px-4 py-3 text-sm text-amber-300 md:px-6">{error}</p>}
      {data && data.items.length === 0 && (
        <p className="px-4 py-3 text-sm text-slate-500 md:px-6">
          {tracked
            ? "Henüz kayıtlı bildirim yok. Hafta içi 08:00–22:00 arasında 10 dakikada bir kontrol edilir."
            : "Bu hisse portföyünüzde ya da izleme listenizde olmadığı için KAP bildirimleri takip edilmiyor. İzleme listesine ekleyin (☆ İzle)."}
        </p>
      )}
      {data && data.items.length > 0 && (
        <ul className="mt-1 divide-y divide-line/60">
          {data.items.map((d) => (
            <KapItem key={d.id} d={d} />
          ))}
        </ul>
      )}
    </Card>
  );
}
