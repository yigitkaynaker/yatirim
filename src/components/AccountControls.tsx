"use client";

import { useCallback, useEffect, useState } from "react";
import type { Account } from "@/lib/accounts";
import { fetchJson, goToLogin, UnauthorizedError } from "@/lib/usePolling";
import { Field, inputCls } from "./ui";

// Hesap seçimi için ortak istemci bileşenleri: hesap listesi, seçim kutusu, filtre çipleri.

export const ACCOUNT_EXPLAIN =
  "Hesap: varlıklarınızı tuttuğunuz yer (aracı kurum, banka, altın kasası, kripto borsası). Her hesabın pozisyonları ve ortalama maliyeti ayrı hesaplanır; toplam portföy, “toplama dahil” hesapların birleşimidir.";

export const FEE_EXPLAIN = "Komisyon: aracı kurumun her alış ya da satışta aldığı ücret. Alışta maliyetinize eklenir, satışta elinize geçen tutardan düşülür.";

let cache: { at: number; list: Account[] } | null = null;
const listeners = new Set<(l: Account[]) => void>();

/** Hesap listesini (arşivliler dahil) yeniden çeker; açık tüm bileşenler güncellenir. */
export async function refreshAccounts(): Promise<Account[]> {
  try {
    const d = await fetchJson<{ accounts: Account[] }>("/api/accounts");
    cache = { at: Date.now(), list: d.accounts };
    for (const l of listeners) l(d.accounts);
    return d.accounts;
  } catch (err) {
    if (err instanceof UnauthorizedError) goToLogin();
    return cache?.list ?? [];
  }
}

/** Hesaplar (arşivliler dahil). Kısa süreli önbellekli. */
export function useAccounts(): { accounts: Account[] | null; reload: () => Promise<Account[]> } {
  const [list, setList] = useState<Account[] | null>(cache?.list ?? null);
  useEffect(() => {
    listeners.add(setList);
    if (!cache || Date.now() - cache.at > 30_000) void refreshAccounts();
    return () => {
      listeners.delete(setList);
    };
  }, []);
  const reload = useCallback(() => refreshAccounts(), []);
  return { accounts: list, reload };
}

/** Hesap seçimi (arşivlenmemiş hesaplar; seçili hesap arşivliyse o da görünür). */
export function AccountSelect({
  value,
  onChange,
  label = "Hesap",
  hint,
  allowAll = false,
}: {
  value: number | null;
  onChange: (id: number | null, account: Account | null) => void;
  label?: string;
  hint?: string;
  /** "Tüm hesaplar" seçeneği (null) */
  allowAll?: boolean;
}) {
  const { accounts } = useAccounts();
  const visible = (accounts ?? []).filter((a) => !a.archived || a.id === value);
  // Değer yoksa varsayılan hesabı seç (ilk arşivlenmemiş hesap).
  useEffect(() => {
    if (!allowAll && value == null && visible.length > 0) onChange(visible[0].id, visible[0]);
  }, [allowAll, value, visible, onChange]);
  if (accounts && visible.length <= 1 && !allowAll) return null; // tek hesap varken seçim gösterme
  return (
    <Field label={label} hint={hint}>
      <select
        className={inputCls}
        value={value ?? ""}
        onChange={(e) => {
          const id = e.target.value ? Number(e.target.value) : null;
          onChange(id, visible.find((a) => a.id === id) ?? null);
        }}
      >
        {allowAll && <option value="">Tüm hesaplar</option>}
        {visible.map((a) => (
          <option key={a.id} value={a.id}>
            {a.name}
            {a.archived ? " (arşiv)" : ""}
          </option>
        ))}
      </select>
    </Field>
  );
}

/** Hesap filtre çipleri: "Tümü" + her hesap */
export function AccountChips({
  items,
  value,
  onChange,
}: {
  items: { id: number; name: string; muted?: boolean }[];
  value: number | null;
  onChange: (id: number | null) => void;
}) {
  if (items.length <= 1) return null;
  const chip = (active: boolean) =>
    `shrink-0 rounded-full border px-3 py-1.5 text-sm transition ${
      active ? "border-emerald-400/50 bg-emerald-500/15 text-emerald-200" : "border-line text-slate-400 hover:text-white"
    }`;
  return (
    <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 sm:mx-0 sm:flex-wrap sm:px-0" role="tablist" aria-label="Hesap filtresi">
      <button role="tab" aria-selected={value == null} className={chip(value == null)} onClick={() => onChange(null)}>
        Tümü
      </button>
      {items.map((a) => (
        <button key={a.id} role="tab" aria-selected={value === a.id} className={`${chip(value === a.id)} ${a.muted ? "opacity-70" : ""}`} onClick={() => onChange(a.id)}>
          {a.name}
        </button>
      ))}
    </div>
  );
}
