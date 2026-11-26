"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ASSET_TYPE_INFO, CATALOG_CATEGORIES, CATALOG_CATEGORY_LABEL, displaySymbol, parseCryptoSymbol, type CatalogCategory } from "@/lib/assets";
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
  { value: "binance-futures", label: "Binance Vadeli" },
  { value: "binance-alpha", label: "Binance Alpha" },
];

/** Süzgece özel kısa uyarı (vadeli ve Alpha satırları) */
const VENUE_HINTS: Record<string, string> = {
  "binance-futures":
    "Yalnızca Binance vadeli işlemlerde (sürekli kontrat) olan, spotta bulunmayan coinler. Fiyat vadeli kontrat fiyatıdır (1 coin için; 1000RATS gibi kontratlarda 1000'e bölünür) ve spot fiyattan biraz farklı olabilir. Yatırım tavsiyesi değildir.",
  "binance-alpha":
    "Binance Alpha: henüz Binance'te listelenmemiş, erken aşama zincir üstü tokenlar. Fiyatı çok oynak, likiditesi düşük olabilir; yüksek risklidir. Yatırım tavsiyesi değildir.",
};

const FUND_KINDS: { value: string; label: string }[] = [
  { value: "", label: "Tümü" },
  { value: "yat", label: "Yatırım fonları" },
  { value: "emk", label: "Emeklilik (BES)" },
  { value: "byf", label: "Borsa yatırım fonları" },
];

const HINTS: Partial<Record<CatalogCategory, string>> = {
  kripto:
    "Binance (USDT ve TL pariteleri) ve BtcTurk (TL pariteleri). Aynı coin farklı borsada ayrı satırdır; TL paritelerinin fiyatı TL'dir. Spotta olmayan coinler Binance Vadeli ve Binance Alpha süzgeçlerindedir (her coin bir kez).",
  bist: "Borsa İstanbul'daki tüm hisseler (büyükler önce). Fiyatlar ~15 dk gecikmelidir.",
  hisse: "Nasdaq ve NYSE'deki tüm ABD hisseleri (popülerler önce). Fiyatlar USD'dir.",
  etf: "ABD borsa yatırım fonları (ETF): tek alımla bir endeksi ya da sepeti takip eder. Popülerler önce.",
  endeks: "Borsa endeksleri: fiyat yerine puan gösterilir; doğrudan alınamaz, piyasanın genel yönünü gösterir.",
  emtia: "Vadeli işlem fiyatları (USD): altın, gümüş, petrol, doğalgaz, bakır, tarım ürünleri.",
  doviz: "Dövizlerin TL karşılığı.",
  altin: "Gram altın ve kuyumcu altınları (TL).",
  fon: "TEFAS'taki tüm fonlar: yatırım fonları, emeklilik (BES) fonları ve borsa yatırım fonları. Fon kodu ya da adıyla (örn. kurucu şirket) arayın; fiyat günde bir açıklanır.",
};

export function MarketLists({ watched, onToggleWatch }: { watched: Map<string, number>; onToggleWatch: (item: CatalogItem) => void }) {
  const [category, setCategory] = useState<CatalogCategory>("kripto");
  const [venue, setVenue] = useState("");
  const [fundKind, setFundKind] = useState("");
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

  const key = `${category}|${category === "kripto" ? venue : category === "fon" ? fundKind : ""}|${query}|${page}`;
  useEffect(() => {
    let alive = true;
    const p = new URLSearchParams({ kategori: category, sayfa: String(page), adet: String(PAGE_SIZE) });
    if (query) p.set("q", query);
    if (category === "kripto" && venue) p.set("borsa", venue);
    if (category === "fon" && fundKind) p.set("tur", fundKind);
    fetchJson<CatalogPage>(`/api/catalog?${p.toString()}`)
      .then((data) => alive && setState({ key, data }))
      .catch((err: unknown) => {
        if (err instanceof UnauthorizedError) return goToLogin();
        if (alive) setState({ key, data: null, error: "Liste alınamadı." });
      });
    return () => {
      alive = false;
    };
  }, [key, category, venue, fundKind, query, page]);

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
            <FilterButtons
              options={VENUES}
              value={venue}
              onChange={(v) => {
                setVenue(v);
                setPage(0);
              }}
            />
          )}
          {category === "fon" && (
            <FilterButtons
              options={FUND_KINDS}
              value={fundKind}
              onChange={(v) => {
                setFundKind(v);
                setPage(0);
              }}
            />
          )}
          {HINTS[category] && <p className="text-xs text-slate-500">{HINTS[category]}</p>}
          {category === "kripto" && VENUE_HINTS[venue] && <p className="text-xs text-amber-300/80">{VENUE_HINTS[venue]}</p>}
        </div>

        {!current ? (
          <p className="p-6 text-center text-sm text-slate-500">Yükleniyor…</p>
        ) : current.error ? (
          <p className="p-6 text-center text-sm text-rose-400">{current.error}</p>
        ) : items.length === 0 ? (
          <p className="p-6 text-center text-sm text-slate-500">
            {query ? "Bu listede eşleşen sembol yok. Yukarıdaki + Ekle aramasını deneyin." : "Liste henüz hazırlanıyor; birazdan yeniden deneyin."}
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

/** Liste süzgeci düğmeleri (kripto borsası, fon türü) */
function FilterButtons({ options, value, onChange }: { options: { value: string; label: string }[]; value: string; onChange: (v: string) => void }) {
  return (
    <div className="flex flex-wrap gap-1">
      {options.map((o) => (
        <button
          key={o.value}
          aria-pressed={value === o.value}
          onClick={() => onChange(o.value)}
          className={`rounded-md px-2 py-1 text-xs ${value === o.value ? "bg-surface-2 text-white" : "text-slate-400 hover:text-white"}`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

/** Vadeli / Alpha satırlarında sembol + rozet (sembolün yanında "(Vadeli)" tekrar yazılmaz) */
function rowSymbol(it: CatalogItem) {
  const c = it.assetType === "crypto" ? parseCryptoSymbol(it.symbol) : null;
  return c && (c.venue === "BINANCE-F" || c.venue === "BINANCE-ALPHA") ? c.base : displaySymbol(it.assetType, it.symbol);
}

function VenueBadge({ item }: { item: CatalogItem }) {
  const c = item.assetType === "crypto" ? parseCryptoSymbol(item.symbol) : null;
  if (c?.venue === "BINANCE-F")
    return <span className="shrink-0 rounded bg-sky-500/15 px-1.5 py-0.5 text-[10px] font-medium text-sky-300" title="Binance vadeli kontrat fiyatı">Vadeli</span>;
  if (c?.venue === "BINANCE-ALPHA")
    return <span className="shrink-0 rounded bg-fuchsia-500/15 px-1.5 py-0.5 text-[10px] font-medium text-fuchsia-300" title="Binance Alpha: erken aşama, yüksek riskli token">Alpha</span>;
  return null;
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
                  <span className="truncate">{rowSymbol(it)}</span>
                  <VenueBadge item={it} />
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
