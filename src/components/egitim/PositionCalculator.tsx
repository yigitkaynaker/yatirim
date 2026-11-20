"use client";

import { useState } from "react";
import { Field, inputCls } from "@/components/ui";

/** "1.250,5" (Türkçe) ya da "1250.5" biçimlerini kabul eder. */
const parse = (s: string) => {
  const t = s.trim().replace(/\s/g, "");
  const n = Number(t.includes(",") ? t.replace(/\./g, "").replace(",", ".") : t);
  return Number.isFinite(n) ? n : NaN;
};
const tl = (n: number) => n.toLocaleString("tr-TR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " TL";

/** Risk yönetimi dersi için basit pozisyon büyüklüğü hesaplayıcı */
export function PositionCalculator() {
  const [capital, setCapital] = useState("100000");
  const [riskPct, setRiskPct] = useState("1");
  const [entry, setEntry] = useState("107");
  const [stop, setStop] = useState("101");

  const cap = parse(capital);
  const rp = parse(riskPct);
  const en = parse(entry);
  const st = parse(stop);
  const perShare = en - st;
  const valid = cap > 0 && rp > 0 && en > 0 && st > 0 && perShare > 0;
  const riskAmount = valid ? (cap * rp) / 100 : 0;
  const qty = valid ? Math.floor(riskAmount / perShare) : 0;
  const position = qty * en;
  const share = valid ? (position / cap) * 100 : 0;

  return (
    <div>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Sermaye (TL)">
          <input inputMode="decimal" className={inputCls} value={capital} onChange={(e) => setCapital(e.target.value)} />
        </Field>
        <Field label="İşlem başına risk (%)">
          <input inputMode="decimal" className={inputCls} value={riskPct} onChange={(e) => setRiskPct(e.target.value)} />
        </Field>
        <Field label="Giriş fiyatı">
          <input inputMode="decimal" className={inputCls} value={entry} onChange={(e) => setEntry(e.target.value)} />
        </Field>
        <Field label="Stop fiyatı">
          <input inputMode="decimal" className={inputCls} value={stop} onChange={(e) => setStop(e.target.value)} />
        </Field>
      </div>
      {valid ? (
        <dl className="num mt-4 grid grid-cols-2 gap-x-4 gap-y-2 rounded-xl bg-bg/60 p-3 text-sm">
          <dt className="text-slate-400">Riske atılan tutar</dt>
          <dd className="text-right">{tl(riskAmount)}</dd>
          <dt className="text-slate-400">Hisse başına risk</dt>
          <dd className="text-right">{tl(perShare)}</dd>
          <dt className="font-medium text-slate-200">Alınacak adet</dt>
          <dd className="text-right text-lg font-semibold text-accent">{qty.toLocaleString("tr-TR")}</dd>
          <dt className="text-slate-400">Pozisyon tutarı</dt>
          <dd className="text-right">
            {tl(position)} <span className="text-xs text-slate-500">(sermayenin %{share.toLocaleString("tr-TR", { maximumFractionDigits: 1 })})</span>
          </dd>
        </dl>
      ) : (
        <p className="mt-4 rounded-xl bg-amber-500/10 px-3 py-2 text-sm text-amber-300">
          Tüm alanlara pozitif sayı gir; alış işleminde stop fiyatı giriş fiyatının altında olmalı.
        </p>
      )}
      <p className="mt-2 text-xs text-slate-500">
        Formül: adet = (sermaye × risk oranı) ÷ (giriş − stop). Fiyat stop&apos;a gelirse kaybın yaklaşık riske attığın tutar kadar olur (kayma ve komisyon hariç).
      </p>
    </div>
  );
}
