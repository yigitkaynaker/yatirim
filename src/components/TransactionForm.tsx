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
import type { Account } from "@/lib/accounts";
import { Field, inputCls, PrimaryButton, Segmented } from "./ui";
import { SymbolField, symbolOnTypeChange } from "./SymbolField";
import { AccountSelect, FEE_EXPLAIN } from "./AccountControls";

export interface TransactionFormValues {
  assetType: AssetType;
  symbol: string;
  side: Side;
  quantity: string;
  price: string;
  currency: Currency;
  date: string;
  note: string;
  /** Gerçek işlemde hesap (null: varsayılan hesap) */
  accountId: number | null;
  /** Komisyon: tutar (işlem para biriminde) ya da yüzde; boş: hesabın varsayılan oranı */
  fee: string;
  feeMode: "amount" | "pct";
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
  /** Formun üstünde gösterilecek hatırlatma (örn. satarken pozisyon notu) */
  reminder?: React.ReactNode;
  /** Formun üstünde ek içerik (örn. sanal → gerçek gerçeklik kontrolü) */
  header?: React.ReactNode;
}

export function TransactionForm({ mode, initial, endpoint, method, lockAsset, lockSide, submitLabel, onSaved, reminder, header }: Props) {
  const [v, setV] = useState<TransactionFormValues>({
    assetType: "bist",
    symbol: "",
    side: "buy",
    quantity: "",
    price: "",
    currency: "TRY",
    date: today(),
    note: "",
    accountId: null,
    fee: "",
    feeMode: "pct",
    ...initial,
  });
  // Komisyon alanına dokunulmadıysa hesap değişince hesabın varsayılan oranı yazılır.
  const [feeTouched, setFeeTouched] = useState(initial?.fee != null && initial.fee !== "");
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
  const feeNum = v.fee.trim() ? parseDecimal(v.fee) : 0;
  const feeAmount = !Number.isFinite(feeNum) ? null : v.feeMode === "pct" ? (total != null ? (total * feeNum) / 100 : null) : feeNum;
  const real = mode === "real";

  function onAccount(id: number | null, acc: Account | null) {
    setV((p) => ({
      ...p,
      accountId: id,
      ...(!feeTouched && acc ? { feeMode: "pct" as const, fee: acc.feePct > 0 ? String(acc.feePct).replace(".", ",") : "" } : {}),
    }));
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(endpoint, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          assetType: v.assetType,
          symbol: v.symbol,
          side: v.side,
          quantity: v.quantity,
          price: v.price,
          currency: v.currency,
          date: v.date,
          note: v.note,
          mode,
          ...(real && v.accountId != null ? { accountId: v.accountId } : {}),
          // Boş komisyon = 0 (hesabın oranı alana zaten yazılır)
          ...(v.feeMode === "pct" ? { feePct: v.fee.trim() || "0" } : { fee: v.fee.trim() || "0" }),
        }),
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
      {header}
      {reminder && <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-3 py-2.5 text-sm text-amber-100">{reminder}</div>}
      {real && <AccountSelect value={v.accountId} onChange={onAccount} hint="Bu işlemin yapıldığı aracı kurum / banka / kasa." />}
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

      <div>
        <div className="grid grid-cols-[1fr_auto] items-end gap-2">
          <Field label="Komisyon / ücret (isteğe bağlı)">
            <input
              className={inputCls}
              inputMode="decimal"
              placeholder={v.feeMode === "pct" ? "örn. 0,2" : "örn. 12,50"}
              value={v.fee}
              onChange={(e) => {
                setFeeTouched(true);
                set("fee", e.target.value);
              }}
            />
          </Field>
          <div className="w-28">
            <Segmented<"pct" | "amount">
              value={v.feeMode}
              onChange={(m) => {
                setFeeTouched(true);
                setV((p) => ({ ...p, feeMode: m, fee: "" }));
              }}
              options={[
                { value: "pct", label: "%" },
                { value: "amount", label: v.currency },
              ]}
            />
          </div>
        </div>
        <p className="mt-1 text-xs text-slate-500">{FEE_EXPLAIN}</p>
      </div>

      <Field label="Not (isteğe bağlı)">
        <textarea className={`${inputCls} min-h-20`} maxLength={500} value={v.note} onChange={(e) => set("note", e.target.value)} />
      </Field>

      {total != null && (
        <p className="text-sm text-slate-400">
          Toplam tutar: <span className="num font-medium text-slate-200">{formatMoney(total, v.currency)}</span>
          {feeAmount != null && feeAmount > 0 && (
            <>
              {" "}
              · komisyon <span className="num text-slate-200">{formatMoney(feeAmount, v.currency)}</span> ·{" "}
              {v.side === "buy" ? "ödenecek" : "elinize geçecek"}{" "}
              <span className="num font-medium text-slate-200">{formatMoney(v.side === "buy" ? total + feeAmount : total - feeAmount, v.currency)}</span>
            </>
          )}
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
