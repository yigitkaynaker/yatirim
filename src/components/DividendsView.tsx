"use client";

import Link from "next/link";
import { useState } from "react";
import type { DividendOverview, DividendRecord } from "@/lib/dividends";
import { formatDate, formatMoney, formatNumber, formatQuantity, formatTime } from "@/lib/format";
import { goToLogin, usePolling } from "@/lib/usePolling";
import { DIVIDEND_EXPLAIN, DividendSuggestionRow } from "./AssetPanels";
import { detailHref } from "./MarketView";
import { Card, Explain } from "./ui";
import { EmptyState, InfoTip, Term } from "./help";

const modeLabel = (m: string) => (m === "real" ? "Gerçek" : "Sanal");

export function DividendsView() {
  const { data, error, loading, lastSuccess, reload } = usePolling<DividendOverview>("/api/dividends", 10 * 60_000);
  const [openYear, setOpenYear] = useState<string | null>(null);

  async function editAmount(r: DividendRecord) {
    const v = prompt(`${r.symbol} ${formatDate(r.exDate)}: hesabınıza geçen net tutar (${r.currency})`, String(r.amount).replace(".", ","));
    if (v == null) return;
    const res = await fetch(`/api/dividends/${r.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ amount: v }) });
    if (res.status === 401) return goToLogin();
    if (!res.ok) alert(((await res.json().catch(() => ({}))) as { error?: string }).error ?? "Kaydedilemedi.");
    void reload();
  }

  async function undo(r: DividendRecord) {
    if (!confirm(`${r.symbol} ${formatDate(r.exDate)} temettü kaydı silinsin mi? Gerçekleşen K/Z'den düşülür.`)) return;
    const res = await fetch(`/api/dividends/${r.id}`, { method: "DELETE" });
    if (res.status === 401) return goToLogin();
    void reload();
  }

  return (
    <div className="space-y-4 md:space-y-6">
      <div className="flex items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">
            <Term term="temettu">Temettü</Term>
          </h1>
          <p className="text-sm text-slate-500">Hisselerinizden aldığınız kâr payları</p>
        </div>
        <span className="shrink-0 text-xs text-slate-500">{loading ? "Güncelleniyor…" : lastSuccess ? formatTime(lastSuccess) : ""}</span>
      </div>

      <Explain>{DIVIDEND_EXPLAIN}</Explain>

      {error && <p className="rounded-xl bg-amber-500/10 px-3 py-2 text-sm text-amber-300">{error}</p>}
      {!data && !error && <Card className="p-6 text-center text-sm text-slate-500">Yükleniyor…</Card>}

      {data && (
        <>
          <Card className="p-4 md:p-6">
            <div className="text-sm text-slate-400">Alınan temettü (gerçek portföy, toplam)</div>
            <div className="num mt-1 text-3xl font-semibold tracking-tight text-emerald-300">{formatMoney(data.receivedTotalTry)}</div>
            <p className="mt-1 text-xs text-slate-500">Tutarlar stopaj <InfoTip term="stopaj" /> sonrası nettir. Onayladığınız temettüler gerçekleşen K/Z’ye eklenir. Döviz cinsinden temettüler hak kullanım günündeki kurla TL’ye çevrilir.</p>
          </Card>

          {data.suggestions.length > 0 && (
            <section className="space-y-2">
              <h2 className="text-sm font-medium text-slate-300">Onay bekleyen temettü gelirleri</h2>
              <p className="text-xs text-slate-500">
                İşlem geçmişinize göre bu hisseler, hak kullanım gününden önceki gün elinizdeydi. Adet, o günkü elinizdeki miktardır. Gerçekten aldıysanız
                “Onayla”ya basın; almadıysanız gizleyin.
              </p>
              <Card>
                <ul className="divide-y divide-line/60">
                  {data.suggestions.map((s) => (
                    <DividendSuggestionRow key={`${s.mode}-${s.accountId ?? 0}-${s.assetType}-${s.symbol}-${s.exDate}`} s={s} onDone={() => void reload()} />
                  ))}
                </ul>
              </Card>
            </section>
          )}

          <section className="space-y-2">
            <h2 className="text-sm font-medium text-slate-300">Yıllara göre alınanlar</h2>
            {data.received.length === 0 ? (
              <EmptyState
                compact
                title="Henüz kaydedilmiş temettü yok"
                action={{ label: "Piyasada temettü veren hisse ara", href: "/piyasa" }}
                guide={{ href: "/kilavuz#turkiye", label: "Kılavuz: Temettü ve stopaj" }}
              >
                Temettü, şirketin kârından hissedarlarına dağıttığı paydır. Elindeki bir hisse temettü dağıtınca burada bir öneri belirir; onaylarsan stopaj
                sonrası net tutar gerçekleşen K/Z’ye eklenir.
              </EmptyState>
            ) : (
              <Card className="divide-y divide-line/70">
                {data.received.map((y) => {
                  const open = openYear === y.year || (openYear == null && y === data.received[0]);
                  return (
                    <div key={y.year}>
                      <button onClick={() => setOpenYear(open ? "" : y.year)} className="flex w-full items-center justify-between px-4 py-3 text-left">
                        <span className="font-medium">{y.year}</span>
                        <span className="num font-semibold text-emerald-300">
                          {formatMoney(y.totalTry)} <span className="text-slate-500">{open ? "▴" : "▾"}</span>
                        </span>
                      </button>
                      {open && (
                        <ul className="num space-y-1 px-4 pb-3 text-sm">
                          {y.items.map((r) => (
                            <li key={r.id} className="flex flex-wrap items-center justify-between gap-x-3">
                              <span>
                                <span className="font-medium">{r.symbol}</span>{" "}
                                <span className="text-xs text-slate-500">
                                  {formatDate(r.exDate)} · {formatQuantity(r.quantity)} adet · {modeLabel(r.mode)}
                                </span>
                              </span>
                              <span className="flex items-center gap-2">
                                <span className="text-emerald-300" title={r.grossAmount != null ? `Brüt ${formatMoney(r.grossAmount, r.currency)}, stopaj %${r.withholdingPct ?? 0}` : "Net tutar"}>
                                  {formatMoney(r.amount, r.currency)}
                                </span>
                                {r.grossAmount != null && <span className="text-xs text-slate-500">brüt {formatMoney(r.grossAmount, r.currency)}</span>}
                                {r.currency !== "TRY" && <span className="text-xs text-slate-500">≈ {formatMoney(r.amountTry)}</span>}
                                <button onClick={() => editAmount(r)} className="text-xs text-slate-500 hover:text-white" title="Hesabınıza geçen tutarı düzenleyin">
                                  Düzenle
                                </button>
                                <button onClick={() => undo(r)} className="text-xs text-slate-500 hover:text-rose-300" title="Kaydı geri al">
                                  ✕
                                </button>
                              </span>
                            </li>
                          ))}
                          {y.items.some((r) => r.mode === "virtual") && <li className="text-xs text-slate-500">Yıl toplamı yalnızca gerçek portföyü içerir.</li>}
                        </ul>
                      )}
                    </div>
                  );
                })}
              </Card>
            )}
          </section>

          <section className="space-y-2">
            <h2 className="text-sm font-medium text-slate-300">Yaklaşan / duyurulan</h2>
            <p className="text-xs text-slate-500">Elinizdeki hisseler için kaynakta ileri tarihli temettüler ve son 4 ayın KAP “kâr payı dağıtım” bildirimleri.</p>
            {data.upcoming.length === 0 ? (
              <Card className="p-6 text-center text-sm text-slate-500">Şu an bilinen yaklaşan temettü yok.</Card>
            ) : (
              <Card>
                <ul className="divide-y divide-line/60">
                  {data.upcoming.map((u, i) => (
                    <li key={i} className="px-4 py-3 text-sm">
                      <div className="flex flex-wrap items-baseline justify-between gap-x-3">
                        <span className="font-medium">
                          {u.symbol} <span className="text-slate-400">· {u.title}</span>
                        </span>
                        {u.date && <span className="num text-xs text-slate-500">{formatDate(u.date)}</span>}
                      </div>
                      {u.detail && u.detail !== u.title && <p className="text-xs text-slate-400">{u.detail}</p>}
                      {u.url && (
                        <a href={u.url} target="_blank" rel="noopener noreferrer" className="text-xs text-accent hover:underline">
                          KAP bildirimini aç ↗
                        </a>
                      )}
                    </li>
                  ))}
                </ul>
              </Card>
            )}
          </section>

          <section className="space-y-2">
            <h2 className="text-sm font-medium text-slate-300">Elinizdeki hisselerin temettü geçmişi</h2>
            {data.holdings.length === 0 ? (
              <Card className="p-6 text-center text-sm text-slate-500">Portföyünüzde BIST ya da yabancı hisse yok.</Card>
            ) : (
              <div className="grid gap-3 md:grid-cols-2">
                {data.holdings.map((h) => {
                  const ev = [...h.history.events].reverse().slice(0, 6);
                  return (
                    <Card key={h.instrument} className="p-4">
                      <div className="flex items-center justify-between gap-2">
                        <Link href={detailHref(h.instrument)} className="font-medium hover:underline">
                          {h.name}
                        </Link>
                        <span className="text-xs text-slate-500">{h.modes.map(modeLabel).join(" + ")}</span>
                      </div>
                      {h.history.stale && h.history.fetchedAt && <p className="text-xs text-amber-300">Kaynak yanıt vermiyor; son kayıt gösteriliyor.</p>}
                      {ev.length === 0 ? (
                        <p className="mt-1 text-sm text-slate-500">{h.history.error ?? "Son 10 yılda temettü ödemesi yok."}</p>
                      ) : (
                        <ul className="num mt-1 space-y-0.5 text-sm">
                          {ev.map((e) => (
                            <li key={e.date} className="flex justify-between">
                              <span className="text-slate-500">{formatDate(e.date)}</span>
                              <span>
                                {formatNumber(e.amount, 4)} {h.history.currency}
                              </span>
                            </li>
                          ))}
                        </ul>
                      )}
                    </Card>
                  );
                })}
              </div>
            )}
            <p className="text-[11px] text-slate-500">Kaynak: Yahoo Finance (pay başına brüt tutar) ve KAP. Yatırım tavsiyesi değildir.</p>
          </section>
        </>
      )}
    </div>
  );
}
