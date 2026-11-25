"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { ASSET_TYPE_INFO, displaySymbol, GOLD_SPREAD_EXPLAIN, isCurrency, parseInstrumentId, quantityUnit, type Mode } from "@/lib/assets";
import { formatDate, formatMoney, formatPercent, formatQuantity, formatSigned, pnlClass } from "@/lib/format";
import type { ChartData, ChartRange } from "@/lib/market";
import type { PositionDetail } from "@/lib/positionDetail";
import type { TechnicalAnalysis } from "@/lib/technical";
import { fetchJson, goToLogin, UnauthorizedError, usePolling } from "@/lib/usePolling";
import { DividendSuggestionRow, KapItem } from "./AssetPanels";
import { detailHref } from "./MarketView";
import { OrderForm } from "./OrdersView";
import { AlarmForm } from "./AlarmsView";
import { HeadlinesPanel, SincePurchase, WhyMovingButton } from "./AssetInsights";
import { PriceChart, type ChartMarkerIn, type ChartPriceLine } from "./PriceChart";
import { AccountChips } from "./AccountControls";
import { AccountBreakdown, AnnualReturn, noteReminderText, PositionNoteCard, SellEstimateCard, XIRR_EXPLAIN } from "./PositionExtras";
import { SanalRealityCard } from "./SanalReality";
import { SignalBadge } from "./TechnicalPanel";
import { TransactionForm, toInput, today } from "./TransactionForm";
import { Card, Explain, Modal, PriceMeta, Segmented } from "./ui";
import { InfoTip } from "./help";
import type { TermId } from "@/content/sozluk/terimler";

const RANGES: { value: ChartRange; label: string }[] = [
  { value: "1H", label: "1H" },
  { value: "1A", label: "1A" },
  { value: "3A", label: "3A" },
  { value: "1Y", label: "1Y" },
  { value: "5Y", label: "5Y" },
];

/** URL'de mod: gercek | sanal; hesap verilirse o hesabın pozisyonu */
export function positionHref(mode: Mode, instrument: string, account?: number | null) {
  return `/portfoy/pozisyon?mod=${mode === "real" ? "gercek" : "sanal"}&id=${encodeURIComponent(instrument)}${mode === "real" && account != null ? `&hesap=${account}` : ""}`;
}

type Action = "convert" | "sellVirtual" | "buy" | "sell" | "order" | "alarm" | null;

/** Pozisyonun tutulduğu süreye uygun grafik aralığı */
function autoRange(days: number): ChartRange {
  if (days <= 6) return "1H";
  if (days <= 25) return "1A";
  if (days <= 85) return "3A";
  if (days <= 350) return "1Y";
  return "5Y";
}

const SENTIMENT_CLS: Record<string, string> = { olumlu: "text-emerald-300", olumsuz: "text-rose-300", nötr: "text-slate-300" };

export function PositionDetailView() {
  const params = useSearchParams();
  const router = useRouter();
  const mode: Mode = params.get("mod") === "sanal" ? "virtual" : "real";
  const virtual = mode === "virtual";
  const ref = parseInstrumentId(params.get("id") ?? "");
  const id = ref ? `${ref.type}:${ref.symbol}` : "";
  const hesapRaw = Number(params.get("hesap"));
  const account = !virtual && Number.isInteger(hesapRaw) && hesapRaw > 0 ? hesapRaw : null;

  const { data, error, reload } = usePolling<PositionDetail>(
    `/api/position?mode=${mode}&id=${encodeURIComponent(id || "fx:USD")}${account != null ? `&hesap=${account}` : ""}`,
    60_000,
  );
  const d = data && data.instrument === id && data.mode === mode && data.account === account ? data : null;
  const h = d?.holding ?? null;
  const accName = (aid: number | null) => (aid != null ? (d?.accounts.find((a) => a.id === aid)?.name ?? null) : null);
  // İşlem formunda önerilecek hesap: seçili hesap ya da pozisyonun tek hesabı
  const formAccount = account ?? (h && h.accounts.length === 1 ? h.accounts[0].accountId : null);
  const note = d?.note ?? null;
  const targetPrice = note?.targetPrice ?? null;
  const stopPrice = note?.stopPrice ?? null;
  const priceLines = useMemo<ChartPriceLine[]>(
    () => [
      ...(targetPrice != null ? [{ price: targetPrice, color: "#38bdf8", title: "Hedef" }] : []),
      ...(stopPrice != null ? [{ price: stopPrice, color: "#fb7185", title: "Stop" }] : []),
    ],
    [targetPrice, stopPrice],
  );

  const [rangeSel, setRangeSel] = useState<ChartRange | null>(null);
  const range: ChartRange = rangeSel ?? (h ? autoRange(h.days) : "3A");
  const [chart, setChart] = useState<{ key: string; data: ChartData | null; error?: string } | null>(null);
  const [tech, setTech] = useState<{ id: string; data: TechnicalAnalysis | null } | null>(null);
  const [action, setAction] = useState<Action>(null);
  const [toast, setToast] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    let alive = true;
    fetchJson<ChartData>(`/api/chart?id=${encodeURIComponent(id)}&range=${range}`)
      .then((c) => alive && setChart({ key: `${id}|${range}`, data: c }))
      .catch((err: unknown) => {
        if (err instanceof UnauthorizedError) return goToLogin();
        if (alive) setChart({ key: `${id}|${range}`, data: null, error: "Grafik verisi alınamadı." });
      });
    return () => {
      alive = false;
    };
  }, [id, range]);

  useEffect(() => {
    if (!id) return;
    let alive = true;
    fetchJson<TechnicalAnalysis>(`/api/technical?id=${encodeURIComponent(id)}`)
      .then((t) => alive && setTech({ id, data: t }))
      .catch(() => alive && setTech({ id, data: null }));
    return () => {
      alive = false;
    };
  }, [id]);

  const markers = useMemo<ChartMarkerIn[]>(
    () =>
      (d?.transactions ?? []).map((t) => ({
        // Gün sonuna oturt: o günün mumuna (ya da son saatine) denk gelsin.
        time: Math.floor(Date.parse(`${t.date}T23:59:00+03:00`) / 1000),
        side: t.side,
        price: t.price,
        text: virtual && t.side === "buy" ? "Giriş" : `${t.side === "buy" ? "AL" : "SAT"} ${formatQuantity(t.quantity)}`,
      })),
    [d?.transactions, virtual],
  );

  if (!ref) {
    return (
      <Card className="p-8 text-center">
        <p className="text-slate-300">Pozisyon bulunamadı.</p>
        <Link href="/" className="mt-3 inline-block text-sm text-accent">
          Portföye dön
        </Link>
      </Card>
    );
  }

  const current = chart && chart.key === `${id}|${range}` ? chart : null;
  const points = current?.data?.points ?? [];
  const cur = h?.currency || current?.data?.currency || "TRY";
  const name = displaySymbol(ref.type, ref.symbol);
  const techData = tech && tech.id === id ? tech.data : null;

  function done(msg: string) {
    setAction(null);
    setToast(msg);
    setTimeout(() => setToast(null), 3500);
    void reload();
  }

  const back = () => (window.history.length > 1 ? router.back() : router.push("/"));
  const unit = quantityUnit(ref.type, ref.symbol);

  return (
    <div className="space-y-4 md:space-y-6">
      <div className="flex items-center gap-2">
        <button onClick={back} className="-ml-2 rounded-lg p-2 text-slate-400 hover:text-white" aria-label="Portföye dön">
          <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
            <path d="M15 18l-6-6 6-6" />
          </svg>
        </button>
        <div className="min-w-0 flex-1">
          <h1 className="flex items-center gap-2 text-xl font-semibold tracking-tight">
            <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: ASSET_TYPE_INFO[ref.type].color }} />
            <span className="truncate">{name}</span>
            <span className={`shrink-0 rounded px-1.5 py-0.5 text-[11px] font-medium ${virtual ? "bg-violet-500/20 text-violet-200" : "bg-emerald-500/15 text-emerald-300"}`}>
              {virtual ? "Sanal" : "Gerçek"}
            </span>
          </h1>
          <p className="truncate text-sm text-slate-500">{h?.name ?? current?.data?.name ?? ASSET_TYPE_INFO[ref.type].label}</p>
        </div>
        <Link href={detailHref(id, h?.name)} className="shrink-0 rounded-xl border border-line px-3 py-2 text-xs text-slate-300 hover:bg-surface-2">
          Piyasa detayı
        </Link>
      </div>

      {d && !virtual && (d.heldIn.length > 1 || account != null) && (
        <AccountChips
          items={d.accounts.filter((a) => d.heldIn.includes(a.id) || a.id === account).map((a) => ({ id: a.id, name: a.name }))}
          value={account}
          onChange={(aid) => router.replace(positionHref(mode, id, aid))}
        />
      )}

      {error && !d && <p className="rounded-xl bg-amber-500/10 px-3 py-2 text-sm text-amber-300">{error}</p>}
      {!d && !error && <Card className="p-6 text-center text-sm text-slate-500">Yükleniyor…</Card>}

      {d && !h && (
        <Card className="p-4 text-sm text-slate-400">
          Bu pozisyon şu an kapalı (elinizde {unit} kalmadı). Aşağıda geçmiş işlemleri görebilirsiniz.
        </Card>
      )}

      {h && (
        <Card className={`p-4 md:p-6 ${virtual ? "border-violet-500/30" : ""}`}>
          <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-2">
            <div>
              <div className="text-xs text-slate-500">{h.ask != null && h.bid != null ? "Alış fiyatı (bugün satsanız)" : "Güncel fiyat"}</div>
              <div className="num text-2xl font-semibold tracking-tight">{formatMoney(h.price, cur, 4)}</div>
              {h.ask != null && h.bid != null && (
                <div className="num text-xs text-slate-500" title={GOLD_SPREAD_EXPLAIN}>
                  Satış fiyatı (alırken): {formatMoney(h.ask, cur, 4)} · değer alış fiyatıyla hesaplanır
                </div>
              )}
              <div className="num text-sm">
                <span className={pnlClass(h.changePct)}>
                  {ref.type === "fund" ? "Son gün" : "Bugün"} {formatPercent(h.changePct)}
                </span>
              </div>
              <PriceMeta q={h} />
            </div>
            <div className="text-right">
              <div className="text-xs text-slate-500">Değer</div>
              <div className="num text-2xl font-semibold tracking-tight">{formatMoney(h.valueTry)}</div>
              <div className={`num text-sm font-medium ${pnlClass(h.pnlTry)}`}>
                {formatSigned(h.pnlTry)} ({formatPercent(h.pnlPct)})
              </div>
            </div>
          </div>
          <dl className="num mt-4 grid grid-cols-2 gap-x-4 gap-y-2.5 border-t border-line pt-4 text-sm sm:grid-cols-3 md:grid-cols-4">
            <Item label="Miktar">
              {formatQuantity(h.quantity)} {unit}
            </Item>
            <Item label={virtual ? "Giriş fiyatı" : "Ortalama maliyet"} tip={virtual ? undefined : "ortalama-maliyet"}>{formatMoney(h.avgCost, cur, 4)}</Item>
            <Item label={virtual ? "Yatırılan" : "Maliyet (TL)"}>{formatMoney(h.costTry)}</Item>
            <Item label="Güncel değer">{formatMoney(h.valueTry)}</Item>
            <Item label="K/Z (TL)">
              <span className={pnlClass(h.pnlTry)}>{formatSigned(h.pnlTry)}</span>
            </Item>
            <Item label="K/Z %">
              <span className={pnlClass(h.pnlPct)}>{formatPercent(h.pnlPct)}</span>
            </Item>
            <Item label="Bugün" tip="bugun">
              {h.dayChangeTry == null ? (
                "—"
              ) : (
                <span className={pnlClass(h.dayChangeTry)}>
                  {formatSigned(h.dayChangeTry)} · {formatPercent(h.dayChangePct)}
                  {h.dayIsPastSession && <span className="text-xs text-slate-500"> (son seans)</span>}
                </span>
              )}
            </Item>
            <Item label={virtual ? "Sanal alış" : "Elde tutma"}>
              {virtual ? `${h.days} gün önce sanal alındı` : `${h.days} gün`}
              <span className="block text-xs text-slate-500">{formatDate(h.firstDate)}</span>
            </Item>
            {h.fxEffectTry != null && h.priceEffectTry != null && (
              <>
                <Item label="Fiyat etkisi">
                  <span className={pnlClass(h.priceEffectTry)}>{formatSigned(h.priceEffectTry)}</span>
                </Item>
                <Item label="Kur etkisi" tip="kur-etkisi">
                  <span className={pnlClass(h.fxEffectTry)}>{formatSigned(h.fxEffectTry)}</span>
                  {h.fxEstimated && " *"}
                </Item>
              </>
            )}
            {h.dividendsTry > 0 && (
              <Item label="Temettü geliri">
                <span className="text-emerald-300">{formatMoney(h.dividendsTry)}</span>
              </Item>
            )}
            {h.feesTry > 0 && <Item label="Ödenen komisyon">{formatMoney(h.feesTry)}</Item>}
            <Item label="Yıllık getiri (XIRR)" tip="xirr">
              <AnnualReturn a={h.annual} />
            </Item>
            {!virtual && (account != null || h.accounts.length === 1) && (
              <Item label="Hesap">{accName(account ?? h.accounts[0]?.accountId ?? null) ?? "—"}</Item>
            )}
          </dl>
          <p className="mt-3 text-xs text-slate-500">
            K/Z % yalnızca toplam kazancı gösterir. {XIRR_EXPLAIN}
          </p>
          {h.fxEffectTry != null && (
            <p className="mt-3 text-xs text-slate-500">
              Fiyat etkisi: varlığın kendi para birimindeki değişim (bugünkü kurla). Kur etkisi: alış günündeki kurdan bugüne kur değişiminin katkısı.
            </p>
          )}
        </Card>
      )}

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {virtual ? (
          <>
            <ActionButton tone="violet" disabled={!h} onClick={() => setAction("convert")}>
              Gerçekten aldım
            </ActionButton>
            <ActionButton tone="outline" disabled={!h} onClick={() => setAction("sellVirtual")}>
              Sanal sat / kapat
            </ActionButton>
          </>
        ) : (
          <>
            <ActionButton tone="green" onClick={() => setAction("buy")}>
              Al
            </ActionButton>
            <ActionButton tone="red" disabled={!h} onClick={() => setAction("sell")}>
              Sat
            </ActionButton>
          </>
        )}
        <ActionButton tone="outline" onClick={() => setAction("order")}>
          Emir ver
        </ActionButton>
        <ActionButton tone="outline" onClick={() => setAction("alarm")}>
          Alarm kur
        </ActionButton>
      </div>

      {toast && (
        <p role="status" className="rounded-xl bg-emerald-500/10 px-3 py-2 text-sm text-emerald-300">
          {toast}
        </p>
      )}

      <Card className="p-4 md:p-6">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-semibold">Fiyat ve işlemlerin</h2>
          <span className="text-xs text-slate-500">Fiyat birimi: {cur}</span>
        </div>
        <div className="mt-3">
          <Segmented<ChartRange> value={range} onChange={setRangeSel} options={ref.type === "fund" ? RANGES.filter((r) => r.value !== "1H") : RANGES} />
        </div>
        <div className="relative mt-3">
          <PriceChart
            key={h?.avgCost != null ? "maliyetli" : "maliyetsiz"}
            points={points}
            currency={cur}
            intraday={!!current?.data?.intraday}
            baseline={h?.avgCost ?? null}
            baselineLabel={virtual ? "Girişin" : "Maliyetin"}
            markers={markers}
            priceLines={priceLines}
            height={260}
          />
          {(!current || current.error || points.length === 0) && (
            <div className="absolute inset-0 flex items-center justify-center text-sm text-slate-500">
              {!current ? "Grafik yükleniyor…" : current.error ? <span className="text-rose-400">{current.error}</span> : "Bu aralık için veri yok."}
            </div>
          )}
        </div>
        <ul className="mt-2 space-y-0.5 text-xs text-slate-500">
          <li>
            <span className="text-amber-300">- - -</span> {virtual ? "Girişin" : "Maliyetin"}: {virtual ? "sanal giriş fiyatın" : "ortalama alış fiyatın"}. Çizginin üstünde grafik
            yeşil (kârdasın), altında kırmızı (zarardasın).
          </li>
          <li>
            <span className="text-emerald-300">▲</span> alış, <span className="text-rose-300">▼</span> satış noktaları (işlem gününe yerleştirilir).
          </li>
          {priceLines.length > 0 && (
            <li>
              {note?.targetPrice != null && (
                <>
                  <span className="text-sky-300">— —</span> Hedef{" "}
                </>
              )}
              {note?.stopPrice != null && (
                <>
                  <span className="text-rose-300">— —</span> Stop{" "}
                </>
              )}
              fiyatların: pozisyon notundan.
            </li>
          )}
        </ul>
      </Card>

      {d && h && <AccountBreakdown h={h} unit={unit} onPick={(aid) => router.replace(positionHref(mode, id, aid))} />}

      {d && h && d.sell && <SellEstimateCard s={d.sell} virtual={virtual} />}

      {d && (
        <PositionNoteCard
          key={`${note?.updatedAt ?? "yok"}`}
          mode={mode}
          assetType={ref.type}
          symbol={ref.symbol}
          currency={cur}
          note={note}
          price={h?.price ?? null}
          alarms={d.priceAlarms}
          onChanged={(msg) => done(msg)}
        />
      )}

      {d && d.valueHistory.length > 1 && h && (
        <Card className="p-4 md:p-6">
          <h2 className="font-semibold">Yatırımımın değeri</h2>
          <p className="mt-1 text-xs text-slate-500">Girişten bu yana her gün: elindeki miktar × o günkü kapanış fiyatı{cur !== "TRY" ? " × o günkü kur" : ""} (TL).</p>
          <div className="mt-3">
            <PriceChart points={d.valueHistory} currency="TRY" baseline={h.costTry ?? null} baselineLabel={virtual ? "Yatırılan" : "Maliyet"} height={170} />
          </div>
        </Card>
      )}
      {d?.valueHistoryError && <p className="text-xs text-amber-300">{d.valueHistoryError}</p>}

      {d && (
        <Card>
          <div className="flex items-center justify-between px-4 pt-4 md:px-6">
            <h2 className="font-semibold">İşlemler</h2>
            <Link href="/islemler" className="text-xs text-accent">
              Düzenle / sil ›
            </Link>
          </div>
          {d.transactions.length === 0 ? (
            <p className="px-4 py-3 text-sm text-slate-500 md:px-6">İşlem yok.</p>
          ) : (
            <ul className="num mt-1 divide-y divide-line/60 text-sm">
              {d.transactions.map((t) => (
                <li key={t.id} className="px-4 py-2.5 md:px-6">
                  <div className="flex flex-wrap items-baseline justify-between gap-x-3">
                    <span>
                      <span className={t.side === "buy" ? "text-emerald-300" : "text-rose-300"}>{t.side === "buy" ? (virtual ? "Sanal alış" : "Alış") : "Satış"}</span>{" "}
                      <span className="text-slate-500">{formatDate(t.date)}</span>
                    </span>
                    <span>
                      {formatQuantity(t.quantity)} × {formatMoney(t.price, t.currency, 4)}
                    </span>
                  </div>
                  {(t.fee > 0 || (!virtual && account == null && d.heldIn.length > 1)) && (
                    <p className="text-xs text-slate-500">
                      {!virtual && account == null && d.heldIn.length > 1 && accName(t.accountId)}
                      {t.fee > 0 && `${!virtual && account == null && d.heldIn.length > 1 ? " · " : ""}komisyon ${formatMoney(t.fee, t.currency)}`}
                    </p>
                  )}
                  {t.note && <p className="text-xs text-slate-500">{t.note}</p>}
                </li>
              ))}
            </ul>
          )}
        </Card>
      )}

      {h && <WhyMovingButton instrument={id} changePct={h.changePct} />}

      {d && d.transactions.some((t) => t.side === "buy") && <SincePurchase mode={mode} instrument={id} />}

      <Card className="p-4 md:p-6">
        <div className="flex items-center justify-between gap-2">
          <h2 className="font-semibold">Teknik analiz</h2>
          <Link href={detailHref(id, h?.name)} className="text-xs text-accent">
            Ayrıntılar ›
          </Link>
        </div>
        {techData ? (
          <div className="mt-2 flex flex-wrap items-center gap-2 text-sm">
            <SignalBadge label={techData.summary.label} score={techData.summary.insufficient ? null : techData.summary.score} />
            <span className="text-slate-400">{techData.summary.insufficient ?? techData.summary.reasons[0]?.title ?? ""}</span>
          </div>
        ) : (
          <p className="mt-2 text-sm text-slate-500">{tech ? "Teknik analiz için veri alınamadı." : "Yükleniyor…"}</p>
        )}
        <p className="mt-2 text-xs text-slate-500">Geçmiş fiyatlardan hesaplanan özet sinyaldir; geleceği garanti etmez, yatırım tavsiyesi değildir.</p>
      </Card>

      {d && d.orders.length > 0 && (
        <Card className="p-4 md:p-6">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold">Bekleyen emirler</h2>
            <Link href="/emirler" className="text-xs text-accent">
              Emirler ›
            </Link>
          </div>
          <ul className="num mt-2 space-y-1 text-sm">
            {d.orders.map((o) => (
              <li key={o.id} className="flex flex-wrap justify-between gap-x-3">
                <span>
                  <span className={o.side === "buy" ? "text-emerald-300" : "text-rose-300"}>{o.side === "buy" ? "Al" : "Sat"}</span> · fiyat{" "}
                  {o.condition === "lte" ? "≤" : "≥"} {formatMoney(o.triggerPrice, o.triggerCurrency, 4)}
                </span>
                <span className="text-slate-500">
                  {o.amount != null ? formatMoney(o.amount, o.amountCurrency ?? "TRY") : `${formatQuantity(o.quantity ?? 0)} ${unit}`} · {o.mode === "real" ? "gerçek" : "sanal"}
                </span>
              </li>
            ))}
          </ul>
        </Card>
      )}

      {d && (d.dividends.length > 0 || d.dividendSuggestions.length > 0) && (
        <Card>
          <div className="flex items-center justify-between px-4 pt-4 md:px-6">
            <h2 className="font-semibold">Temettü (kâr payı)</h2>
            <Link href="/temettu" className="text-xs text-accent">
              Temettü ›
            </Link>
          </div>
          {d.dividendSuggestions.length > 0 && (
            <>
              <p className="px-4 pt-1 text-xs text-slate-400 md:px-6">Bu hisse elindeyken kâr payı ödenmiş. Onaylarsan gerçekleşen K/Z’ye eklenir.</p>
              <ul className="divide-y divide-line/60">
                {d.dividendSuggestions.map((s) => (
                  <DividendSuggestionRow key={`${s.accountId ?? 0}-${s.exDate}`} s={s} onDone={() => void reload()} />
                ))}
              </ul>
            </>
          )}
          {d.dividends.length > 0 && (
            <ul className="num space-y-0.5 px-4 py-3 text-sm md:px-6">
              {d.dividends.map((r) => (
                <li key={r.id} className="flex justify-between">
                  <span className="text-slate-400">
                    {formatDate(r.exDate)} · {formatQuantity(r.quantity)} adet
                  </span>
                  <span className="text-emerald-300">{formatMoney(r.amount, r.currency)}</span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      )}

      {d && d.kap.length > 0 && (
        <Card>
          <div className="flex items-center justify-between px-4 pt-4 md:px-6">
            <h2 className="font-semibold">Son KAP bildirimleri</h2>
            <Link href={`/kap?hisse=${encodeURIComponent(ref.symbol)}`} className="text-xs text-accent">
              Tümü ›
            </Link>
          </div>
          <ul className="mt-1 divide-y divide-line/60">
            {d.kap.map((k) => (
              <KapItem key={k.id} d={k} />
            ))}
          </ul>
        </Card>
      )}

      <HeadlinesPanel instrument={id} name={h?.name ?? null} />

      {d?.news && (
        <Card className="p-4 md:p-6">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold">Son haber analizi</h2>
            <Link href="/analizler" className="text-xs text-accent">
              Analizler ›
            </Link>
          </div>
          <p className="mt-1 text-xs text-slate-500">
            {formatDate(d.news.date)} · <span className={SENTIMENT_CLS[d.news.item.sentiment] ?? ""}>{d.news.item.sentiment}</span> · önem {d.news.item.importance}/5
          </p>
          <p className="mt-2 text-sm text-slate-200">{d.news.item.summary}</p>
          {d.news.item.positionImpact && <p className="mt-1 text-sm text-slate-400">{d.news.item.positionImpact}</p>}
          <p className="mt-2 text-[11px] text-slate-500">Yapay zeka analizidir, yatırım tavsiyesi değildir.</p>
        </Card>
      )}

      <Explain>
        {virtual
          ? "Sanal pozisyon gerçek para değildir: “alsaydım ne olurdu” diye takip edersin. Gerçekten aldıysan “Gerçekten aldım” ile gerçek portföye aktar."
          : "K/Z (kâr/zarar): bugünkü değer ile ödediğin toplam tutar arasındaki fark. Ortalama maliyet: farklı fiyatlardan yaptığın alışların ortalamasıdır."}
      </Explain>

      {action === "convert" && h && (
        <Modal title="Gerçekten aldım" onClose={() => setAction(null)}>
          <p className="mb-4 text-sm text-slate-400">Gerçekte ödediğin fiyatı ve aldığın miktarı düzelt. Sanal kayıt silinmez; arşivlenir ve bu gerçek işleme bağlanır.</p>
          <TransactionForm
            mode="real"
            endpoint="/api/portfolio/convert"
            method="POST"
            lockAsset
            lockSide
            header={<SanalRealityCard compact />}
            submitLabel="Gerçek portföye ekle"
            initial={{
              assetType: h.assetType,
              symbol: h.symbol,
              side: "buy",
              quantity: toInput(h.quantity),
              price: toInput(h.avgCost, 6),
              currency: isCurrency(h.currency) ? h.currency : "TRY",
              date: today(),
              note: `Sanal pozisyondan (${formatDate(h.firstDate)}) dönüştürüldü`,
            }}
            onSaved={() => {
              setAction(null);
              router.push(positionHref("real", id));
            }}
          />
        </Modal>
      )}
      {(action === "sellVirtual" || action === "buy" || action === "sell") && (
        <Modal
          title={action === "sellVirtual" ? "Sanal sat / kapat" : action === "buy" ? `${name} al` : `${name} sat`}
          onClose={() => setAction(null)}
        >
          {action === "sellVirtual" && (
            <p className="mb-4 text-sm text-slate-400">Tamamını satarsan sanal pozisyon kapanır; kâr/zarar “gerçekleşen K/Z” olarak sanal portföyde kalır.</p>
          )}
          <TransactionForm
            mode={virtual ? "virtual" : "real"}
            endpoint="/api/transactions"
            method="POST"
            lockAsset
            lockSide
            reminder={action !== "buy" ? noteReminderText(note) : undefined}
            submitLabel={action === "buy" ? "Alışı kaydet" : "Satışı kaydet"}
            initial={{
              accountId: formAccount,
              assetType: ref.type,
              symbol: ref.symbol,
              side: action === "buy" ? "buy" : "sell",
              quantity: action === "buy" ? "" : toInput(account == null && h && h.accounts.length > 1 ? null : h?.quantity),
              // Altında alışta kuyumcu satış (ask), satışta alış (bid) fiyatı önerilir.
              price: action === "buy" && h?.ask != null ? toInput(h.ask, 6) : h?.price != null ? toInput(h.price, 6) : "",
              currency: isCurrency(cur) ? cur : "TRY",
              date: today(),
            }}
            onSaved={() => done(action === "buy" ? "Alış kaydedildi." : "Satış kaydedildi.")}
          />
        </Modal>
      )}
      {action === "order" && (
        <Modal title="Yeni emir" onClose={() => setAction(null)}>
          <OrderForm initialAssetType={ref.type} initialSymbol={ref.symbol} initialMode={mode} initialAccountId={formAccount} onSaved={() => done("Emir kaydedildi.")} />
        </Modal>
      )}
      {action === "alarm" && (
        <Modal title="Alarm kur" onClose={() => setAction(null)}>
          <AlarmForm
            initialAssetType={ref.type}
            initialSymbol={ref.symbol}
            initialMode={h ? mode : undefined}
            currentPrice={h?.price}
            currency={cur}
            onSaved={() => done("Alarm kuruldu. Alarmlar sayfasından yönetebilirsiniz.")}
          />
        </Modal>
      )}
    </div>
  );
}

function Item({ label, tip, children }: { label: string; tip?: TermId; children: React.ReactNode }) {
  return (
    <div>
      <dt className="flex items-center gap-1 text-xs text-slate-500">
        {label}
        {tip && <InfoTip term={tip} />}
      </dt>
      <dd>{children}</dd>
    </div>
  );
}

function ActionButton({
  tone,
  children,
  ...rest
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { tone: "violet" | "green" | "red" | "outline" }) {
  const cls = {
    violet: "bg-violet-500 text-white",
    green: "bg-accent text-emerald-950",
    red: "bg-rose-500 text-white",
    outline: "border border-line bg-surface text-slate-100 hover:bg-surface-2",
  }[tone];
  return (
    <button {...rest} className={`rounded-xl px-2 py-3 text-sm font-semibold hover:brightness-110 disabled:opacity-40 ${cls}`}>
      {children}
    </button>
  );
}
