"use client";

import { useState } from "react";
import { formatMoney, formatNumber, formatPercent, formatTime, parseDecimal, pnlClass } from "@/lib/format";
import type { Quote } from "@/lib/prices";
import { usePolling } from "@/lib/usePolling";
import { Card, Field, inputCls, StaleBadge } from "./ui";

// Hesaplayıcılar: tamamen tarayıcıda çalışır (döviz/altın çevirici hariç; o canlı kurları kullanır).
// Sayı girişleri Türkçe biçimdedir: "100.000", "12,5".

type CalcId = "mevduat" | "bilesik" | "maliyet" | "reel" | "cevirici";

const CALCS: { id: CalcId; label: string }[] = [
  { id: "mevduat", label: "Mevduat getirisi" },
  { id: "bilesik", label: "Birikim planı" },
  { id: "maliyet", label: "Ortalama maliyet" },
  { id: "reel", label: "Reel getiri" },
  { id: "cevirici", label: "Döviz / altın" },
];

export function CalculatorsView() {
  const [calc, setCalc] = useState<CalcId>("mevduat");
  return (
    <div className="space-y-4 md:space-y-6">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">Hesaplayıcılar</h1>
        <p className="text-sm text-slate-500">Basit yatırım hesapları. Ondalık için virgül, binlik için nokta kullanın (örn. 100.000 ya da 12,5).</p>
      </div>
      <div role="tablist" className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 [scrollbar-width:none] md:mx-0 md:flex-wrap md:px-0">
        {CALCS.map((c) => (
          <button
            key={c.id}
            role="tab"
            aria-selected={c.id === calc}
            onClick={() => setCalc(c.id)}
            className={`shrink-0 rounded-xl border px-3.5 py-2 text-sm font-medium transition ${
              c.id === calc ? "border-accent/50 bg-emerald-500/10 text-emerald-300" : "border-line bg-surface text-slate-400 hover:text-white"
            }`}
          >
            {c.label}
          </button>
        ))}
      </div>
      {calc === "mevduat" && <DepositCalc />}
      {calc === "bilesik" && <CompoundCalc />}
      {calc === "maliyet" && <AverageCostCalc />}
      {calc === "reel" && <RealReturnCalc />}
      {calc === "cevirici" && <ConverterCalc />}
    </div>
  );
}

// ---- Ortak parçalar -----------------------------------------------------------

function num(s: string): number | null {
  const n = parseDecimal(s);
  return Number.isFinite(n) ? n : null;
}

function NumField({ label, hint, value, onChange, suffix }: { label: string; hint?: string; value: string; onChange: (v: string) => void; suffix?: string }) {
  const bad = value.trim() !== "" && num(value) == null;
  return (
    <Field label={label} hint={hint}>
      <div className="relative">
        <input
          className={`${inputCls} ${suffix ? "pr-12" : ""} ${bad ? "border-rose-500/70" : ""}`}
          inputMode="decimal"
          value={value}
          onChange={(e) => onChange(e.target.value)}
        />
        {suffix && <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-sm text-slate-500">{suffix}</span>}
      </div>
    </Field>
  );
}

function Explain({ children }: { children: React.ReactNode }) {
  return <div className="space-y-1.5 rounded-xl bg-sky-500/10 px-3.5 py-3 text-sm text-sky-100/90">{children}</div>;
}

function Result({ label, value, strong, cls = "" }: { label: string; value: string; strong?: boolean; cls?: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3 py-1.5">
      <dt className="text-sm text-slate-400">{label}</dt>
      <dd className={`num text-right ${strong ? "text-xl font-semibold" : "font-medium"} ${cls}`}>{value}</dd>
    </div>
  );
}

function Layout({ form, result, explain }: { form: React.ReactNode; result: React.ReactNode; explain: React.ReactNode }) {
  return (
    <div className="grid gap-4 md:grid-cols-2 md:gap-6">
      <Card className="space-y-4 p-4 md:p-6">
        {explain}
        {form}
      </Card>
      <Card className="p-4 md:p-6">
        <h2 className="mb-2 text-sm font-medium text-slate-300">Sonuç</h2>
        {result}
      </Card>
    </div>
  );
}

const Missing = () => <p className="text-sm text-slate-500">Sonucu görmek için alanları doldurun.</p>;

// ---- 1) Mevduat / faiz getirisi -------------------------------------------------

/** Brüt faiz = anapara × yıllık oran × gün / 365; stopaj brüt faizden kesilir. */
export function depositReturn(principal: number, annualRatePct: number, days: number, withholdingPct: number) {
  const gross = (principal * (annualRatePct / 100) * days) / 365;
  const tax = gross * (withholdingPct / 100);
  const net = gross - tax;
  return { gross, tax, net, total: principal + net, netAnnualPct: principal > 0 && days > 0 ? (net / principal) * (365 / days) * 100 : null };
}

function DepositCalc() {
  const [p, setP] = useState("100.000");
  const [r, setR] = useState("45");
  const [d, setD] = useState("32");
  const [s, setS] = useState("15");
  const P = num(p);
  const R = num(r);
  const D = num(d);
  const S = num(s);
  const ok = P != null && R != null && D != null && S != null && P > 0 && D > 0 && S >= 0 && S <= 100;
  const res = ok ? depositReturn(P, R, D, S) : null;

  return (
    <Layout
      explain={
        <Explain>
          <p>
            <b>Vadeli mevduat</b>, paranızı bankaya belirli bir süre (vade) bırakıp faiz almanızdır. Bankanın söylediği oran
            <b> yıllıktır</b>; 32 günlük bir vadede faizin yalnızca 32/365’ini alırsınız.
          </p>
          <p>
            <b>Stopaj</b>, faiz kazancınızdan devletin kestiği vergidir. Banka bunu otomatik keser; elinize geçen tutar
            <b> net getiridir</b>. Güncel stopaj oranını bankanızdan teyit edin.
          </p>
        </Explain>
      }
      form={
        <div className="grid grid-cols-2 gap-3">
          <div className="col-span-2">
            <NumField label="Anapara" value={p} onChange={setP} suffix="TL" hint="Yatıracağınız tutar" />
          </div>
          <NumField label="Yıllık faiz oranı" value={r} onChange={setR} suffix="%" />
          <NumField label="Vade" value={d} onChange={setD} suffix="gün" />
          <NumField label="Stopaj oranı" value={s} onChange={setS} suffix="%" hint="Varsayılan %15" />
        </div>
      }
      result={
        res && P != null && D != null ? (
          <>
            <dl className="divide-y divide-line/60">
              <Result label="Net getiri (elinize geçen faiz)" value={formatMoney(res.net)} strong cls="text-emerald-400" />
              <Result label="Vade sonunda toplam" value={formatMoney(res.total)} />
              <Result label="Brüt faiz (vergi öncesi)" value={formatMoney(res.gross)} />
              <Result label="Stopaj kesintisi" value={`−${formatMoney(res.tax)}`} cls="text-rose-300" />
              <Result label="Net yıllık getiri oranı" value={res.netAnnualPct != null ? `%${formatNumber(res.netAnnualPct)}` : "—"} />
            </dl>
            <p className="mt-3 text-xs text-slate-500">
              Hesap: {formatMoney(P)} × %{r} × {formatNumber(D, 0)} / 365 = {formatMoney(res.gross)} brüt; %{s} stopaj düşülünce {formatMoney(res.net)} net.
            </p>
          </>
        ) : (
          <Missing />
        )
      }
    />
  );
}

// ---- 2) Bileşik getiri / birikim planı -------------------------------------------

export interface CompoundRow {
  year: number;
  contributed: number;
  value: number;
  gain: number;
}

/**
 * Aylık bileşik hesap. Yıllık getiri efektif kabul edilir: aylık oran = (1 + yıllık)^(1/12) − 1.
 * Aylık katkı her ayın sonunda eklenir.
 */
export function compoundPlan(initial: number, monthly: number, annualPct: number, years: number): CompoundRow[] {
  const m = Math.pow(1 + annualPct / 100, 1 / 12) - 1;
  let value = initial;
  let contributed = initial;
  const rows: CompoundRow[] = [];
  for (let y = 1; y <= years; y++) {
    for (let i = 0; i < 12; i++) {
      value = value * (1 + m) + monthly;
      contributed += monthly;
    }
    rows.push({ year: y, contributed, value, gain: value - contributed });
  }
  return rows;
}

function CompoundCalc() {
  const [a, setA] = useState("50.000");
  const [m, setM] = useState("5.000");
  const [r, setR] = useState("30");
  const [y, setY] = useState("10");
  const A = num(a);
  const M = num(m);
  const R = num(r);
  const Y = num(y);
  const ok = A != null && M != null && R != null && Y != null && A >= 0 && M >= 0 && R > -100 && Y >= 1 && Y <= 50 && Number.isInteger(Y);
  const rows = ok ? compoundPlan(A, M, R, Y) : null;
  const lastRow = rows?.[rows.length - 1];

  return (
    <div className="space-y-4 md:space-y-6">
      <Layout
        explain={
          <Explain>
            <p>
              <b>Bileşik getiri</b>, kazancın da kazanç getirmesidir: ilk yıl kazandığınız para ikinci yıl anaparaya eklenir
              ve o da getiri üretir. Süre uzadıkça etkisi büyür.
            </p>
            <p>
              Her ay düzenli bir tutar eklediğinizi varsayar. Getiri oranı yıllıktır ve her yıl aynı kabul edilir; gerçek
              piyasada getiriler yıldan yıla değişir, bu yüzden sonuç bir tahmindir.
            </p>
          </Explain>
        }
        form={
          <div className="grid grid-cols-2 gap-3">
            <NumField label="Başlangıç tutarı" value={a} onChange={setA} suffix="TL" />
            <NumField label="Aylık ekleme" value={m} onChange={setM} suffix="TL" />
            <NumField label="Yıllık getiri" value={r} onChange={setR} suffix="%" />
            <NumField label="Süre" value={y} onChange={setY} suffix="yıl" hint="1–50 arası tam sayı" />
          </div>
        }
        result={
          lastRow ? (
            <>
              <dl className="divide-y divide-line/60">
                <Result label={`${lastRow.year}. yıl sonunda toplam`} value={formatMoney(lastRow.value)} strong cls="text-emerald-400" />
                <Result label="Cebinizden çıkan toplam" value={formatMoney(lastRow.contributed)} />
                <Result label="Getiri (kazanç)" value={formatMoney(lastRow.gain)} cls={pnlClass(lastRow.gain)} />
                <Result label="Paranız kaç katına çıktı" value={lastRow.contributed > 0 ? `${formatNumber(lastRow.value / lastRow.contributed)} kat` : "—"} />
              </dl>
              <p className="mt-3 text-xs text-slate-500">Aylık oran = (1 + yıllık oran)^(1/12) − 1; ekleme her ayın sonunda yapılır.</p>
            </>
          ) : (
            <Missing />
          )
        }
      />
      {rows && (
        <Card className="p-4 md:p-6">
          <h2 className="mb-3 text-sm font-medium text-slate-300">Yıllara göre birikim</h2>
          <GrowthBars rows={rows} />
          <div className="mt-4 overflow-x-auto">
            <table className="num w-full text-sm">
              <thead className="text-left text-xs text-slate-500">
                <tr className="border-b border-line">
                  <th className="py-2 pr-3 font-medium">Yıl</th>
                  <th className="px-3 py-2 text-right font-medium">Yatırılan</th>
                  <th className="px-3 py-2 text-right font-medium">Kazanç</th>
                  <th className="py-2 pl-3 text-right font-medium">Toplam</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.year} className="border-b border-line/50 last:border-0">
                    <td className="py-2 pr-3">{row.year}</td>
                    <td className="px-3 py-2 text-right text-slate-300">{formatMoney(row.contributed, "TRY", 0)}</td>
                    <td className={`px-3 py-2 text-right ${pnlClass(row.gain)}`}>{formatMoney(row.gain, "TRY", 0)}</td>
                    <td className="py-2 pl-3 text-right font-medium">{formatMoney(row.value, "TRY", 0)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  );
}

const C_CONTRIB = "#38bdf8";
const C_GAIN = "#34d399";

/** Yıllık yığılmış sütun grafiği: yatırılan + kazanç. */
function GrowthBars({ rows }: { rows: CompoundRow[] }) {
  const [hover, setHover] = useState<number | null>(null);
  const max = Math.max(...rows.map((r) => Math.max(r.value, r.contributed)), 1);
  const W = 600;
  const H = 200;
  const gap = rows.length > 25 ? 2 : 4;
  const bw = (W - gap * (rows.length - 1)) / rows.length;
  const h = (v: number) => (Math.max(v, 0) / max) * H;
  const active = hover != null ? rows[hover] : rows[rows.length - 1];

  return (
    <div>
      <div className="mb-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-400">
        <span className="flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-sm" style={{ background: C_CONTRIB }} /> Yatırılan
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-sm" style={{ background: C_GAIN }} /> Kazanç
        </span>
        <span className="num ml-auto text-slate-300">
          {active.year}. yıl: {formatMoney(active.value, "TRY", 0)}
        </span>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} className="h-44 w-full md:h-56" preserveAspectRatio="none" role="img" aria-label="Yıllara göre birikim grafiği" onMouseLeave={() => setHover(null)}>
        {rows.map((r, i) => {
          const x = i * (bw + gap);
          const hc = h(Math.min(r.contributed, r.value));
          const hg = h(r.gain);
          const dim = hover != null && hover !== i;
          return (
            <g key={r.year} opacity={dim ? 0.45 : 1} onMouseEnter={() => setHover(i)} onTouchStart={() => setHover(i)}>
              <rect x={x} y={0} width={bw} height={H} fill="transparent" />
              <rect x={x} y={H - hc} width={bw} height={hc} fill={C_CONTRIB} rx={Math.min(2, bw / 4)} />
              {hg > 2 && <rect x={x} y={H - hc - hg} width={bw} height={Math.max(hg - 2, 0)} fill={C_GAIN} rx={Math.min(2, bw / 4)} />}
              <title>{`${r.year}. yıl — yatırılan ${formatMoney(r.contributed, "TRY", 0)}, kazanç ${formatMoney(r.gain, "TRY", 0)}, toplam ${formatMoney(r.value, "TRY", 0)}`}</title>
            </g>
          );
        })}
      </svg>
      <div className="mt-1 flex justify-between text-xs text-slate-500">
        <span>1. yıl</span>
        <span>{rows.length}. yıl</span>
      </div>
    </div>
  );
}

// ---- 3) Kâr/zarar & ortalama maliyet ---------------------------------------------

interface BuyRow {
  key: number;
  qty: string;
  price: string;
}

function AverageCostCalc() {
  const [rows, setRows] = useState<BuyRow[]>([
    { key: 1, qty: "100", price: "250" },
    { key: 2, qty: "50", price: "280" },
  ]);
  const [fee, setFee] = useState("0,2");
  const [current, setCurrent] = useState("275");

  const parsed = rows.map((r) => ({ q: num(r.qty), p: num(r.price) })).filter((r): r is { q: number; p: number } => r.q != null && r.p != null && r.q > 0 && r.p >= 0);
  const F = num(fee) ?? 0;
  const cur = num(current);
  const totalQty = parsed.reduce((s, r) => s + r.q, 0);
  const grossCost = parsed.reduce((s, r) => s + r.q * r.p, 0);
  const buyFees = grossCost * (F / 100);
  const totalCost = grossCost + buyFees;
  const avg = totalQty > 0 ? totalCost / totalQty : null;
  // Satışta da aynı komisyon ödenir: satış fiyatı × (1 − k) = ortalama maliyet
  const breakEven = avg != null && F < 100 ? avg / (1 - F / 100) : null;
  const proceeds = cur != null ? cur * totalQty * (1 - F / 100) : null;
  const pnl = proceeds != null && avg != null ? proceeds - totalCost : null;

  const update = (key: number, patch: Partial<BuyRow>) => setRows((rs) => rs.map((r) => (r.key === key ? { ...r, ...patch } : r)));

  return (
    <Layout
      explain={
        <Explain>
          <p>
            Aynı hisseyi farklı fiyatlardan birkaç kez aldıysanız, <b>ortalama maliyet</b> bir adedin size ortalama kaça
            geldiğidir: toplam ödediğiniz para ÷ toplam adet.
          </p>
          <p>
            <b>Başabaş fiyatı</b>, komisyonlar dahil hiç kâr ya da zarar etmeden satabileceğiniz fiyattır. Bunun üstünde
            satarsanız kârdasınız.
          </p>
        </Explain>
      }
      form={
        <div className="space-y-3">
          <div className="space-y-2">
            <div className="grid grid-cols-[1fr_1fr_auto] gap-2 text-sm text-slate-300">
              <span>Adet</span>
              <span>Alış fiyatı</span>
              <span className="w-9" />
            </div>
            {rows.map((r, i) => (
              <div key={r.key} className="grid grid-cols-[1fr_1fr_auto] gap-2">
                <input className={inputCls} inputMode="decimal" aria-label={`${i + 1}. alış adedi`} value={r.qty} onChange={(e) => update(r.key, { qty: e.target.value })} />
                <input className={inputCls} inputMode="decimal" aria-label={`${i + 1}. alış fiyatı`} value={r.price} onChange={(e) => update(r.key, { price: e.target.value })} />
                <button
                  type="button"
                  aria-label={`${i + 1}. alışı sil`}
                  disabled={rows.length <= 1}
                  onClick={() => setRows((rs) => rs.filter((x) => x.key !== r.key))}
                  className="w-9 rounded-lg text-slate-500 hover:bg-rose-500/10 hover:text-rose-300 disabled:opacity-30"
                >
                  ✕
                </button>
              </div>
            ))}
            <button
              type="button"
              onClick={() => setRows((rs) => [...rs, { key: Math.max(0, ...rs.map((x) => x.key)) + 1, qty: "", price: "" }])}
              className="w-full rounded-xl border border-dashed border-line py-2 text-sm text-slate-300 hover:bg-surface-2"
            >
              + Alış ekle
            </button>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <NumField label="Komisyon (alış ve satış)" value={fee} onChange={setFee} suffix="%" hint="Bilmiyorsanız 0 bırakın" />
            <NumField label="Güncel fiyat" value={current} onChange={setCurrent} hint="K/Z için (isteğe bağlı)" />
          </div>
        </div>
      }
      result={
        avg != null ? (
          <dl className="divide-y divide-line/60">
            <Result label="Ortalama maliyet (adet başı)" value={formatNumber(avg, 4)} strong />
            <Result label="Başabaş satış fiyatı" value={breakEven != null ? formatNumber(breakEven, 4) : "—"} />
            <Result label="Toplam adet" value={formatNumber(totalQty, 8)} />
            <Result label="Toplam maliyet (komisyon dahil)" value={formatNumber(totalCost, 2)} />
            {pnl != null && (
              <>
                <Result label="Şimdi satarsanız eline geçen" value={formatNumber(proceeds, 2)} />
                <Result label="Kâr / zarar" value={`${pnl > 0 ? "+" : ""}${formatNumber(pnl, 2)} (${formatPercent(totalCost > 0 ? (pnl / totalCost) * 100 : null)})`} cls={pnlClass(pnl)} strong />
              </>
            )}
          </dl>
        ) : (
          <Missing />
        )
      }
    />
  );
}

// ---- 4) Enflasyona göre reel getiri ------------------------------------------------

/** Reel getiri = (1 + nominal) / (1 + enflasyon) − 1 */
export function realReturn(nominalPct: number, inflationPct: number) {
  return ((1 + nominalPct / 100) / (1 + inflationPct / 100) - 1) * 100;
}

function RealReturnCalc() {
  const [n, setN] = useState("45");
  const [i, setI] = useState("35");
  const [amt, setAmt] = useState("100.000");
  const N = num(n);
  const I = num(i);
  const A = num(amt);
  const ok = N != null && I != null && I > -100 && N > -100;
  const real = ok ? realReturn(N, I) : null;

  return (
    <Layout
      explain={
        <Explain>
          <p>
            <b>Nominal getiri</b>, paranızın TL olarak ne kadar arttığıdır. Ama fiyatlar da arttığı için aynı parayla
            alabildikleriniz azalır. <b>Reel getiri</b>, enflasyondan arındırılmış, yani alım gücünüzdeki gerçek artıştır.
          </p>
          <p>
            Basitçe “getiri − enflasyon” yaklaşık sonuç verir; doğrusu: (1 + getiri) ÷ (1 + enflasyon) − 1. Reel getiri
            eksiyse paranız TL olarak artsa bile aslında değer kaybetmiştir.
          </p>
        </Explain>
      }
      form={
        <div className="grid grid-cols-2 gap-3">
          <NumField label="Nominal getiri (yıllık)" value={n} onChange={setN} suffix="%" />
          <NumField label="Enflasyon (yıllık)" value={i} onChange={setI} suffix="%" />
          <div className="col-span-2">
            <NumField label="Örnek tutar" value={amt} onChange={setAmt} suffix="TL" hint="İsteğe bağlı" />
          </div>
        </div>
      }
      result={
        real != null && N != null && I != null ? (
          <>
            <dl className="divide-y divide-line/60">
              <Result label="Reel getiri" value={formatPercent(real)} strong cls={pnlClass(real)} />
              <Result label="Kaba tahmin (getiri − enflasyon)" value={formatPercent(N - I)} />
              {A != null && A > 0 && (
                <>
                  <Result label="Bir yıl sonra TL olarak" value={formatMoney(A * (1 + N / 100))} />
                  <Result label="Bugünün parasıyla değeri" value={formatMoney((A * (1 + N / 100)) / (1 + I / 100))} cls={pnlClass(real)} />
                </>
              )}
            </dl>
            <p className="mt-3 text-sm text-slate-400">
              {real >= 0
                ? `Alım gücünüz yaklaşık ${formatPercent(real).replace("+", "")} arttı.`
                : `Alım gücünüz yaklaşık ${formatPercent(-real).replace("+", "")} azaldı.`}
            </p>
          </>
        ) : (
          <Missing />
        )
      }
    />
  );
}

// ---- 5) Döviz / altın çevirici ---------------------------------------------------

type Unit = "TRY" | "USD" | "EUR" | "GBP" | "GRAM" | "ONS";
const UNITS: { value: Unit; label: string }[] = [
  { value: "TRY", label: "Türk Lirası (TL)" },
  { value: "USD", label: "Amerikan Doları (USD)" },
  { value: "EUR", label: "Euro (EUR)" },
  { value: "GBP", label: "İngiliz Sterlini (GBP)" },
  { value: "GRAM", label: "Gram altın" },
  { value: "ONS", label: "Ons altın" },
];

function ConverterCalc() {
  const { data, lastSuccess } = usePolling<{ quotes: Quote[] }>(`/api/prices?ids=${encodeURIComponent("fx:USD,fx:EUR,fx:GBP,gold:GRAM,foreign:GC=F")}`);
  const [amount, setAmount] = useState("1.000");
  const [from, setFrom] = useState<Unit>("USD");
  const [to, setTo] = useState<Unit>("TRY");
  const q = new Map((data?.quotes ?? []).map((x) => [x.id, x]));
  const usd = q.get("fx:USD")?.price ?? null;
  // 1 birimin TL karşılığı
  const tl: Record<Unit, number | null> = {
    TRY: 1,
    USD: usd,
    EUR: q.get("fx:EUR")?.price ?? null,
    GBP: q.get("fx:GBP")?.price ?? null,
    GRAM: q.get("gold:GRAM")?.price ?? null,
    ONS: q.get("foreign:GC=F")?.price != null && usd != null ? q.get("foreign:GC=F")!.price! * usd : null,
  };
  const A = num(amount);
  const rf = tl[from];
  const rt = tl[to];
  const result = A != null && rf != null && rt ? (A * rf) / rt : null;
  const anyStale = (data?.quotes ?? []).some((x) => x.stale);
  const unitLabel = (u: Unit) => (u === "GRAM" ? "gram altın" : u === "ONS" ? "ons altın" : u === "TRY" ? "TL" : u);

  return (
    <Layout
      explain={
        <Explain>
          <p>
            Canlı kurlarla döviz ve altın çevirir. Gram altın, ons altının dolar fiyatından hesaplanır (1 ons = 31,1035
            gram). Kuyumcu ve banka fiyatları alış/satış farkı nedeniyle biraz farklı olabilir.
          </p>
        </Explain>
      }
      form={
        <div className="space-y-3">
          <NumField label="Tutar" value={amount} onChange={setAmount} />
          <div className="grid grid-cols-[1fr_auto_1fr] items-end gap-2">
            <Field label="Şundan">
              <select className={inputCls} value={from} onChange={(e) => setFrom(e.target.value as Unit)}>
                {UNITS.map((u) => (
                  <option key={u.value} value={u.value}>
                    {u.label}
                  </option>
                ))}
              </select>
            </Field>
            <button
              type="button"
              aria-label="Birimleri değiştir"
              onClick={() => {
                setFrom(to);
                setTo(from);
              }}
              className="mb-0.5 rounded-xl border border-line px-3 py-2.5 text-slate-300 hover:bg-surface-2"
            >
              ⇄
            </button>
            <Field label="Şuna">
              <select className={inputCls} value={to} onChange={(e) => setTo(e.target.value as Unit)}>
                {UNITS.map((u) => (
                  <option key={u.value} value={u.value}>
                    {u.label}
                  </option>
                ))}
              </select>
            </Field>
          </div>
        </div>
      }
      result={
        <>
          <div className="num py-2 text-2xl font-semibold">
            {result != null ? `${formatNumber(result, result < 10 ? 4 : 2)} ${unitLabel(to)}` : data ? "—" : "Kurlar yükleniyor…"}
          </div>
          <dl className="divide-y divide-line/60 border-t border-line/60">
            {UNITS.filter((u) => u.value !== "TRY").map((u) => (
              <Result key={u.value} label={`1 ${unitLabel(u.value)}`} value={formatMoney(tl[u.value], "TRY", 4)} />
            ))}
          </dl>
          <p className="mt-3 flex items-center gap-2 text-xs text-slate-500">
            {lastSuccess ? `Kurlar ${formatTime(lastSuccess)} itibarıyla` : ""}
            {anyStale && <StaleBadge title="Bazı kurlar güncellenemedi; son bilinen değerler kullanılıyor." />}
          </p>
        </>
      }
    />
  );
}
