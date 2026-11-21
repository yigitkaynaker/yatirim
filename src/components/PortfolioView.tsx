"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { ASSET_TYPE_INFO, displaySymbol, isCurrency, type Mode } from "@/lib/assets";
import type { DividendSuggestion } from "@/lib/dividends";
import { formatDate, formatMoney, formatPercent, formatQuantity, formatSigned, formatTime, pnlClass } from "@/lib/format";
import type { Holding, PortfolioSummary } from "@/lib/portfolio";
import { usePolling } from "@/lib/usePolling";
import { MarketStrip } from "./MarketStrip";
import { AllocationDonut, PortfolioHistory } from "./PortfolioCharts";
import { TransactionForm, toInput, today } from "./TransactionForm";
import { Card, Modal, ModeTabs, PriceMeta, PrimaryButton, StaleBadge } from "./ui";
import { positionHref } from "./PositionDetailView";
import { VirtualEntryForm } from "./VirtualEntryForm";
import { DailySummaryCard, PortfolioAnalytics } from "./PortfolioInsights";
import { ACCOUNT_EXPLAIN, AccountChips, refreshAccounts } from "./AccountControls";
import { AnnualReturn, XIRR_EXPLAIN } from "./PositionExtras";
import { SanalRealityCard } from "./SanalReality";
import type { AccountTotal } from "@/lib/portfolio";

export function PortfolioView() {
  const [mode, setMode] = useState<Mode>("real");
  const [account, setAccount] = useState<number | null>(null);
  const acc = mode === "real" ? account : null;
  const { data, error, loading, lastSuccess, reload } = usePolling<PortfolioSummary>(`/api/portfolio?mode=${mode}${acc != null ? `&hesap=${acc}` : ""}`);
  const [adding, setAdding] = useState(false);
  const [converting, setConverting] = useState<Holding | null>(null);

  // Mod / hesap değişince bir önceki görünümün verisini gösterme.
  const summary = data && data.mode === mode && (data.account ?? null) === acc ? data : null;
  const lastAccounts = data?.mode === "real" ? data.accounts : null;
  const virtual = mode === "virtual";

  return (
    <div className="space-y-4 md:space-y-6">
      <MarketStrip />

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <ModeTabs mode={mode} onChange={setMode} />
        <div className="flex items-center gap-2">
          <span className="text-xs text-slate-500">
            {loading ? "Güncelleniyor…" : lastSuccess ? `Güncellendi ${formatTime(lastSuccess)}` : ""}
          </span>
          <button
            onClick={() => reload(true)}
            className="rounded-xl border border-line px-3 py-2 text-sm text-slate-300 hover:bg-surface-2"
            aria-label="Fiyatları yenile"
          >
            Yenile
          </button>
          <PrimaryButton tone={mode} onClick={() => setAdding(true)}>
            {virtual ? "+ Sanal pozisyon" : "+ İşlem ekle"}
          </PrimaryButton>
        </div>
      </div>

      {mode === "real" && lastAccounts && (
        <AccountChips
          items={lastAccounts.map((a) => ({ id: a.accountId, name: a.name, muted: !a.includeInTotal }))}
          value={account}
          onChange={setAccount}
        />
      )}

      {error && <p className="rounded-xl bg-amber-500/10 px-3 py-2 text-sm text-amber-300">{error}</p>}

      <DailySummaryCard />

      <Summary summary={summary} mode={mode} accountName={acc != null ? (lastAccounts?.find((a) => a.accountId === acc)?.name ?? null) : null} />

      {mode === "real" && acc == null && lastAccounts && lastAccounts.length > 1 && (
        <AccountTotals accounts={lastAccounts} onPick={setAccount} onChanged={() => void reload()} />
      )}

      {mode === "virtual" && <SanalRealityCard />}

      <DividendHint mode={mode} />

      {summary?.holdings.some((h) => h.assetType === "gold" && h.ask != null) && (
        <p className="rounded-xl border border-line/70 bg-bg/40 px-3 py-2 text-xs text-slate-400">
          <span className="text-slate-200">Altın değeri:</span> Elinizdeki altın kuyumcunun <b>alış</b> fiyatıyla (bugün satsanız elinize geçecek tutarla) değerlenir.
          Alırken ödediğiniz <b>satış</b> fiyatı daha yüksektir; aradaki fark (makas) yüzünden altın alır almaz küçük bir zarar görünür. Gram altın fiyatı ons ve dolar
          kurundan hesaplanır ve makas içermez.
        </p>
      )}

      {summary && summary.allocation.length > 0 && <AllocationDonut summary={summary} />}

      {acc == null && <PortfolioHistory mode={mode} />}

      {acc == null && <PortfolioAnalytics mode={mode} />}

      <Holdings summary={summary} mode={mode} onConvert={setConverting} onAdd={() => setAdding(true)} />

      {adding && (
        <Modal title={virtual ? "Sanal pozisyon aç" : "Yeni işlem"} onClose={() => setAdding(false)}>
          {virtual ? (
            <VirtualEntryForm
              onSaved={() => {
                setAdding(false);
                void reload();
              }}
            />
          ) : (
            <TransactionForm
              mode="real"
              endpoint="/api/transactions"
              method="POST"
              initial={acc != null ? { accountId: acc } : undefined}
              onSaved={() => {
                setAdding(false);
                void reload();
              }}
            />
          )}
        </Modal>
      )}

      {converting && (
        <Modal title="Gerçekten aldım" onClose={() => setConverting(null)}>
          <p className="mb-4 text-sm text-slate-400">
            Sanal giriş bilgileri dolduruldu. Gerçekte ödediğiniz fiyatı ve aldığınız miktarı düzeltin. Sanal kayıt
            silinmez; arşivlenir ve bu gerçek işleme bağlanır.
          </p>
          <TransactionForm
            mode="real"
            endpoint="/api/portfolio/convert"
            method="POST"
            lockAsset
            lockSide
            header={<SanalRealityCard compact />}
            submitLabel="Gerçek portföye ekle"
            initial={{
              assetType: converting.assetType,
              symbol: converting.symbol,
              side: "buy",
              quantity: toInput(converting.quantity),
              price: toInput(converting.avgCost, 6),
              currency: isCurrency(converting.currency) ? converting.currency : "TRY",
              date: today(),
              note: `Sanal pozisyondan (${formatDate(converting.firstDate)}) dönüştürüldü`,
            }}
            onSaved={() => {
              setConverting(null);
              void reload();
            }}
          />
        </Modal>
      )}
    </div>
  );
}

/** Hesap başına toplamlar ve "toplama dahil" anahtarı */
function AccountTotals({ accounts, onPick, onChanged }: { accounts: AccountTotal[]; onPick: (id: number) => void; onChanged: () => void }) {
  const [busy, setBusy] = useState<number | null>(null);
  async function toggle(a: AccountTotal) {
    setBusy(a.accountId);
    try {
      await fetch(`/api/accounts/${a.accountId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ includeInTotal: !a.includeInTotal }),
      });
      await refreshAccounts();
      onChanged();
    } finally {
      setBusy(null);
    }
  }
  return (
    <Card className="p-4 md:p-6">
      <div className="flex items-center justify-between gap-2">
        <h2 className="font-semibold">Hesaplarım</h2>
        <Link href="/ayarlar#hesaplar" className="text-xs text-accent">
          Hesapları yönet ›
        </Link>
      </div>
      <p className="mt-1 text-xs text-slate-500">{ACCOUNT_EXPLAIN}</p>
      <ul className="num mt-3 divide-y divide-line/60">
        {accounts.map((a) => (
          <li key={a.accountId} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2.5">
            <button onClick={() => onPick(a.accountId)} className={`min-w-0 flex-1 text-left ${a.includeInTotal ? "" : "opacity-60"}`}>
              <span className="font-medium text-slate-200 hover:underline">{a.name}</span>
              <span className="block text-xs text-slate-500">
                {a.positions} pozisyon{a.feePct > 0 ? ` · komisyon %${a.feePct.toLocaleString("tr-TR")}` : ""}
                {a.incomplete ? " · bazı fiyatlar eksik" : ""}
              </span>
            </button>
            <div className="text-right">
              <div className="font-medium">{formatMoney(a.valueTry)}</div>
              <div className={`text-xs ${pnlClass(a.pnlTry)}`}>
                {formatSigned(a.pnlTry)} ({formatPercent(a.pnlPct)})
              </div>
            </div>
            <label className="flex w-full cursor-pointer items-center gap-2 text-xs text-slate-400 sm:w-auto" title="Kapalıysa bu hesap toplam değere ve grafiklere dahil edilmez.">
              <input type="checkbox" checked={a.includeInTotal} disabled={busy === a.accountId} onChange={() => void toggle(a)} className="h-4 w-4 accent-emerald-500" />
              Toplama dahil
            </label>
          </li>
        ))}
      </ul>
    </Card>
  );
}

function Summary({ summary, mode, accountName }: { summary: PortfolioSummary | null; mode: Mode; accountName: string | null }) {
  const t = summary?.totals;
  const virtual = mode === "virtual";
  return (
    <Card className={`p-4 md:p-6 ${virtual ? "border-violet-500/30 bg-gradient-to-br from-violet-500/10 to-transparent" : ""}`}>
      <div className="flex items-center gap-2 text-sm text-slate-400">
        {virtual ? "Sanal portföy değeri" : accountName ? `${accountName} değeri` : "Toplam değer"}
        {t?.anyStale && <StaleBadge title="Bazı fiyatlar güncellenemedi; son bilinen fiyatlar kullanılıyor." />}
      </div>
      <div className="num mt-1 text-3xl font-semibold tracking-tight md:text-4xl">{t ? formatMoney(t.valueTry) : "—"}</div>
      <div className="num mt-1 flex flex-wrap items-baseline gap-x-4 gap-y-1 text-sm font-medium">
        <span className={pnlClass(t?.pnlTry)} title="Toplam kâr/zarar: bugünkü değer − maliyet">
          {t ? `${formatSigned(t.pnlTry)} (${formatPercent(t.pnlPct)})` : ""}
        </span>
        {t?.annual && (t.annual.pct != null || (t.annual.short && t.annual.totalPct != null)) && (
          <span title={XIRR_EXPLAIN}>
            <span className="text-slate-500">{t.annual.short ? "Getiri " : "Yıllık "}</span>
            <AnnualReturn a={t.annual} />
          </span>
        )}
        {t && t.dayChangeTry != null && (
          <span title="Bugün: fiyatların bir önceki kapanışa göre değişimi (hafta sonu ve tatilde son seansın değişimi)">
            <span className="text-slate-500">Bugün </span>
            <span className={pnlClass(t.dayChangeTry)}>
              {formatSigned(t.dayChangeTry)} ({formatPercent(t.dayChangePct)})
            </span>
          </span>
        )}
      </div>
      <dl className="num mt-4 grid grid-cols-2 gap-3 border-t border-line pt-4 text-sm md:grid-cols-4">
        <div>
          <dt className="text-slate-500">{virtual ? "Yatırılan" : "Maliyet"}</dt>
          <dd className="font-medium">{t ? formatMoney(t.costTry) : "—"}</dd>
        </div>
        <div>
          <dt className="text-slate-500">Gerçekleşmemiş K/Z</dt>
          <dd className={`font-medium ${pnlClass(t?.pnlTry)}`}>{t ? formatSigned(t.pnlTry) : "—"}</dd>
        </div>
        <div>
          <dt className="text-slate-500">Gerçekleşen K/Z</dt>
          <dd className={`font-medium ${pnlClass(t?.realizedPnlTry)}`}>{t ? formatSigned(t.realizedPnlTry) : "—"}</dd>
          {t && t.dividendsTry > 0 && (
            <dd className="text-xs text-slate-500" title="Onayladığınız temettü (kâr payı) gelirleri gerçekleşen K/Z'ye eklenir.">
              temettü dahil: {formatMoney(t.dividendsTry)}
            </dd>
          )}
        </div>
        <div>
          <dt className="text-slate-500">USD/TRY</dt>
          <dd className="font-medium">{summary?.rates.USD ? formatMoney(summary.rates.USD.price, "TRY", 4) : "—"}</dd>
        </div>
      </dl>
      {t?.incomplete && (
        <p className="mt-3 text-xs text-amber-300">Bazı varlıkların fiyatı alınamadığı için toplamlara dahil edilmedi.</p>
      )}
      {t && t.feesTry > 0 && (
        <p className="mt-3 text-xs text-slate-500">
          Ödenen komisyon: <span className="num text-slate-300">{formatMoney(t.feesTry)}</span> (maliyete ve gerçekleşen K/Z’ye dahil).
        </p>
      )}
      {t?.annual && (t.annual.pct == null || t.annual.short) && t.annual.note && <p className="mt-1 text-xs text-slate-500">Yıllık getiri: {t.annual.note}</p>}
      <p className="mt-3 text-xs text-slate-500">
        Döviz cinsinden varlıklarda değer güncel kurla, maliyet ve gerçekleşen K/Z işlem günündeki kurla TL’ye çevrilir. “Bugün”, fiyatların bir önceki
        kapanışa göre değişimidir; BIST fiyatları yaklaşık 15 dakika gecikmeli, fon fiyatları günde bir kez açıklanır.
      </p>
    </Card>
  );
}

function AssetName({ h }: { h: Holding }) {
  return (
    <div className="flex items-center gap-2">
      <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: ASSET_TYPE_INFO[h.assetType].color }} />
      <div className="min-w-0">
        <Link href={positionHref(h.mode, h.id, h.accountId)} onClick={(e) => e.stopPropagation()} className="flex items-center gap-1.5 font-medium hover:underline">
          {displaySymbol(h.assetType, h.symbol)}
        </Link>
        <div className="max-w-56 truncate text-xs text-slate-500">{h.assetType === "fund" && h.name ? h.name : ASSET_TYPE_INFO[h.assetType].label}</div>
        {h.accounts.length > 1 && <div className="max-w-56 truncate text-[11px] text-slate-500">{h.accounts.map((a) => a.name).join(" + ")}</div>}
        <PriceMeta q={h} />
      </div>
    </div>
  );
}

/** "Bugün" değişimi: TL ve % (önceki kapanışa göre) */
function DayChange({ h, stacked = false }: { h: Holding; stacked?: boolean }) {
  if (h.dayChangeTry == null) return <span className="text-slate-500">—</span>;
  const title = h.dayIsPastSession
    ? "Bugün işlem yok (hafta sonu / tatil ya da fonun son açıklanan günü); son seansın değişimi gösteriliyor."
    : "Bir önceki kapanışa göre bugünkü değişim";
  return (
    <span className={pnlClass(h.dayChangeTry)} title={title}>
      {formatSigned(h.dayChangeTry)}
      {stacked ? <span className="block text-[11px]">{formatPercent(h.dayChangePct)}</span> : ` · ${formatPercent(h.dayChangePct)}`}
      {h.dayIsPastSession && <span className="text-slate-500"> (son seans)</span>}
    </span>
  );
}

/** Altın: fiyat kuyumcu alış fiyatıdır (satarsanız alacağınız); alırken ödenen satış fiyatı da gösterilir */
function GoldBid({ h }: { h: Holding }) {
  if (h.assetType !== "gold" || h.bid == null || h.ask == null) return null;
  return (
    <span className="block text-[11px] text-slate-500" title="Gösterilen fiyat kuyumcunun alış fiyatıdır: bugün satsanız elinize geçecek tutar. Altın alırken satış fiyatını ödersiniz; aradaki fark makastır.">
      alırken {formatMoney(h.ask, "TRY")}
    </span>
  );
}

/** Onay bekleyen temettü geliri varsa kısa uyarı (Temettü sayfasına bağlantı) */
function DividendHint({ mode }: { mode: Mode }) {
  const { data } = usePolling<{ suggestions: DividendSuggestion[] }>("/api/dividends?only=suggestions", 10 * 60_000);
  const list = (data?.suggestions ?? []).filter((s) => s.mode === mode);
  if (list.length === 0) return null;
  const names = [...new Set(list.map((s) => s.name))].slice(0, 3).join(", ");
  return (
    <Link href="/temettu" className="flex items-center justify-between gap-3 rounded-2xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm hover:bg-amber-500/15">
      <span>
        <span className="font-medium text-amber-200">Temettü geliri önerisi ({list.length})</span>
        <span className="block text-xs text-amber-100/70">
          {names} elinizdeyken kâr payı ödemiş görünüyor. Onaylarsanız gerçekleşen K/Z’ye eklenir.
        </span>
      </span>
      <span className="text-amber-200">›</span>
    </Link>
  );
}

function Holdings({
  summary,
  mode,
  onConvert,
  onAdd,
}: {
  summary: PortfolioSummary | null;
  mode: Mode;
  onConvert: (h: Holding) => void;
  onAdd: () => void;
}) {
  const virtual = mode === "virtual";
  const router = useRouter();
  if (!summary) return <Card className="p-6 text-center text-sm text-slate-500">Yükleniyor…</Card>;
  if (summary.holdings.length === 0) {
    return (
      <Card className="p-8 text-center">
        <p className="text-slate-300">{virtual ? "Henüz sanal pozisyon yok." : "Henüz pozisyon yok."}</p>
        <p className="mt-1 text-sm text-slate-500">
          {virtual ? "Bir tutar girin, “alsaydım ne olurdu” takip edilsin." : "İlk alış işleminizi ekleyerek başlayın."}
        </p>
        <PrimaryButton tone={mode} onClick={onAdd} className="mt-4">
          {virtual ? "Sanal pozisyon aç" : "İşlem ekle"}
        </PrimaryButton>
      </Card>
    );
  }

  const cur = (h: Holding) => h.currency || "TRY";
  const open = (h: Holding) => router.push(positionHref(h.mode, h.id, h.accountId));

  return (
    <>
      {/* Mobil: kartlar */}
      <div className="space-y-3 md:hidden">
        {summary.holdings.map((h) => (
          <div
            key={h.id}
            role="link"
            tabIndex={0}
            onClick={() => open(h)}
            onKeyDown={(e) => e.key === "Enter" && open(h)}
            className="cursor-pointer rounded-2xl border border-line bg-surface p-4 transition active:bg-surface-2"
            aria-label={`${displaySymbol(h.assetType, h.symbol)} pozisyon detayı`}
          >
            <div className="flex items-start justify-between gap-3">
              <AssetName h={h} />
              <div className="num text-right">
                <div className="font-semibold">{formatMoney(h.valueTry)}</div>
                <div className={`text-sm ${pnlClass(h.pnlTry)}`}>
                  {formatSigned(h.pnlTry)} · {formatPercent(h.pnlPct)}
                </div>
              </div>
            </div>
            <dl className="num mt-3 grid grid-cols-2 gap-x-4 gap-y-1.5 text-sm">
              {virtual ? (
                <>
                  <Dt label="Giriş">
                    {formatDate(h.firstDate)} · {h.days} gün
                  </Dt>
                  <Dt label="Yatırılan">{formatMoney(h.costTry)}</Dt>
                  <Dt label="Giriş fiyatı">{formatMoney(h.avgCost, cur(h), 4)}</Dt>
                  <Dt label="Güncel fiyat">
                    {formatMoney(h.price, cur(h), 4)}
                    <GoldBid h={h} />
                  </Dt>
                  <Dt label="Miktar">{formatQuantity(h.quantity)}</Dt>
                  <Dt label="Bugün">
                    <DayChange h={h} />
                  </Dt>
                </>
              ) : (
                <>
                  <Dt label="Miktar">{formatQuantity(h.quantity)}</Dt>
                  <Dt label="Ort. maliyet">{formatMoney(h.avgCost, cur(h), 4)}</Dt>
                  <Dt label="Güncel fiyat">
                    {formatMoney(h.price, cur(h), 4)}
                    <GoldBid h={h} />
                  </Dt>
                  <Dt label="Bugün">
                    <DayChange h={h} />
                  </Dt>
                </>
              )}
            </dl>
            <FxBreakdown h={h} className="mt-2 text-xs" />
            {virtual && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onConvert(h);
                }}
                className="mt-3 w-full rounded-xl border border-violet-500/40 py-2 text-sm font-medium text-violet-200 hover:bg-violet-500/10">
                Gerçekten aldım
              </button>
            )}
            <div className="mt-2 flex items-center justify-end gap-1 text-xs text-slate-500">
              Ayrıntılar, grafik ve işlemler <span className="text-base leading-none text-slate-400">›</span>
            </div>
          </div>
        ))}
      </div>

      {/* Masaüstü: tablo */}
      <Card className="hidden overflow-x-auto md:block">
        <table className="num w-full text-sm">
          <thead className="text-left text-xs text-slate-500">
            <tr className="border-b border-line">
              <th className="px-4 py-3 font-medium">Varlık</th>
              {virtual ? (
                <>
                  <th className="px-3 py-3 font-medium">Giriş tarihi</th>
                  <th className="px-3 py-3 text-right font-medium">Giriş fiyatı</th>
                  <th className="px-3 py-3 text-right font-medium">Güncel fiyat</th>
                  <th className="px-3 py-3 text-right font-medium">Bugün</th>
                  <th className="px-3 py-3 text-right font-medium">Yatırılan</th>
                </>
              ) : (
                <>
                  <th className="px-3 py-3 text-right font-medium">Miktar</th>
                  <th className="px-3 py-3 text-right font-medium">Ort. maliyet</th>
                  <th className="px-3 py-3 text-right font-medium">Güncel fiyat</th>
                  <th className="px-3 py-3 text-right font-medium">Bugün</th>
                </>
              )}
              <th className="px-3 py-3 text-right font-medium">Değer (TL)</th>
              <th className="px-3 py-3 text-right font-medium">K/Z (TL)</th>
              <th className="px-3 py-3 text-right font-medium">K/Z %</th>
              {virtual && <th className="px-4 py-3" />}
              <th className="w-6 py-3" aria-label="Ayrıntı" />
            </tr>
          </thead>
          <tbody>
            {summary.holdings.map((h) => (
              <tr key={h.id} onClick={() => open(h)} className="cursor-pointer border-b border-line/60 last:border-0 hover:bg-surface-2/50" title="Pozisyon detayını aç">
                <td className="px-4 py-3">
                  <AssetName h={h} />
                </td>
                {virtual ? (
                  <>
                    <td className="px-3 py-3">
                      {formatDate(h.firstDate)}
                      <div className="text-xs text-slate-500">{h.days} gün önce</div>
                    </td>
                    <td className="px-3 py-3 text-right">{formatMoney(h.avgCost, cur(h), 4)}</td>
                    <td className="px-3 py-3 text-right">
                      {formatMoney(h.price, cur(h), 4)}
                      <GoldBid h={h} />
                    </td>
                    <td className="px-3 py-3 text-right">
                      <DayChange h={h} stacked />
                    </td>
                    <td className="px-3 py-3 text-right">{formatMoney(h.costTry)}</td>
                  </>
                ) : (
                  <>
                    <td className="px-3 py-3 text-right">{formatQuantity(h.quantity)}</td>
                    <td className="px-3 py-3 text-right">{formatMoney(h.avgCost, cur(h), 4)}</td>
                    <td className="px-3 py-3 text-right">
                      {formatMoney(h.price, cur(h), 4)}
                      <GoldBid h={h} />
                    </td>
                    <td className="px-3 py-3 text-right">
                      <DayChange h={h} stacked />
                    </td>
                  </>
                )}
                <td className="px-3 py-3 text-right font-medium">{formatMoney(h.valueTry)}</td>
                <td className={`px-3 py-3 text-right ${pnlClass(h.pnlTry)}`}>
                  {formatSigned(h.pnlTry)}
                  <FxBreakdown h={h} className="mt-0.5 text-[11px] leading-tight" stacked />
                </td>
                <td className={`px-3 py-3 text-right ${pnlClass(h.pnlPct)}`}>{formatPercent(h.pnlPct)}</td>
                {virtual && (
                  <td className="px-4 py-3 text-right">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        onConvert(h);
                      }}
                      className="whitespace-nowrap rounded-lg border border-violet-500/40 px-3 py-1.5 text-xs font-medium text-violet-200 hover:bg-violet-500/10">
                      Gerçekten aldım
                    </button>
                  </td>
                )}
                <td className="py-3 pr-3 text-lg text-slate-500" aria-hidden>
                  ›
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </>
  );
}

/** Döviz cinsinden varlıkta TL K/Z ayrımı: fiyat hareketi + alıştan bu yana kur hareketi. */
function FxBreakdown({ h, className = "", stacked = false }: { h: Holding; className?: string; stacked?: boolean }) {
  if (h.fxEffectTry == null || h.priceEffectTry == null) return null;
  const title = h.fxEstimated
    ? "Bazı işlemlerin alış günü kuru henüz alınamadı; geçici olarak güncel kur kullanıldı."
    : "TL K/Z = fiyat etkisi (varlığın kendi para birimindeki değişim, bugünkü kurla) + kur etkisi (alış günü kurundan bugüne kur değişimi).";
  return (
    <div className={`text-slate-500 ${className}`} title={title}>
      <span className={stacked ? "block" : ""}>
        Fiyat etkisi <span className={pnlClass(h.priceEffectTry)}>{formatSigned(h.priceEffectTry)}</span>
      </span>
      {!stacked && <span className="px-1.5">·</span>}
      <span className={stacked ? "block" : ""}>
        Kur etkisi <span className={pnlClass(h.fxEffectTry)}>{formatSigned(h.fxEffectTry)}</span>
        {h.fxEstimated && " *"}
      </span>
    </div>
  );
}

function Dt({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="text-xs text-slate-500">{label}</dt>
      <dd>{children}</dd>
    </div>
  );
}
