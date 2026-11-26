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

/** Kripto platform klasörleri (değer = /api/catalog borsa süzgeci) */
const FOLDERS: { value: string; label: string }[] = [
  { value: "", label: "Tümü" },
  { value: "binance", label: "Binance" },
  { value: "btcturk", label: "BtcTurk" },
  { value: "midas", label: "Midas" },
  { value: "coingecko", label: "Diğer (CoinGecko)" },
];

/** Binance klasörünün alt süzgeçleri ("" = Binance'in tümü) */
const BINANCE_SUBS: { value: string; label: string }[] = [
  { value: "", label: "Tümü" },
  { value: "binance-usdt", label: "Spot USDT" },
  { value: "binance-try", label: "Spot TL" },
  { value: "binance-futures", label: "Vadeli" },
  { value: "binance-alpha", label: "Alpha" },
];

/** Klasöre / süzgece özel kısa açıklama ya da uyarı (Midas, vadeli, Alpha ve CoinGecko satırları) */
const VENUE_HINTS: Record<string, string> = {
  midas:
    "Midas uygulamasında işlem gören coinler (her coin bir kez). Fiyat, coinin Binance, BtcTurk ya da CoinGecko'daki satırından gelir; Midas'taki fiyat biraz farklı olabilir. Aynı coin Binance klasöründe de görünebilir: iki platformda da işlem görür.",
  "binance-futures":
    "Yalnızca Binance vadeli işlemlerde (sürekli kontrat) olan, spotta bulunmayan coinler. Fiyat vadeli kontrat fiyatıdır (1 coin için; 1000RATS gibi kontratlarda 1000'e bölünür) ve spot fiyattan biraz farklı olabilir. Yatırım tavsiyesi değildir.",
  "binance-alpha":
    "Binance Alpha: henüz Binance'te listelenmemiş, erken aşama zincir üstü tokenlar. Fiyatı çok oynak, likiditesi düşük olabilir; yüksek risklidir. Yatırım tavsiyesi değildir.",
  coingecko:
    "Binance ve BtcTurk'te işlem görmeyen coinler (OKB, Cronos, Pi gibi). Fiyat ve grafik CoinGecko'dan gelir: birçok borsanın ortalamasıdır, ~2 dk gecikebilir; grafik en fazla son 1 yılı gösterir. Yatırım tavsiyesi değildir.",
};

const FUND_KINDS: { value: string; label: string }[] = [
  { value: "", label: "Tümü" },
  { value: "yat", label: "Yatırım fonları" },
  { value: "emk", label: "Emeklilik (BES)" },
  { value: "byf", label: "Borsa yatırım fonları" },
];

const HINTS: Partial<Record<CatalogCategory, string>> = {
  kripto:
    "Coinler platform klasörlerinde: Binance (spot USDT ve TL, vadeli, Alpha), BtcTurk, Midas ve hiçbirinde olmayanlar için Diğer (CoinGecko). Aynı coin farklı borsada ayrı satırdır; TL paritelerinin fiyatı TL'dir. Satırdaki rozetler coinin hangi platformlarda işlem gördüğünü gösterir.",
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
  const [folder, setFolder] = useState("");
  const [binanceSub, setBinanceSub] = useState("");
  const [folderCounts, setFolderCounts] = useState<Record<string, number> | null>(null);
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

  const venue = folder === "binance" ? binanceSub || "binance" : folder;
  const key = `${category}|${category === "kripto" ? venue : category === "fon" ? fundKind : ""}|${query}|${page}`;
  useEffect(() => {
    let alive = true;
    const p = new URLSearchParams({ kategori: category, sayfa: String(page), adet: String(PAGE_SIZE) });
    if (query) p.set("q", query);
    if (category === "kripto" && venue) p.set("borsa", venue);
    if (category === "fon" && fundKind) p.set("tur", fundKind);
    fetchJson<CatalogPage>(`/api/catalog?${p.toString()}`)
      .then((data) => {
        if (!alive) return;
        setState({ key, data });
        if (data.folders) setFolderCounts(data.folders);
      })
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
            <>
              <FolderTabs
                options={FOLDERS}
                value={folder}
                counts={folderCounts}
                onChange={(v) => {
                  setFolder(v);
                  setBinanceSub("");
                  setPage(0);
                }}
              />
              {folder === "binance" && (
                <FilterButtons
                  options={BINANCE_SUBS.map((o) => ({ ...o, label: countLabel(o.label, folderCounts?.[o.value || "binance"]) }))}
                  value={binanceSub}
                  onChange={(v) => {
                    setBinanceSub(v);
                    setPage(0);
                  }}
                />
              )}
            </>
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
          {category === "kripto" && VENUE_HINTS[venue] && <p className={`text-xs ${venue === "midas" ? "text-violet-200/80" : "text-amber-300/80"}`}>{VENUE_HINTS[venue]}</p>}
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

const countLabel = (label: string, n: number | undefined) => (n == null ? label : `${label} (${n.toLocaleString("tr-TR")})`);

/** Kripto platform klasörleri: yatay kaydırılan sekmeler, her birinde satır sayısı (aramaya göre) */
function FolderTabs({
  options,
  value,
  counts,
  onChange,
}: {
  options: { value: string; label: string }[];
  value: string;
  counts: Record<string, number> | null;
  onChange: (v: string) => void;
}) {
  return (
    <div role="tablist" aria-label="Kripto platformları" className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-0.5">
      {options.map((o) => {
        const active = value === o.value;
        const n = counts?.[o.value];
        return (
          <button
            key={o.value}
            role="tab"
            aria-selected={active}
            onClick={() => onChange(o.value)}
            className={`flex shrink-0 items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs transition ${
              active ? "border-sky-500/40 bg-sky-500/15 text-sky-100" : "border-line bg-surface-2/40 text-slate-400 hover:text-white"
            }`}
          >
            <svg viewBox="0 0 24 24" className="h-3.5 w-3.5 shrink-0" fill="none" stroke="currentColor" strokeWidth={2} strokeLinejoin="round" aria-hidden>
              <path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
            </svg>
            <span className="font-medium">{o.label}</span>
            {n != null && <span className={`num rounded px-1 text-[10px] ${active ? "bg-sky-500/20" : "bg-surface-2"}`}>{n.toLocaleString("tr-TR")}</span>}
          </button>
        );
      })}
    </div>
  );
}

/** Liste süzgeci düğmeleri (Binance alt süzgeci, fon türü) */
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

/** Vadeli / Alpha / CoinGecko satırlarında sembol + rozet (sembolün yanında "(Vadeli)" tekrar yazılmaz) */
function rowSymbol(it: CatalogItem) {
  const c = it.assetType === "crypto" ? parseCryptoSymbol(it.symbol) : null;
  return c && (c.venue === "BINANCE-F" || c.venue === "BINANCE-ALPHA" || c.venue === "COINGECKO") ? c.base : displaySymbol(it.assetType, it.symbol);
}

function VenueBadge({ item }: { item: CatalogItem }) {
  const c = item.assetType === "crypto" ? parseCryptoSymbol(item.symbol) : null;
  if (c?.venue === "BINANCE-F")
    return <span className="shrink-0 rounded bg-sky-500/15 px-1.5 py-0.5 text-[10px] font-medium text-sky-300" title="Binance vadeli kontrat fiyatı">Vadeli</span>;
  if (c?.venue === "BINANCE-ALPHA")
    return <span className="shrink-0 rounded bg-fuchsia-500/15 px-1.5 py-0.5 text-[10px] font-medium text-fuchsia-300" title="Binance Alpha: erken aşama, yüksek riskli token">Alpha</span>;
  if (c?.venue === "COINGECKO")
    return <span className="shrink-0 rounded bg-emerald-500/15 px-1.5 py-0.5 text-[10px] font-medium text-emerald-300" title="Binance ve BtcTurk'te yok; fiyat CoinGecko'dan (borsalar ortalaması)">CoinGecko</span>;
  return null;
}

const PLATFORM_CLS: Record<string, string> = {
  Binance: "text-amber-300/90 border-amber-500/30",
  BtcTurk: "text-sky-300/90 border-sky-500/30",
  Midas: "text-violet-300/90 border-violet-500/30",
};

/** Coinin işlem gördüğü platformlar (küçük çerçeveli rozetler) */
function PlatformBadges({ item }: { item: CatalogItem }) {
  if (!item.platforms?.length) return null;
  return (
    <span className="flex shrink-0 gap-1" title={`İşlem gördüğü platformlar: ${item.platforms.join(", ")}`}>
      {item.platforms.map((p) => (
        <span key={p} className={`rounded border px-1 text-[10px] leading-4 ${PLATFORM_CLS[p] ?? "border-line text-slate-400"}`}>
          {p}
        </span>
      ))}
    </span>
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
                  <span className="truncate">{rowSymbol(it)}</span>
                  <VenueBadge item={it} />
                  {q?.stale && q.price != null && <StaleBadge fetchedAt={q.fetchedAt} />}
                </div>
                <div className="flex min-w-0 items-center gap-1.5 text-xs text-slate-500">
                  <PlatformBadges item={it} />
                  <span className="truncate">{[it.name !== it.symbol ? it.name : null, it.exchange, it.currency].filter(Boolean).join(" · ")}</span>
                </div>
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
