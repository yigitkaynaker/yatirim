"use client";

import { useState } from "react";
import { ASSET_TYPE_INFO, displaySymbol, isCurrency, type Mode } from "@/lib/assets";
import { formatDate, formatMoney, formatPercent, formatQuantity, formatSigned, formatTime, pnlClass } from "@/lib/format";
import type { Holding, PortfolioSummary } from "@/lib/portfolio";
import { usePolling } from "@/lib/usePolling";
import { MarketStrip } from "./MarketStrip";
import { AllocationDonut, PortfolioHistory } from "./PortfolioCharts";
import { TransactionForm, toInput, today } from "./TransactionForm";
import { Card, Modal, ModeTabs, PrimaryButton, StaleBadge } from "./ui";
import { VirtualEntryForm } from "./VirtualEntryForm";

export function PortfolioView() {
  const [mode, setMode] = useState<Mode>("real");
  const { data, error, loading, lastSuccess, reload } = usePolling<PortfolioSummary>(`/api/portfolio?mode=${mode}`);
  const [adding, setAdding] = useState(false);
  const [converting, setConverting] = useState<Holding | null>(null);

  // Mod değişince bir önceki modun verisini gösterme.
  const summary = data && data.mode === mode ? data : null;
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

      {error && <p className="rounded-xl bg-amber-500/10 px-3 py-2 text-sm text-amber-300">{error}</p>}

      <Summary summary={summary} mode={mode} />

      {summary && summary.allocation.length > 0 && <AllocationDonut summary={summary} />}

      <PortfolioHistory mode={mode} />

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

function Summary({ summary, mode }: { summary: PortfolioSummary | null; mode: Mode }) {
  const t = summary?.totals;
  const virtual = mode === "virtual";
  return (
    <Card className={`p-4 md:p-6 ${virtual ? "border-violet-500/30 bg-gradient-to-br from-violet-500/10 to-transparent" : ""}`}>
      <div className="flex items-center gap-2 text-sm text-slate-400">
        {virtual ? "Sanal portföy değeri" : "Toplam değer"}
        {t?.anyStale && <StaleBadge title="Bazı fiyatlar güncellenemedi; son bilinen fiyatlar kullanılıyor." />}
      </div>
      <div className="num mt-1 text-3xl font-semibold tracking-tight md:text-4xl">{t ? formatMoney(t.valueTry) : "—"}</div>
      <div className={`num mt-1 text-sm font-medium ${pnlClass(t?.pnlTry)}`}>
        {t ? `${formatSigned(t.pnlTry)} (${formatPercent(t.pnlPct)})` : ""}
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
        </div>
        <div>
          <dt className="text-slate-500">USD/TRY</dt>
          <dd className="font-medium">{summary?.rates.USD ? formatMoney(summary.rates.USD.price, "TRY", 4) : "—"}</dd>
        </div>
      </dl>
      {t?.incomplete && (
        <p className="mt-3 text-xs text-amber-300">Bazı varlıkların fiyatı alınamadığı için toplamlara dahil edilmedi.</p>
      )}
      <p className="mt-3 text-xs text-slate-500">Döviz cinsinden varlıklarda değer güncel kurla, maliyet ve gerçekleşen K/Z işlem günündeki kurla TL’ye çevrilir.</p>
    </Card>
  );
}

function AssetName({ h }: { h: Holding }) {
  return (
    <div className="flex items-center gap-2">
      <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: ASSET_TYPE_INFO[h.assetType].color }} />
      <div className="min-w-0">
        <div className="flex items-center gap-1.5 font-medium">
          {displaySymbol(h.assetType, h.symbol)}
          {h.stale && <StaleBadge fetchedAt={h.fetchedAt} />}
        </div>
        <div className="text-xs text-slate-500">{ASSET_TYPE_INFO[h.assetType].label}</div>
      </div>
    </div>
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

  return (
    <>
      {/* Mobil: kartlar */}
      <div className="space-y-3 md:hidden">
        {summary.holdings.map((h) => (
          <Card key={h.id} className="p-4">
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
                  <Dt label="Güncel fiyat">{formatMoney(h.price, cur(h), 4)}</Dt>
                  <Dt label="Miktar">{formatQuantity(h.quantity)}</Dt>
                </>
              ) : (
                <>
                  <Dt label="Miktar">{formatQuantity(h.quantity)}</Dt>
                  <Dt label="Ort. maliyet">{formatMoney(h.avgCost, cur(h), 4)}</Dt>
                  <Dt label="Güncel fiyat">{formatMoney(h.price, cur(h), 4)}</Dt>
                  <Dt label="Günlük">
                    <span className={pnlClass(h.changePct)}>{formatPercent(h.changePct)}</span>
                  </Dt>
                </>
              )}
            </dl>
            <FxBreakdown h={h} className="mt-2 text-xs" />
            {virtual && (
              <button onClick={() => onConvert(h)} className="mt-3 w-full rounded-xl border border-violet-500/40 py-2 text-sm font-medium text-violet-200 hover:bg-violet-500/10">
                Gerçekten aldım
              </button>
            )}
          </Card>
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
                  <th className="px-3 py-3 text-right font-medium">Yatırılan</th>
                </>
              ) : (
                <>
                  <th className="px-3 py-3 text-right font-medium">Miktar</th>
                  <th className="px-3 py-3 text-right font-medium">Ort. maliyet</th>
                  <th className="px-3 py-3 text-right font-medium">Güncel fiyat</th>
                  <th className="px-3 py-3 text-right font-medium">Günlük</th>
                </>
              )}
              <th className="px-3 py-3 text-right font-medium">Değer (TL)</th>
              <th className="px-3 py-3 text-right font-medium">K/Z (TL)</th>
              <th className="px-3 py-3 text-right font-medium">K/Z %</th>
              {virtual && <th className="px-4 py-3" />}
            </tr>
          </thead>
          <tbody>
            {summary.holdings.map((h) => (
              <tr key={h.id} className="border-b border-line/60 last:border-0 hover:bg-surface-2/50">
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
                    <td className="px-3 py-3 text-right">{formatMoney(h.price, cur(h), 4)}</td>
                    <td className="px-3 py-3 text-right">{formatMoney(h.costTry)}</td>
                  </>
                ) : (
                  <>
                    <td className="px-3 py-3 text-right">{formatQuantity(h.quantity)}</td>
                    <td className="px-3 py-3 text-right">{formatMoney(h.avgCost, cur(h), 4)}</td>
                    <td className="px-3 py-3 text-right">{formatMoney(h.price, cur(h), 4)}</td>
                    <td className={`px-3 py-3 text-right ${pnlClass(h.changePct)}`}>{formatPercent(h.changePct)}</td>
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
                    <button onClick={() => onConvert(h)} className="whitespace-nowrap rounded-lg border border-violet-500/40 px-3 py-1.5 text-xs font-medium text-violet-200 hover:bg-violet-500/10">
                      Gerçekten aldım
                    </button>
                  </td>
                )}
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
