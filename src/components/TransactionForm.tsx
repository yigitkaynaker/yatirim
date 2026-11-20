"use client";

import { useState } from "react";
import {
  ASSET_TYPE_INFO,
  ASSET_TYPES,
  CURRENCIES,
  quantityUnit,
  type AssetType,
  type Currency,
  type Mode,
  type Side,
} from "@/lib/assets";
import { formatMoney, parseDecimal } from "@/lib/format";
import { Field, inputCls, PrimaryButton, Segmented } from "./ui";
import { SymbolField, symbolOnTypeChange } from "./SymbolField";

export interface TransactionFormValues {
  assetType: AssetType;
  symbol: string;
  side: Side;
  quantity: string;
  price: string;
  currency: Currency;
  date: string;
  note: string;
}

export function today(): string {
  return new Date().toLocaleDateString("en-CA");
}

/** Sayıyı forma Türkçe ondalık biçimde yazar (binlik ayırıcı olmadan). */
export function toInput(n: number | null | undefined, digits = 8): string {
  if (n == null || !Number.isFinite(n)) return "";
  return String(Number(n.toFixed(digits))).replace(".", ",");
}

interface Props {
  mode: Mode;
  initial?: Partial<TransactionFormValues>;
  endpoint: string;
  method: "POST" | "PUT";
  /** Dönüştürme gibi akışlarda varlık ve yön değiştirilemez */
  lockAsset?: boolean;
  lockSide?: boolean;
  submitLabel?: string;
  onSaved: () => void;
}

export function TransactionForm({ mode, initial, endpoint, method, lockAsset, lockSide, submitLabel, onSaved }: Props) {
  const [v, setV] = useState<TransactionFormValues>({
    assetType: "bist",
    symbol: "",
    side: "buy",
    quantity: "",
    price: "",
    currency: "TRY",
    date: today(),
    note: "",
    ...initial,
  });
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const set = <K extends keyof TransactionFormValues>(k: K, val: TransactionFormValues[K]) => setV((p) => ({ ...p, [k]: val }));

  function changeType(t: AssetType) {
    setV((p) => ({
      ...p,
      assetType: t,
      symbol: symbolOnTypeChange(t, p.assetType, p.symbol),
      currency: ASSET_TYPE_INFO[t].defaultCurrency,
    }));
  }

  const qty = parseDecimal(v.quantity);
  const price = parseDecimal(v.price);
  const total = Number.isFinite(qty) && Number.isFinite(price) ? qty * price : null;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(endpoint, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...v, mode }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        setError(data.error ?? "Kaydedilemedi.");
        return;
      }
      onSaved();
    } catch {
      setError("Sunucuya ulaşılamadı.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <Field label="Varlık türü">
        <select className={inputCls} value={v.assetType} disabled={lockAsset} onChange={(e) => changeType(e.target.value as AssetType)}>
          {ASSET_TYPES.map((t) => (
            <option key={t} value={t}>
              {ASSET_TYPE_INFO[t].label}
            </option>
          ))}
        </select>
      </Field>

      <SymbolField assetType={v.assetType} value={v.symbol} disabled={lockAsset} onChange={(s) => set("symbol", s)} />

      {!lockSide && (
        <Field label="İşlem">
          <Segmented<Side>
            value={v.side}
            onChange={(s) => set("side", s)}
            options={[
              { value: "buy", label: "Alış", activeCls: "bg-emerald-500/20 text-emerald-300" },
              { value: "sell", label: "Satış", activeCls: "bg-rose-500/20 text-rose-300" },
            ]}
          />
        </Field>
      )}

      <div className="grid grid-cols-2 gap-3">
        <Field label={`Miktar (${quantityUnit(v.assetType, v.symbol)})`}>
          <input className={inputCls} inputMode="decimal" required value={v.quantity} onChange={(e) => set("quantity", e.target.value)} />
        </Field>
        <Field label="Birim fiyat">
          <input className={inputCls} inputMode="decimal" required value={v.price} onChange={(e) => set("price", e.target.value)} />
        </Field>
      </div>

      <p className="-mt-2 text-xs text-slate-500">Ondalık için virgül kullanın (örn. 12,5); nokta binlik ayırıcıdır.</p>

      <div className="grid grid-cols-2 gap-3">
        <Field label="Para birimi">
          <select className={inputCls} value={v.currency} onChange={(e) => set("currency", e.target.value as Currency)}>
            {CURRENCIES.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Tarih">
          <input type="date" className={inputCls} required value={v.date} max={today()} onChange={(e) => set("date", e.target.value)} />
        </Field>
      </div>

      <Field label="Not (isteğe bağlı)">
        <textarea className={`${inputCls} min-h-20`} maxLength={500} value={v.note} onChange={(e) => set("note", e.target.value)} />
      </Field>

      {total != null && (
        <p className="text-sm text-slate-400">
          Toplam tutar: <span className="num font-medium text-slate-200">{formatMoney(total, v.currency)}</span>
        </p>
      )}
      {error && (
        <p role="alert" className="text-sm text-rose-400">
          {error}
        </p>
      )}
      <PrimaryButton type="submit" tone={mode} disabled={saving} className="w-full">
        {saving ? "Kaydediliyor…" : (submitLabel ?? "Kaydet")}
      </PrimaryButton>
    </form>
  );
}
