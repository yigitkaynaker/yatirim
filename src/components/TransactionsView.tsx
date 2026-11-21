"use client";

import { useCallback, useEffect, useState } from "react";
import { ASSET_TYPE_INFO, displaySymbol, type Mode } from "@/lib/assets";
import { formatDate, formatMoney, formatQuantity } from "@/lib/format";
import type { Transaction } from "@/lib/portfolio";
import { TransactionForm, toInput } from "./TransactionForm";
import { Card, Modal, ModeTabs, PrimaryButton } from "./ui";
import { VirtualEntryForm } from "./VirtualEntryForm";
import { fetchJson, goToLogin, UnauthorizedError } from "@/lib/usePolling";
import { AccountChips, useAccounts } from "./AccountControls";

export function TransactionsView() {
  const [mode, setMode] = useState<Mode>("real");
  const [items, setItems] = useState<Transaction[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<Transaction | null>(null);
  const [adding, setAdding] = useState(false);
  const [account, setAccount] = useState<number | null>(null);
  const { accounts } = useAccounts();
  const accName = (id: number | null) => (id != null ? (accounts?.find((a) => a.id === id)?.name ?? null) : null);

  const [version, setVersion] = useState(0);
  const load = useCallback(() => setVersion((v) => v + 1), []);

  useEffect(() => {
    let cancelled = false;
    fetchJson<{ transactions: Transaction[] }>(`/api/transactions?mode=${mode}`)
      .then((d) => {
        if (cancelled) return;
        setItems(d.transactions);
        setError(null);
      })
      .catch((err: unknown) => {
        if (err instanceof UnauthorizedError) return goToLogin();
        if (!cancelled) setError("İşlemler yüklenemedi.");
      });
    return () => {
      cancelled = true;
    };
  }, [mode, version]);

  async function remove(t: Transaction) {
    if (!confirm(`${displaySymbol(t.assetType, t.symbol)} ${t.side === "buy" ? "alış" : "satış"} işlemi silinsin mi?`)) return;
    const res = await fetch(`/api/transactions/${t.id}`, { method: "DELETE" });
    if (!res.ok) {
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      alert(data.error ?? "Silinemedi.");
      return;
    }
    void load();
  }

  const virtual = mode === "virtual";
  const visible = items?.filter((t) => t.mode === mode && (mode === "virtual" || account == null || t.accountId === account)) ?? null;

  return (
    <div className="space-y-4 md:space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">İşlemler</h1>
          <p className="text-sm text-slate-500">Alış ve satışlarınızı ekleyin, düzenleyin ya da silin.</p>
        </div>
        <PrimaryButton tone={mode} onClick={() => setAdding(true)}>
          {virtual ? "+ Sanal pozisyon" : "+ İşlem ekle"}
        </PrimaryButton>
      </div>

      <ModeTabs mode={mode} onChange={(m) => { setItems(null); setMode(m); }} />

      {!virtual && accounts && (
        <AccountChips items={accounts.filter((a) => !a.archived || items?.some((t) => t.accountId === a.id)).map((a) => ({ id: a.id, name: a.name }))} value={account} onChange={setAccount} />
      )}

      {error && <p className="rounded-xl bg-rose-500/10 px-3 py-2 text-sm text-rose-300">{error}</p>}

      {!visible ? (
        <Card className="p-6 text-center text-sm text-slate-500">Yükleniyor…</Card>
      ) : visible.length === 0 ? (
        <Card className="p-8 text-center text-sm text-slate-400">Henüz işlem yok.</Card>
      ) : (
        <Card className="divide-y divide-line/70">
          {visible.map((t) => (
            <div key={t.id} className={`flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3 ${t.convertedAt ? "opacity-60" : ""}`}>
              <span
                className={`w-14 shrink-0 rounded-md px-2 py-1 text-center text-xs font-semibold ${
                  t.side === "buy" ? "bg-emerald-500/15 text-emerald-300" : "bg-rose-500/15 text-rose-300"
                }`}
              >
                {t.side === "buy" ? "ALIŞ" : "SATIŞ"}
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2 font-medium">
                  {displaySymbol(t.assetType, t.symbol)}
                  <span className="text-xs font-normal text-slate-500">{ASSET_TYPE_INFO[t.assetType].label}</span>
                  {t.convertedAt && (
                    <span className="rounded-md bg-violet-500/15 px-1.5 py-0.5 text-[11px] text-violet-200">Gerçeğe dönüştürüldü</span>
                  )}
                  {t.sourceId && (
                    <span className="rounded-md bg-violet-500/15 px-1.5 py-0.5 text-[11px] text-violet-200">Sanaldan</span>
                  )}
                </div>
                <div className="num text-sm text-slate-400">
                  {formatDate(t.date)} · {formatQuantity(t.quantity)} × {formatMoney(t.price, t.currency, 4)}
                  {t.amount != null && t.amountCurrency && <> · tutar {formatMoney(t.amount, t.amountCurrency)}</>}
                  {t.fee > 0 && <> · komisyon {formatMoney(t.fee, t.currency)}</>}
                  {t.mode === "real" && accName(t.accountId) && <> · {accName(t.accountId)}</>}
                </div>
                {t.note && <div className="mt-0.5 text-sm text-slate-500">{t.note}</div>}
              </div>
              <div className="num ml-auto text-right font-medium">{formatMoney(t.quantity * t.price, t.currency)}</div>
              <div className="flex gap-1">
                <button onClick={() => setEditing(t)} className="rounded-lg px-2.5 py-1.5 text-sm text-slate-300 hover:bg-surface-2">
                  Düzenle
                </button>
                <button onClick={() => remove(t)} className="rounded-lg px-2.5 py-1.5 text-sm text-rose-300 hover:bg-rose-500/10">
                  Sil
                </button>
              </div>
            </div>
          ))}
        </Card>
      )}

      {adding && (
        <Modal title={virtual ? "Sanal pozisyon aç" : "Yeni işlem"} onClose={() => setAdding(false)}>
          {virtual ? (
            <VirtualEntryForm onSaved={() => { setAdding(false); void load(); }} />
          ) : (
            <TransactionForm mode="real" endpoint="/api/transactions" method="POST" onSaved={() => { setAdding(false); void load(); }} />
          )}
        </Modal>
      )}

      {editing && (
        <Modal title="İşlemi düzenle" onClose={() => setEditing(null)}>
          <TransactionForm
            mode={editing.mode}
            endpoint={`/api/transactions/${editing.id}`}
            method="PUT"
            initial={{
              assetType: editing.assetType,
              symbol: editing.symbol,
              side: editing.side,
              quantity: toInput(editing.quantity),
              price: toInput(editing.price, 6),
              currency: editing.currency,
              date: editing.date,
              note: editing.note ?? "",
              accountId: editing.accountId,
              fee: editing.fee > 0 ? toInput(editing.fee, 6) : "0",
              feeMode: "amount",
            }}
            onSaved={() => {
              setEditing(null);
              void load();
            }}
          />
        </Modal>
      )}
    </div>
  );
}
