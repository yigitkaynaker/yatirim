"use client";

import { useEffect, useState } from "react";
import {
  ASSET_TYPE_INFO,
  ASSET_TYPES,
  CURRENCIES,
  instrumentId,
  isValidSymbol,
  normalizeSymbol,
  quantityUnit,
  type AssetType,
  type Currency,
} from "@/lib/assets";
import { formatMoney, parseDecimal } from "@/lib/format";
import type { Quote } from "@/lib/prices";
import { Field, inputCls, PrimaryButton, Segmented } from "./ui";
import { SymbolField, symbolOnTypeChange } from "./SymbolField";

type EntryBy = "amount" | "quantity";

/**
 * Sanal pozisyon açma: tutar (örn. 10.000 TL) ya da adet girilir; kayıt anında
 * sunucu güncel canlı fiyatı alır ve adedi hesaplar.
 */
export function VirtualEntryForm({
  onSaved,
  initialAssetType = "bist",
  initialSymbol = "",
}: {
  onSaved: () => void;
  /** Piyasa detayından açılınca varlık önceden seçili gelir */
  initialAssetType?: AssetType;
  initialSymbol?: string;
}) {
  const [assetType, setAssetType] = useState<AssetType>(initialAssetType);
  const [symbol, setSymbol] = useState(initialSymbol);
  const [entryBy, setEntryBy] = useState<EntryBy>("amount");
  const [amount, setAmount] = useState("");
  const [amountCurrency, setAmountCurrency] = useState<Currency>("TRY");
  const [quantity, setQuantity] = useState("");
  const [note, setNote] = useState("");
  const [preview, setPreview] = useState<{ id: string; quote: Quote | null; usdTry: number | null; eurTry: number | null } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const normalized = normalizeSymbol(assetType, symbol);
  const validSymbol = isValidSymbol(assetType, normalized);
  const id = validSymbol ? instrumentId(assetType, normalized) : null;

  // Canlı fiyat önizlemesi (yazmayı bırakınca)
  useEffect(() => {
    if (!id) return;
    const ctrl = new AbortController();
    const load = async () => {
      try {
        const res = await fetch(`/api/prices?ids=${encodeURIComponent(`${id},fx:USD,fx:EUR`)}`, { signal: ctrl.signal });
        if (!res.ok) throw new Error();
        const { quotes } = (await res.json()) as { quotes: Quote[] };
        setPreview({ id, quote: quotes[0], usdTry: quotes[1]?.price ?? null, eurTry: quotes[2]?.price ?? null });
      } catch {
        if (!ctrl.signal.aborted) setPreview({ id, quote: null, usdTry: null, eurTry: null });
      }
    };
    const t = setTimeout(() => void load(), 450);
    return () => {
      clearTimeout(t);
      ctrl.abort();
    };
  }, [id]);

  const q = preview && preview.id === id ? preview.quote : null;
  const rate = (cur: string) => (cur === "TRY" ? 1 : cur === "USD" ? preview?.usdTry : cur === "EUR" ? preview?.eurTry : null);
  let estQty: number | null = null;
  let estAmount: number | null = null;
  if (q?.price) {
    const priceRate = rate(q.currency);
    const amt = parseDecimal(amount);
    const qn = parseDecimal(quantity);
    if (entryBy === "amount" && Number.isFinite(amt) && priceRate) {
      const ar = rate(amountCurrency);
      if (ar) estQty = (amt * ar) / priceRate / q.price;
    } else if (entryBy === "quantity" && Number.isFinite(qn) && priceRate) {
      estAmount = qn * q.price * priceRate;
    }
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/transactions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode: "virtual", entryBy, assetType, symbol: normalized, amount, amountCurrency, quantity, note }),
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
      <p className="rounded-xl bg-violet-500/10 px-3 py-2.5 text-sm text-violet-200">
        Gerçekten almadan önce “alsaydım ne olurdu?” diye deneyin. Giriş fiyatı, kayıt anındaki canlı fiyattır.
      </p>

      <Field label="Varlık türü">
        <select
          className={inputCls}
          value={assetType}
          onChange={(e) => {
            const t = e.target.value as AssetType;
            setAssetType(t);
            setSymbol(symbolOnTypeChange(t, assetType, symbol));
          }}
        >
          {ASSET_TYPES.map((t) => (
            <option key={t} value={t}>
              {ASSET_TYPE_INFO[t].label}
            </option>
          ))}
        </select>
      </Field>

      <SymbolField assetType={assetType} value={symbol} onChange={setSymbol} />

      {id && (
        <p className="num text-sm text-slate-400">
          Güncel fiyat:{" "}
          {!preview || preview.id !== id ? (
            "yükleniyor…"
          ) : q?.price != null ? (
            <span className="font-medium text-slate-100">{formatMoney(q.price, q.currency || "TRY", 4)}</span>
          ) : (
            <span className="text-rose-400">bulunamadı</span>
          )}
        </p>
      )}

      <Field label="Giriş şekli">
        <Segmented<EntryBy>
          value={entryBy}
          onChange={setEntryBy}
          options={[
            { value: "amount", label: "Tutar ile", activeCls: "bg-violet-500/20 text-violet-200" },
            { value: "quantity", label: "Adet ile", activeCls: "bg-violet-500/20 text-violet-200" },
          ]}
        />
      </Field>

      {entryBy === "amount" ? (
        <div className="grid grid-cols-[1fr_auto] gap-3">
          <Field label="Yatırılacak tutar" hint="Örn. 10.000 ya da 2.500,50">
            <input className={inputCls} inputMode="decimal" required placeholder="10.000" value={amount} onChange={(e) => setAmount(e.target.value)} />
          </Field>
          <Field label="Birim">
            <select className={inputCls} value={amountCurrency} onChange={(e) => setAmountCurrency(e.target.value as Currency)}>
              {CURRENCIES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </Field>
        </div>
      ) : (
        <Field label={`Miktar (${quantityUnit(assetType, normalized)})`}>
          <input className={inputCls} inputMode="decimal" required value={quantity} onChange={(e) => setQuantity(e.target.value)} />
        </Field>
      )}

      {estQty != null && <p className="num text-sm text-slate-400">Yaklaşık adet: <span className="text-slate-100">{estQty.toLocaleString("tr-TR", { maximumFractionDigits: 6 })}</span></p>}
      {estAmount != null && <p className="num text-sm text-slate-400">Yaklaşık tutar: <span className="text-slate-100">{formatMoney(estAmount)}</span></p>}

      <Field label="Not (isteğe bağlı)">
        <textarea className={`${inputCls} min-h-16`} maxLength={500} value={note} onChange={(e) => setNote(e.target.value)} />
      </Field>

      {error && (
        <p role="alert" className="text-sm text-rose-400">
          {error}
        </p>
      )}
      <PrimaryButton type="submit" tone="virtual" disabled={saving || !validSymbol} className="w-full">
        {saving ? "Canlı fiyat alınıyor…" : "Sanal pozisyon aç"}
      </PrimaryButton>
    </form>
  );
}
