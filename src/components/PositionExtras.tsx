"use client";

import { useState } from "react";
import type { Mode } from "@/lib/assets";
import { formatMoney, formatPercent, formatQuantity, formatSigned, pnlClass } from "@/lib/format";
import type { Holding } from "@/lib/portfolio";
import type { PositionNote } from "@/lib/notes";
import type { SellEstimate } from "@/lib/positionDetail";
import type { XirrResult } from "@/lib/xirr";
import { goToLogin } from "@/lib/usePolling";
import { FEE_EXPLAIN } from "./AccountControls";
import { toInput } from "./TransactionForm";
import { Card, Explain, Field, inputCls, PrimaryButton } from "./ui";
import { GuideLink, InfoTip, Term } from "./help";

// Pozisyon detayı ekleri: yıllık getiri (XIRR), hesap kırılımı, pozisyon notu, "şimdi satarsam".

export const XIRR_EXPLAIN =
  "Yıllık getiri (XIRR): paranın ne zaman girdiğini hesaba katan yıllık getiri. Örneğin parayı yılın sonuna doğru eklediyseniz, aynı kâr daha kısa sürede kazanıldığı için yıllık getiri daha yüksek çıkar. Banka faiziyle karşılaştırmak için kullanışlıdır.";

export function AnnualReturn({ a, className = "" }: { a: XirrResult | null | undefined; className?: string }) {
  if (!a) return <span className={`text-slate-500 ${className}`}>—</span>;
  // 1 yıldan kısa geçmiş: önce toplam getiri; yıllıklandırılmış değer yalnızca uyarıyla (aşırıysa hiç)
  if (a.short && a.totalPct != null) {
    return (
      <span className={className} title={a.note ?? XIRR_EXPLAIN}>
        <span className={pnlClass(a.totalPct)}>{formatPercent(a.totalPct)}</span>
        <span className="text-xs text-slate-500"> toplam ({a.days} gün)</span>
        <span className="text-xs text-slate-500">
          {" · "}
          {a.pct != null ? (
            <>
              yıllıklandırılmış <span className={pnlClass(a.pct)}>{formatPercent(a.pct)}</span> *
            </>
          ) : (
            (a.note ?? "")
          )}
        </span>
      </span>
    );
  }
  if (a.pct == null) return <span className={`text-xs text-slate-500 ${className}`} title={a.note ?? undefined}>{a.note ?? "—"}</span>;
  return (
    <span className={`${pnlClass(a.pct)} ${className}`} title={a.note ?? XIRR_EXPLAIN}>
      {formatPercent(a.pct)}
      <span className="text-xs text-slate-500"> / yıl{a.note ? " *" : ""}</span>
    </span>
  );
}

/** Birleşik görünümde pozisyonun hesaplara dağılımı */
export function AccountBreakdown({ h, unit, onPick }: { h: Holding; unit: string; onPick: (id: number) => void }) {
  if (h.accounts.length < 2) return null;
  return (
    <Card className="p-4 md:p-6">
      <h2 className="font-semibold">Hesaplara göre</h2>
      <p className="mt-1 text-xs text-slate-500">Bu varlık birden çok hesapta. Her hesabın ortalama maliyeti ayrı hesaplanır; yukarıdaki özet hepsinin toplamıdır.</p>
      <div className="mt-3 overflow-x-auto">
        <table className="num w-full text-sm">
          <thead className="text-left text-xs text-slate-500">
            <tr className="border-b border-line">
              <th className="py-2 pr-3 font-medium">Hesap</th>
              <th className="px-3 py-2 text-right font-medium">Miktar</th>
              <th className="px-3 py-2 text-right font-medium">Ort. maliyet</th>
              <th className="px-3 py-2 text-right font-medium">Değer</th>
              <th className="py-2 pl-3 text-right font-medium">K/Z</th>
            </tr>
          </thead>
          <tbody>
            {h.accounts.map((a) => (
              <tr key={a.accountId} className="cursor-pointer border-b border-line/60 last:border-0 hover:bg-surface-2/50" onClick={() => onPick(a.accountId)}>
                <td className="py-2 pr-3 font-medium text-slate-200 underline-offset-2 hover:underline">{a.name}</td>
                <td className="px-3 py-2 text-right">
                  {formatQuantity(a.quantity)} <span className="text-xs text-slate-500">{unit}</span>
                </td>
                <td className="px-3 py-2 text-right">{formatMoney(a.avgCost, h.currency, 4)}</td>
                <td className="px-3 py-2 text-right">{formatMoney(a.valueTry)}</td>
                <td className={`py-2 pl-3 text-right ${pnlClass(a.pnlTry)}`}>
                  {formatSigned(a.pnlTry)}
                  <span className="block text-[11px]">{formatPercent(a.pnlPct)}</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

/** "Şimdi satarsam": komisyon sonrası tahmini net tutar ve vergi notu */
export function SellEstimateCard({ s, virtual }: { s: SellEstimate; virtual: boolean }) {
  return (
    <Card className="p-4 md:p-6">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="font-semibold">Şimdi satarsam</h2>
        <span className="rounded bg-amber-500/15 px-1.5 py-0.5 text-[11px] font-medium text-amber-200">tahmini, vergi/yatırım tavsiyesi değildir</span>
      </div>
      <dl className="num mt-3 grid grid-cols-2 gap-x-4 gap-y-2.5 text-sm sm:grid-cols-4">
        <div>
          <dt className="text-xs text-slate-500">Güncel değer</dt>
          <dd>{formatMoney(s.grossTry)}</dd>
        </div>
        <div>
          <dt className="text-xs text-slate-500">
            <Term term="komisyon">Komisyon (%{s.feePct.toLocaleString("tr-TR", { maximumFractionDigits: 3 })})</Term>
          </dt>
          <dd className="text-rose-300">−{formatMoney(s.feeTry)}</dd>
        </div>
        <div>
          <dt className="text-xs text-slate-500">Elinize geçecek</dt>
          <dd className="font-semibold">{formatMoney(s.netTry)}</dd>
        </div>
        <div>
          <dt className="text-xs text-slate-500">Gerçekleşecek K/Z</dt>
          <dd className={pnlClass(s.pnlTry)}>{formatSigned(s.pnlTry)}</dd>
        </div>
      </dl>
      <p className="mt-3 text-xs text-slate-400">
        <InfoTip term="stopaj" className="mr-1.5" />
        {s.taxNote}
      </p>
      <p className="mt-1 text-xs text-slate-500">
        {FEE_EXPLAIN} {s.feePct === 0 && !virtual ? "Bu hesap için komisyon oranı girilmemiş; Ayarlar › Hesaplar'dan ekleyebilirsiniz." : ""}
        {virtual ? " Sanal pozisyonda komisyon, varsayılan hesabınızın oranıyla tahmin edilir." : ""}
      </p>
    </Card>
  );
}

async function send(url: string, method: string, body: unknown) {
  const res = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  if (res.status === 401) {
    goToLogin();
    throw new Error("Oturum kapandı.");
  }
  const d = (await res.json().catch(() => ({}))) as { error?: string };
  if (!res.ok) throw new Error(d.error ?? "Kaydedilemedi.");
  return d as Record<string, unknown>;
}

/** Notun satarken hatırlatılan kısa metni */
export function noteReminderText(n: PositionNote | null): React.ReactNode {
  if (!n || (!n.why && !n.exitPlan && n.targetPrice == null && n.stopPrice == null)) return null;
  return (
    <>
      <span className="font-medium text-amber-200">Notunu hatırla:</span>
      {n.why && (
        <span className="block">
          <span className="text-amber-200/80">Neden aldım?</span> {n.why}
        </span>
      )}
      {n.exitPlan && (
        <span className="block">
          <span className="text-amber-200/80">Ne olursa satarım?</span> {n.exitPlan}
        </span>
      )}
      {(n.targetPrice != null || n.stopPrice != null) && (
        <span className="num block text-amber-100/80">
          {n.targetPrice != null && <>Hedef: {n.targetPrice.toLocaleString("tr-TR", { maximumFractionDigits: 6 })} </>}
          {n.stopPrice != null && <>· Stop: {n.stopPrice.toLocaleString("tr-TR", { maximumFractionDigits: 6 })}</>}
        </span>
      )}
      <span className="mt-1 block text-xs text-amber-100/70">Satış planına uyuyor mu? Ani düşüş/yükselişte duyguyla karar vermemek için kontrol et.</span>
    </>
  );
}

/** Pozisyon notu: neden aldım, ne olursa satarım, hedef / stop; tek tıkla alarm */
export function PositionNoteCard({
  mode,
  assetType,
  symbol,
  currency,
  note,
  price,
  alarms,
  onChanged,
}: {
  mode: Mode;
  assetType: string;
  symbol: string;
  currency: string;
  note: PositionNote | null;
  price: number | null;
  alarms: { id: number; direction: string; threshold: number | null }[];
  onChanged: (msg: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [why, setWhy] = useState(note?.why ?? "");
  const [exitPlan, setExitPlan] = useState(note?.exitPlan ?? "");
  const [target, setTarget] = useState(toInput(note?.targetPrice, 6));
  const [stop, setStop] = useState(toInput(note?.stopPrice, 6));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const near = (a: number | null, b: number | null) => a != null && b != null && Math.abs(a - b) <= Math.abs(b) * 1e-6;
  const targetAlarm = note?.targetPrice != null && alarms.some((a) => a.direction === "up" && near(a.threshold, note.targetPrice));
  const stopAlarm = note?.stopPrice != null && alarms.some((a) => a.direction === "down" && near(a.threshold, note.stopPrice));
  const fmt = (v: number) => formatMoney(v, currency, 6);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await send("/api/notes", "PUT", { mode, assetType, symbol, why, exitPlan, targetPrice: target, stopPrice: stop });
      setEditing(false);
      onChanged("Not kaydedildi.");
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function makeAlarms() {
    setBusy(true);
    setError(null);
    try {
      const r = (await send("/api/notes", "POST", { mode, assetType, symbol, which: "both" })) as { created: unknown[]; skipped: string[] };
      onChanged(r.created.length ? `${r.created.length} alarm kuruldu. Fiyat bu seviyelere gelince bildirim alacaksın.` : "Bu seviyeler için alarm zaten kurulu.");
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  if (editing) {
    return (
      <Card className="p-4 md:p-6">
        <h2 className="font-semibold">Pozisyon notu</h2>
        <form onSubmit={save} className="mt-3 space-y-3">
          <Field label="Neden aldım?" hint="Örn. “Temettü veriyor, uzun vade düşünüyorum.”">
            <textarea className={`${inputCls} min-h-16`} maxLength={1000} value={why} onChange={(e) => setWhy(e.target.value)} />
          </Field>
          <Field label="Ne olursa satarım?" hint="Örn. “%20 kârda yarısını satarım; şirket zarar açıklarsa çıkarım.”">
            <textarea className={`${inputCls} min-h-16`} maxLength={1000} value={exitPlan} onChange={(e) => setExitPlan(e.target.value)} />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label={`Hedef fiyat (${currency})`} hint="Bu fiyata gelince satmayı düşünürüm.">
              <input className={inputCls} inputMode="decimal" value={target} onChange={(e) => setTarget(e.target.value)} placeholder={price != null ? toInput(price * 1.2, 2) : ""} />
            </Field>
            <Field label={`Stop fiyatı (${currency})`} hint="Zararı sınırlamak için bu fiyatın altında satarım.">
              <input className={inputCls} inputMode="decimal" value={stop} onChange={(e) => setStop(e.target.value)} placeholder={price != null ? toInput(price * 0.9, 2) : ""} />
            </Field>
          </div>
          {error && <p className="text-sm text-rose-400">{error}</p>}
          <div className="flex gap-2">
            <PrimaryButton type="submit" tone={mode} disabled={busy}>
              {busy ? "Kaydediliyor…" : "Notu kaydet"}
            </PrimaryButton>
            <button type="button" onClick={() => setEditing(false)} className="rounded-xl border border-line px-4 py-2.5 text-sm text-slate-300 hover:bg-surface-2">
              Vazgeç
            </button>
          </div>
          <p className="text-xs text-slate-500">Tüm alanları boşaltıp kaydederseniz not silinir.</p>
        </form>
      </Card>
    );
  }

  return (
    <Card className="p-4 md:p-6">
      <div className="flex items-center justify-between gap-2">
        <h2 className="font-semibold">Pozisyon notu</h2>
        {note && (
          <button onClick={() => setEditing(true)} className="text-xs text-accent">
            Düzenle
          </button>
        )}
      </div>
      {!note ? (
        <div className="mt-2">
          <p className="text-sm text-slate-400">
            Neden aldığını ve hangi durumda satacağını şimdi yaz. Fiyat hızla değiştiğinde bu not, duyguyla değil plana göre karar vermene yardım eder.
          </p>
          <PrimaryButton tone={mode} onClick={() => setEditing(true)} className="mt-3">
            Not yaz
          </PrimaryButton>
          <GuideLink href="/kilavuz#pozisyon-detay" className="mt-2 flex">
            Kılavuz: Not, hedef ve stop
          </GuideLink>
        </div>
      ) : (
        <div className="mt-2 space-y-2 text-sm">
          {note.why && (
            <p>
              <span className="text-slate-500">Neden aldım? </span>
              <span className="text-slate-200">{note.why}</span>
            </p>
          )}
          {note.exitPlan && (
            <p>
              <span className="text-slate-500">Ne olursa satarım? </span>
              <span className="text-slate-200">{note.exitPlan}</span>
            </p>
          )}
          {(note.targetPrice != null || note.stopPrice != null) && (
            <div className="num flex flex-wrap gap-x-4 gap-y-1">
              {note.targetPrice != null && (
                <span>
                  <span className="text-sky-300">— —</span> Hedef: {fmt(note.targetPrice)}
                  {price != null && <span className="text-xs text-slate-500"> ({formatPercent(((note.targetPrice - price) / price) * 100)} uzakta)</span>}
                  {targetAlarm && <span className="ml-1 text-[11px] text-emerald-300">alarm kurulu</span>}
                </span>
              )}
              {note.stopPrice != null && (
                <span>
                  <span className="text-rose-300">— —</span> Stop: {fmt(note.stopPrice)}
                  {price != null && <span className="text-xs text-slate-500"> ({formatPercent(((note.stopPrice - price) / price) * 100)} uzakta)</span>}
                  {stopAlarm && <span className="ml-1 text-[11px] text-emerald-300">alarm kurulu</span>}
                </span>
              )}
            </div>
          )}
          {(note.targetPrice != null && !targetAlarm) || (note.stopPrice != null && !stopAlarm) ? (
            <button disabled={busy} onClick={makeAlarms} className="rounded-lg border border-line px-3 py-1.5 text-xs font-medium text-slate-200 hover:bg-surface-2 disabled:opacity-50">
              {busy ? "Kuruluyor…" : "Hedef/stop için alarm kur"}
            </button>
          ) : null}
          {error && <p className="text-sm text-rose-400">{error}</p>}
        </div>
      )}
      <Explain className="mt-3">
        Hedef ve stop fiyatları grafikte kesikli çizgi olarak görünür. <b>Stop</b>, zararın büyümemesi için önceden belirlediğin satış fiyatıdır. Alarm kurarsan fiyat stopa
        inince bildirimde satış planın hatırlatılır. Uygulama senin yerine satış yapmaz.
      </Explain>
    </Card>
  );
}
