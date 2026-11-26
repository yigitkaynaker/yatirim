"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ASSET_TYPE_INFO, CATALOG_CATEGORIES, CATALOG_CATEGORY_LABEL, displaySymbol, type CatalogCategory } from "@/lib/assets";
import type { CatalogItem, CatalogPage } from "@/lib/catalog";
import { formatPercent, pnlClass } from "@/lib/format";
import type { Quote } from "@/lib/prices";
import { fetchJson, goToLogin, UnauthorizedError, usePolling } from "@/lib/usePolling";
import { detailHref, formatQuotePrice } from "./MarketView";
import { Card, inputCls, StaleBadge } from "./ui";

// Piyasa sayfasındaki ayrı listeler: her sekmede bir türün listesi (sembol kataloğundan, sayfalı),
// arama kutusu ve YALNIZCA görünen satırların canlı fiyatı (tek toplu /api/prices isteği; kaynak
// hız sınırlarına uygun). Satıra dokunmak varlık sayfasını açar (grafik, alarm, emir, işlem);
// ☆ düğmesi izleme listesine ekler / çıkarır.

const PAGE_SIZE = 30;

const VENUES: { value: string; label: string }[] = [
  { value: "", label: "Tümü" },
  { value: "binance-usdt", label: "Binance USDT" },
  { value: "binance-try", label: "Binance TRY" },
  { value: "btcturk", label: "BtcTurk" },
];

const HINTS: Partial<Record<CatalogCategory, string>> = {
  kripto: "Binance (USDT ve TL pariteleri) ve BtcTurk (TL pariteleri). Aynı coin farklı borsada ayrı satırdır; TL paritelerinin fiyatı TL'dir.",
  bist: "Borsa İstanbul'un büyük hisseleri (derlenmiş liste). Listede olmayan hisseyi yukarıdaki + Ekle aramasıyla bulabilirsiniz. Fiyatlar ~15 dk gecikmelidir.",
  hisse: "Popüler ABD hisseleri. Aramada bulduğunuz diğer hisseler de buraya eklenir.",
  etf: "Borsa yatırım fonları (ETF): tek alımla bir endeksi ya da sepeti takip eder.",
  endeks: "Borsa endeksleri: fiyat yerine puan gösterilir; doğrudan alınamaz, piyasanın genel yönünü gösterir.",
  emtia: "Vadeli işlem fiyatları (USD): altın, gümüş, petrol, doğalgaz, bakır, tarım ürünleri.",
  doviz: "Dövizlerin TL karşılığı.",
  altin: "Gram altın ve kuyumcu altınları (TL).",
  fon: "Daha önce aradığınız ya da işlem yaptığınız TEFAS fonları. Yeni bir fon için + Ekle'de 3 harfli fon kodunu yazın.",
};

export function MarketLists({ watched, onToggleWatch }: { watched: Map<string, number>; onToggleWatch: (item: CatalogItem) => void }) {
  const [category, setCategory] = useState<CatalogCategory>("kripto");
  const [venue, setVenue] = useState("");
  const [q, setQ] = useState("");
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(0);
  const [state, setState] = useState<{ key: string; data: CatalogPage | null; error?: string } | null>(null);

  // Yazmayı bırakınca ara
  useEffect(() => {
    const t = setTimeout(() => {
      setQuery(q.trim());
      setPage(0);
    }, 300);
    return () => clearTimeout(t);
  }, [q]);

  const key = `${category}|${category === "kripto" ? venue : ""}|${query}|${page}`;
  useEffect(() => {
    let alive = true;
    const p = new URLSearchParams({ kategori: category, sayfa: String(page), adet: String(PAGE_SIZE) });
    if (query) p.set("q", query);
    if (category === "kripto" && venue) p.set("borsa", venue);
    fetchJson<CatalogPage>(`/api/catalog?${p.toString()}`)
      .then((data) => alive && setState({ key, data }))
      .catch((err: unknown) => {
        if (err instanceof UnauthorizedError) return goToLogin();
        if (alive) setState({ key, data: null, error: "Liste alınamadı." });
      });
    return () => {
      alive = false;
    };
  }, [key, category, venue, query, page]);

  const current = state?.key === key ? state : null;
  const items = current?.data?.items ?? [];
  const total = current?.data?.total ?? 0;
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  function pick(c: CatalogCategory) {
    setCategory(c);
    setPage(0);
    setQ("");
    setQuery("");
  }

  return (
    <section className="space-y-2">
      <h2 className="text-sm font-medium text-slate-300">Piyasa listeleri</h2>
      <div role="tablist" aria-label="Piyasa listeleri" className="-mx-1 flex gap-1 overflow-x-auto px-1 pb-1">
        {CATALOG_CATEGORIES.map((c) => (
          <button
            key={c}
            role="tab"
            aria-selected={c === category}
            onClick={() => pick(c)}
            className={`shrink-0 rounded-lg border px-3 py-1.5 text-sm transition ${
              c === category ? "border-emerald-500/40 bg-emerald-500/15 text-emerald-200" : "border-line bg-surface text-slate-400 hover:text-white"
            }`}
          >
            {CATALOG_CATEGORY_LABEL[c]}
          </button>
        ))}
      </div>

      <Card className="overflow-hidden">
        <div className="space-y-2 border-b border-line/70 p-3">
          <input
            className={inputCls}
            placeholder={`${CATALOG_CATEGORY_LABEL[category]} içinde ara (sembol ya da ad)`}
            value={q}
            autoCorrect="off"
            spellCheck={false}
            onChange={(e) => setQ(e.target.value)}
            aria-label="Listede ara"
          />
          {category === "kripto" && (
            <div className="flex flex-wrap gap-1">
              {VENUES.map((v) => (
                <button
                  key={v.value}
                  onClick={() => {
                    setVenue(v.value);
                    setPage(0);
                  }}
                  className={`rounded-md px-2 py-1 text-xs ${venue === v.value ? "bg-surface-2 text-white" : "text-slate-400 hover:text-white"}`}
                >
                  {v.label}
                </button>
              ))}
            </div>
          )}
          {HINTS[category] && <p className="text-xs text-slate-500">{HINTS[category]}</p>}
        </div>

        {!current ? (
          <p className="p-6 text-center text-sm text-slate-500">Yükleniyor…</p>
        ) : current.error ? (
          <p className="p-6 text-center text-sm text-rose-400">{current.error}</p>
        ) : items.length === 0 ? (
          <p className="p-6 text-center text-sm text-slate-500">
            {query ? "Bu listede eşleşen sembol yok. Yukarıdaki + Ekle aramasını deneyin." : category === "fon" ? "Henüz kayıtlı fon yok." : "Liste henüz hazırlanıyor; birazdan yeniden deneyin."}
          </p>
        ) : (
          <ListRows items={items} watched={watched} onToggleWatch={onToggleWatch} />
        )}

        {total > PAGE_SIZE && (
          <div className="flex items-center justify-between gap-2 border-t border-line/70 px-3 py-2 text-sm">
            <button disabled={page === 0} onClick={() => setPage((p) => Math.max(0, p - 1))} className="rounded-lg px-3 py-1.5 text-slate-300 hover:bg-surface-2 disabled:opacity-40">
              ‹ Önceki
            </button>
            <span className="text-xs text-slate-500">
              {page + 1} / {pages} · {total} sembol
            </span>
            <button
              disabled={page + 1 >= pages}
              onClick={() => setPage((p) => p + 1)}
              className="rounded-lg px-3 py-1.5 text-slate-300 hover:bg-surface-2 disabled:opacity-40"
            >
              Sonraki ›
            </button>
          </div>
        )}
      </Card>
    </section>
  );
}

/** Görünen satırlar + yalnızca bu satırların fiyatları (60 sn'de bir; sunucu önbelleği ~30 sn) */
function ListRows({ items, watched, onToggleWatch }: { items: CatalogItem[]; watched: Map<string, number>; onToggleWatch: (item: CatalogItem) => void }) {
  const ids = items.map((i) => i.instrument).join(",");
  const prices = usePolling<{ quotes: Quote[] }>(`/api/prices?ids=${encodeURIComponent(ids)}`, 60_000);
  const byId = new Map((prices.data?.quotes ?? []).map((q) => [q.id, q]));
  return (
    <ul className="divide-y divide-line/70">
      {items.map((it) => {
        const q = byId.get(it.instrument);
        const isWatched = watched.has(it.instrument);
        return (
          <li key={it.instrument} className="flex items-center gap-3 px-4 py-2.5">
            <Link href={detailHref(it.instrument, it.name)} className="flex min-w-0 flex-1 items-center gap-3">
              <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: ASSET_TYPE_INFO[it.assetType].color }} />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5 font-medium">
                  <span className="truncate">{displaySymbol(it.assetType, it.symbol)}</span>
                  {q?.stale && q.price != null && <StaleBadge fetchedAt={q.fetchedAt} />}
                </div>
                <div className="truncate text-xs text-slate-500">{[it.name !== it.symbol ? it.name : null, it.exchange, it.currency].filter(Boolean).join(" · ")}</div>
              </div>
              <div className="num shrink-0 text-right">
                <div className="font-medium">{q ? formatQuotePrice(it.instrument, q) : "…"}</div>
                <div className={`text-sm ${pnlClass(q?.changePct)}`}>{q ? formatPercent(q.changePct) : ""}</div>
              </div>
            </Link>
            <button
              onClick={() => onToggleWatch(it)}
              aria-label={isWatched ? `${it.symbol} izleme listesinden çıkar` : `${it.symbol} izleme listesine ekle`}
              title={isWatched ? "İzleme listesinden çıkar" : "İzleme listesine ekle"}
              className={`-mr-2 rounded-lg p-2 ${isWatched ? "text-amber-300 hover:bg-amber-500/10" : "text-slate-500 hover:bg-surface-2 hover:text-white"}`}
            >
              <svg viewBox="0 0 24 24" className="h-4 w-4" fill={isWatched ? "currentColor" : "none"} stroke="currentColor" strokeWidth={2} strokeLinejoin="round">
                <path d="M12 3l2.8 5.7 6.2.9-4.5 4.4 1.1 6.2L12 17.3 6.4 20.2l1.1-6.2L3 9.6l6.2-.9z" />
              </svg>
            </button>
          </li>
        );
      })}
    </ul>
  );
}
