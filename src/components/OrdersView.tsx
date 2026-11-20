"use client";

import { useEffect, useState } from "react";
import {
  ASSET_TYPE_INFO,
  ASSET_TYPES,
  CURRENCIES,
  GOLD_SYMBOL,
  displaySymbol,
  instrumentId,
  isValidSymbol,
  normalizeSymbol,
  type AssetType,
  type Currency,
  type Mode,
  type Side,
} from "@/lib/assets";
import { formatMoney, formatQuantity } from "@/lib/format";
import type { Order, OrderCondition, OrderStatus } from "@/lib/orders";
import type { Quote } from "@/lib/prices";
import { usePolling } from "@/lib/usePolling";
import { Card, Field, inputCls, Modal, PrimaryButton, Segmented } from "./ui";

const STATUS: Record<OrderStatus, { label: string; cls: string }> = {
  pending: { label: "Bekliyor", cls: "bg-sky-500/15 text-sky-300" },
  executed: { label: "Gerçekleşti", cls: "bg-emerald-500/15 text-emerald-300" },
  cancelled: { label: "İptal", cls: "bg-slate-500/20 text-slate-300" },
  failed: { label: "Başarısız", cls: "bg-rose-500/15 text-rose-300" },
};

/** "2026-11-20 06:15:24" (UTC, SQLite) → yerel saat */
function sqlTime(s: string | null) {
  if (!s) return "";
  return new Date(s.replace(" ", "T") + "Z").toLocaleString("tr-TR", { dateStyle: "short", timeStyle: "short" });
}

export function OrdersView() {
  const { data, reload } = usePolling<{ orders: Order[] }>("/api/orders");
  const [adding, setAdding] = useState(false);
  const orders = data?.orders ?? null;
  const pending = orders?.filter((o) => o.status === "pending") ?? [];
  const history = orders?.filter((o) => o.status !== "pending") ?? [];

  async function cancel(o: Order) {
    if (!confirm(`#${o.id} numaralı emir iptal edilsin mi?`)) return;
    const res = await fetch(`/api/orders/${o.id}`, { method: "DELETE" });
    if (!res.ok) alert(((await res.json().catch(() => ({}))) as { error?: string }).error ?? "İptal edilemedi.");
    void reload();
  }

  return (
    <div className="space-y-4 md:space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Emirler</h1>
          <p className="text-sm text-slate-500">
            Koşul sağlanınca işlem otomatik olarak portföye işlenir. Yalnızca uygulama içidir; gerçek alım satım yapılmaz.
          </p>
        </div>
        <PrimaryButton onClick={() => setAdding(true)}>+ Emir ver</PrimaryButton>
      </div>

      <section className="space-y-2">
        <h2 className="text-sm font-medium text-slate-300">Bekleyen emirler</h2>
        {!orders ? (
          <Card className="p-6 text-center text-sm text-slate-500">Yükleniyor…</Card>
        ) : pending.length === 0 ? (
          <Card className="p-6 text-center text-sm text-slate-400">Bekleyen emir yok.</Card>
        ) : (
          <Card className="divide-y divide-line/70">
            {pending.map((o) => (
              <OrderRow key={o.id} o={o} onCancel={() => cancel(o)} />
            ))}
          </Card>
        )}
      </section>

      {history.length > 0 && (
        <section className="space-y-2">
          <h2 className="text-sm font-medium text-slate-300">Geçmiş</h2>
          <Card className="divide-y divide-line/70">
            {history.map((o) => (
              <OrderRow key={o.id} o={o} />
            ))}
          </Card>
        </section>
      )}

      {adding && (
        <Modal title="Yeni emir" onClose={() => setAdding(false)}>
          <OrderForm
            onSaved={() => {
              setAdding(false);
              void reload();
            }}
          />
        </Modal>
      )}
    </div>
  );
}

function OrderRow({ o, onCancel }: { o: Order; onCancel?: () => void }) {
  const st = STATUS[o.status];
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3">
      <span className={`w-14 shrink-0 rounded-md px-2 py-1 text-center text-xs font-semibold ${o.side === "buy" ? "bg-emerald-500/15 text-emerald-300" : "bg-rose-500/15 text-rose-300"}`}>
        {o.side === "buy" ? "AL" : "SAT"}
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2 font-medium">
          {displaySymbol(o.assetType, o.symbol)}
          <span className={`rounded-md px-1.5 py-0.5 text-[11px] ${st.cls}`}>{st.label}</span>
          <span className={`rounded-md px-1.5 py-0.5 text-[11px] ${o.mode === "virtual" ? "bg-violet-500/15 text-violet-200" : "bg-surface-2 text-slate-300"}`}>
            {o.mode === "virtual" ? "Sanal" : "Gerçek"}
          </span>
          {o.source === "yapay_zeka" && <span className="rounded-md bg-amber-500/15 px-1.5 py-0.5 text-[11px] text-amber-200">Yapay zeka</span>}
        </div>
        <div className="num text-sm text-slate-400">
          Fiyat {o.condition === "lte" ? "≤" : "≥"} {formatMoney(o.triggerPrice, o.triggerCurrency || "TRY", 4)} ·{" "}
          {o.amount != null && o.amountCurrency ? formatMoney(o.amount, o.amountCurrency) : `${formatQuantity(o.quantity ?? 0)} adet`}
        </div>
        <div className="text-xs text-slate-500">
          #{o.id} · {sqlTime(o.createdAt)}
          {o.executedAt && <> · gerçekleşti {sqlTime(o.executedAt)} @ {formatMoney(o.executedPrice, o.triggerCurrency || "TRY", 4)}</>}
          {o.error && <span className="text-rose-300"> · {o.error}</span>}
        </div>
      </div>
      {onCancel && (
        <button onClick={onCancel} className="rounded-lg px-2.5 py-1.5 text-sm text-rose-300 hover:bg-rose-500/10">
          İptal et
        </button>
      )}
    </div>
  );
}

function OrderForm({ onSaved }: { onSaved: () => void }) {
  const [mode, setMode] = useState<Mode>("virtual");
  const [assetType, setAssetType] = useState<AssetType>("bist");
  const [symbol, setSymbol] = useState("");
  const [side, setSide] = useState<Side>("buy");
  const [condition, setCondition] = useState<OrderCondition>("lte");
  const [triggerPrice, setTriggerPrice] = useState("");
  const [entryBy, setEntryBy] = useState<"amount" | "quantity">("amount");
  const [amount, setAmount] = useState("");
  const [amountCurrency, setAmountCurrency] = useState<Currency>("TRY");
  const [quantity, setQuantity] = useState("");
  const [note, setNote] = useState("");
  const [quote, setQuote] = useState<{ id: string; q: Quote | null } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const sym = normalizeSymbol(assetType, assetType === "gold" ? GOLD_SYMBOL : symbol);
  const id = isValidSymbol(assetType, sym) ? instrumentId(assetType, sym) : null;

  useEffect(() => {
    if (!id) return;
    const ctrl = new AbortController();
    const t = setTimeout(() => {
      fetch(`/api/prices?ids=${encodeURIComponent(id)}`, { signal: ctrl.signal })
        .then((r) => (r.ok ? r.json() : Promise.reject()))
        .then((d: { quotes: Quote[] }) => setQuote({ id, q: d.quotes[0] }))
        .catch(() => !ctrl.signal.aborted && setQuote({ id, q: null }));
    }, 450);
    return () => {
      clearTimeout(t);
      ctrl.abort();
    };
  }, [id]);
  const q = quote && quote.id === id ? quote.q : null;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode, assetType, symbol: sym, side, condition, triggerPrice, entryBy, amount, amountCurrency, quantity, note }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) return setError(data.error ?? "Kaydedilemedi.");
      onSaved();
    } catch {
      setError("Sunucuya ulaşılamadı.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <Field label="Portföy">
        <Segmented<Mode>
          value={mode}
          onChange={setMode}
          options={[
            { value: "real", label: "Gerçek", activeCls: "bg-emerald-500/15 text-emerald-300" },
            { value: "virtual", label: "Sanal", activeCls: "bg-violet-500/20 text-violet-200" },
          ]}
        />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Varlık türü">
          <select
            className={inputCls}
            value={assetType}
            onChange={(e) => {
              const t = e.target.value as AssetType;
              setAssetType(t);
              if (t === "gold" || assetType === "gold") setSymbol("");
            }}
          >
            {ASSET_TYPES.map((t) => (
              <option key={t} value={t}>
                {ASSET_TYPE_INFO[t].label}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Sembol">
          <input
            className={`${inputCls} uppercase`}
            value={assetType === "gold" ? "Gram Altın" : symbol}
            disabled={assetType === "gold"}
            required
            placeholder={ASSET_TYPE_INFO[assetType].symbolHint}
            autoCapitalize="characters"
            autoCorrect="off"
            spellCheck={false}
            onChange={(e) => setSymbol(e.target.value)}
          />
        </Field>
      </div>
      {id && (
        <p className="num -mt-2 text-sm text-slate-400">
          Güncel fiyat:{" "}
          {!quote || quote.id !== id ? "yükleniyor…" : q?.price != null ? <span className="text-slate-100">{formatMoney(q.price, q.currency || "TRY", 4)}</span> : <span className="text-rose-400">bulunamadı</span>}
        </p>
      )}
      <Field label="Yön">
        <Segmented<Side>
          value={side}
          onChange={setSide}
          options={[
            { value: "buy", label: "Al", activeCls: "bg-emerald-500/20 text-emerald-300" },
            { value: "sell", label: "Sat", activeCls: "bg-rose-500/20 text-rose-300" },
          ]}
        />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Koşul">
          <select className={inputCls} value={condition} onChange={(e) => setCondition(e.target.value as OrderCondition)}>
            <option value="lte">Fiyat ≤ tetik</option>
            <option value="gte">Fiyat ≥ tetik</option>
          </select>
        </Field>
        <Field label={`Tetik fiyatı${q?.currency ? ` (${q.currency})` : ""}`}>
          <input className={inputCls} inputMode="decimal" required value={triggerPrice} onChange={(e) => setTriggerPrice(e.target.value)} />
        </Field>
      </div>
      <Field label="Büyüklük">
        <Segmented
          value={entryBy}
          onChange={setEntryBy}
          options={[
            { value: "amount", label: "Tutar ile" },
            { value: "quantity", label: "Adet ile" },
          ]}
        />
      </Field>
      {entryBy === "amount" ? (
        <div className="grid grid-cols-[1fr_auto] gap-3">
          <Field label="Tutar" hint="Örn. 10.000 ya da 2.500,50">
            <input className={inputCls} inputMode="decimal" required value={amount} onChange={(e) => setAmount(e.target.value)} />
          </Field>
          <Field label="Birim">
            <select className={inputCls} value={amountCurrency} onChange={(e) => setAmountCurrency(e.target.value as Currency)}>
              {CURRENCIES.map((c) => (
                <option key={c}>{c}</option>
              ))}
            </select>
          </Field>
        </div>
      ) : (
        <Field label="Adet">
          <input className={inputCls} inputMode="decimal" required value={quantity} onChange={(e) => setQuantity(e.target.value)} />
        </Field>
      )}
      <Field label="Not (isteğe bağlı)">
        <input className={inputCls} maxLength={500} value={note} onChange={(e) => setNote(e.target.value)} />
      </Field>
      {error && (
        <p role="alert" className="text-sm text-rose-400">
          {error}
        </p>
      )}
      <PrimaryButton type="submit" tone={mode} disabled={saving || !id} className="w-full">
        {saving ? "Kaydediliyor…" : "Emri kaydet"}
      </PrimaryButton>
    </form>
  );
}
