"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ASSET_TYPE_INFO, displaySymbol, parseInstrumentId } from "@/lib/assets";
import { formatMoney, formatPercent, formatTime, pnlClass } from "@/lib/format";
import type { SearchResult, WatchItem } from "@/lib/market";
import type { Quote } from "@/lib/prices";
import { goToLogin, usePolling } from "@/lib/usePolling";
import { Card, inputCls, Modal, PriceMeta, PrimaryButton, StaleBadge } from "./ui";

/** Genel bakış kartları: kimlik + Türkçe ad */
export const OVERVIEW: { id: string; label: string }[] = [
  { id: "bist:XU100", label: "BIST 100" },
  { id: "fx:USD", label: "USD/TRY" },
  { id: "fx:EUR", label: "EUR/TRY" },
  { id: "gold:GRAM", label: "Gram Altın" },
  { id: "gold:CEYREK", label: "Çeyrek Altın" },
  { id: "foreign:GC=F", label: "Ons Altın" },
  { id: "crypto:BTC", label: "Bitcoin" },
  { id: "crypto:ETH", label: "Ethereum" },
  { id: "foreign:^GSPC", label: "S&P 500" },
  { id: "foreign:^IXIC", label: "Nasdaq" },
];

/** Endeksler için para birimi yerine puan gösterilir. */
export function isIndex(id: string) {
  return id === "bist:XU100" || id.startsWith("foreign:^");
}

export function detailHref(id: string, name?: string | null) {
  const p = new URLSearchParams({ id });
  if (name) p.set("ad", name);
  return `/piyasa/detay?${p.toString()}`;
}

export function formatQuotePrice(id: string, q: Quote | undefined | null) {
  if (!q || q.price == null) return "—";
  if (isIndex(id)) return q.price.toLocaleString("tr-TR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return formatMoney(q.price, q.currency || "TRY", q.price < 100 ? 4 : 2);
}

export function MarketView() {
  const watch = usePolling<{ items: WatchItem[] }>("/api/watchlist", 60_000);
  const items = watch.data?.items ?? null;
  const ids = [...OVERVIEW.map((o) => o.id), ...(items ?? []).map((w) => w.instrument)];
  const uniq = [...new Set(ids)];
  const prices = usePolling<{ quotes: Quote[] }>(`/api/prices?ids=${encodeURIComponent(uniq.join(","))}`);
  const byId = new Map((prices.data?.quotes ?? []).map((q) => [q.id, q]));
  const [adding, setAdding] = useState(false);

  async function remove(w: WatchItem) {
    const res = await fetch(`/api/watchlist/${w.id}`, { method: "DELETE" });
    if (res.status === 401) return goToLogin();
    void watch.reload();
  }

  return (
    <div className="space-y-4 md:space-y-6">
      <div className="flex items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Piyasa</h1>
          <p className="text-sm text-slate-500">
            Günlük değişim yüzde olarak gösterilir. Ayrıntı ve grafik için bir varlığa dokunun.
          </p>
        </div>
        <span className="shrink-0 text-xs text-slate-500">
          {prices.loading ? "Güncelleniyor…" : prices.lastSuccess ? formatTime(prices.lastSuccess) : ""}
        </span>
      </div>

      {prices.error && <p className="rounded-xl bg-amber-500/10 px-3 py-2 text-sm text-amber-300">{prices.error}</p>}

      <Link
        href="/sinyaller"
        className="flex items-center justify-between gap-3 rounded-2xl border border-line bg-surface px-4 py-3 text-sm transition hover:border-slate-500/60 active:bg-surface-2"
      >
        <span>
          <span className="font-medium text-slate-100">Teknik sinyaller</span>
          <span className="block text-xs text-slate-500">Portföy ve izleme listenizdeki varlıklar için Al / Nötr / Sat özeti</span>
        </span>
        <span className="text-slate-400">›</span>
      </Link>

      <section className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5 md:gap-3">
        {OVERVIEW.map((o) => {
          const q = byId.get(o.id);
          return (
            <Link
              key={o.id}
              href={detailHref(o.id, o.label)}
              className="rounded-2xl border border-line bg-surface px-3 py-3 transition hover:border-slate-500/60 active:bg-surface-2"
            >
              <div className="flex items-center justify-between gap-2 text-xs text-slate-400">
                <span className="truncate">{o.label}</span>
                {q?.stale && q.price != null && <StaleBadge fetchedAt={q.fetchedAt} />}
              </div>
              <div className="num mt-1 truncate font-semibold">{formatQuotePrice(o.id, q)}</div>
              <div className={`num text-sm font-medium ${pnlClass(q?.changePct)}`}>{q ? formatPercent(q.changePct) : "…"}</div>
              {q?.delayed && <div className="text-[10px] text-slate-500">15 dk gecikmeli</div>}
            </Link>
          );
        })}
      </section>

      <section className="space-y-2">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-medium text-slate-300">İzleme listesi</h2>
          <PrimaryButton onClick={() => setAdding(true)} className="py-2">
            + Ekle
          </PrimaryButton>
        </div>
        {!items ? (
          <Card className="p-6 text-center text-sm text-slate-500">Yükleniyor…</Card>
        ) : items.length === 0 ? (
          <Card className="p-8 text-center">
            <p className="text-slate-300">İzleme listeniz boş.</p>
            <p className="mt-1 text-sm text-slate-500">Takip etmek istediğiniz hisse, kripto ya da dövizi arayıp ekleyin.</p>
          </Card>
        ) : (
          <Card className="divide-y divide-line/70">
            {items.map((w) => {
              const q = byId.get(w.instrument);
              const ref = parseInstrumentId(w.instrument);
              return (
                <div key={w.id} className="flex items-center gap-3 px-4 py-3">
                  <Link href={detailHref(w.instrument, w.name)} className="flex min-w-0 flex-1 items-center gap-3">
                    <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: ASSET_TYPE_INFO[w.assetType].color }} />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5 font-medium">
                        {ref ? displaySymbol(ref.type, ref.symbol) : w.symbol}
                        {q?.stale && q.price != null && <StaleBadge fetchedAt={q.fetchedAt} />}
                      </div>
                      <div className="truncate text-xs text-slate-500">{w.name ?? ASSET_TYPE_INFO[w.assetType].label}</div>
                      {q && q.price != null && <PriceMeta q={{ ...q, stale: false }} />}
                    </div>
                    <div className="num text-right">
                      <div className="font-medium">{formatQuotePrice(w.instrument, q)}</div>
                      <div className={`text-sm ${pnlClass(q?.changePct)}`}>{q ? formatPercent(q.changePct) : "…"}</div>
                    </div>
                  </Link>
                  <button
                    onClick={() => remove(w)}
                    aria-label={`${w.symbol} izleme listesinden çıkar`}
                    title="Listeden çıkar"
                    className="-mr-2 rounded-lg p-2 text-slate-500 hover:bg-rose-500/10 hover:text-rose-300"
                  >
                    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round">
                      <path d="M6 6l12 12M18 6L6 18" />
                    </svg>
                  </button>
                </div>
              );
            })}
          </Card>
        )}
      </section>

      {adding && (
        <Modal title="İzleme listesine ekle" onClose={() => setAdding(false)}>
          <SymbolSearch
            existing={new Set((items ?? []).map((w) => w.instrument))}
            onPick={async (r) => {
              const res = await fetch("/api/watchlist", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ assetType: r.assetType, symbol: r.symbol, name: r.name }),
              });
              if (res.status === 401) return goToLogin();
              if (!res.ok) {
                alert(((await res.json().catch(() => ({}))) as { error?: string }).error ?? "Eklenemedi.");
                return;
              }
              setAdding(false);
              void watch.reload();
            }}
          />
        </Modal>
      )}
    </div>
  );
}

/** Yahoo Finance + Binance araması. Yazmayı bırakınca arar. */
export function SymbolSearch({ onPick, existing }: { onPick: (r: SearchResult) => void; existing?: Set<string> }) {
  const [q, setQ] = useState("");
  const [state, setState] = useState<{ q: string; results: SearchResult[] | null; error?: string }>({ q: "", results: null });

  useEffect(() => {
    const query = q.trim();
    if (!query) return;
    const ctrl = new AbortController();
    const t = setTimeout(() => {
      fetch(`/api/search?q=${encodeURIComponent(query)}`, { signal: ctrl.signal })
        .then((r) => (r.ok ? r.json() : Promise.reject(new Error())))
        .then((d: { results: SearchResult[] }) => setState({ q: query, results: d.results }))
        .catch(() => !ctrl.signal.aborted && setState({ q: query, results: [], error: "Arama yapılamadı." }));
    }, 350);
    return () => {
      clearTimeout(t);
      ctrl.abort();
    };
  }, [q]);

  const query = q.trim();
  const current = state.q === query ? state : null;

  return (
    <div className="space-y-3">
      <input
        className={inputCls}
        autoFocus
        placeholder="Örn. THYAO, Apple, BTC, çeyrek altın, dolar, AFT"
        value={q}
        autoCorrect="off"
        spellCheck={false}
        onChange={(e) => setQ(e.target.value)}
      />
      <p className="text-xs text-slate-500">
        BIST, yabancı hisse, endeks, döviz, altın türleri ve Binance kripto paritelerinde arar. Yatırım fonu için 3 harfli TEFAS kodunu yazın (örn. AFT);
        fon, birçok kişinin parasının uzmanlarca hisse, tahvil, altın gibi varlıklara yatırıldığı ortak bir sepettir.
      </p>
      {query && !current && <p className="text-sm text-slate-500">Aranıyor…</p>}
      {current?.error && <p className="text-sm text-rose-400">{current.error}</p>}
      {current && !current.error && current.results?.length === 0 && <p className="text-sm text-slate-500">Sonuç bulunamadı.</p>}
      {current?.results && current.results.length > 0 && (
        <ul className="-mx-2 divide-y divide-line/60">
          {current.results.map((r) => {
            const added = existing?.has(r.instrument);
            return (
              <li key={r.instrument}>
                <button
                  type="button"
                  disabled={added}
                  onClick={() => onPick(r)}
                  className="flex w-full items-center gap-3 rounded-lg px-2 py-2.5 text-left hover:bg-surface-2 disabled:opacity-50"
                >
                  <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: ASSET_TYPE_INFO[r.assetType].color }} />
                  <div className="min-w-0 flex-1">
                    <div className="font-medium">{displaySymbol(r.assetType, r.symbol)}</div>
                    <div className="truncate text-xs text-slate-500">{r.name}</div>
                  </div>
                  <div className="shrink-0 text-right text-xs text-slate-500">
                    <div>{ASSET_TYPE_INFO[r.assetType].label}</div>
                    <div>{added ? "Listede" : r.exchange}</div>
                  </div>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
