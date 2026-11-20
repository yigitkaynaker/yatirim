"use client";

import { useState } from "react";
import Link from "next/link";
import { ASSET_TYPE_INFO, ASSET_TYPES, displaySymbol, normalizeSymbol, type AssetType, type Mode } from "@/lib/assets";
import type { Alarm, AlarmEvent, AlarmKind } from "@/lib/alarms";
import { usePolling } from "@/lib/usePolling";
import { Card, Explain, Field, inputCls, Modal, PrimaryButton, Segmented } from "./ui";
import { SymbolField, symbolOnTypeChange } from "./SymbolField";

// Alarmlar: işlem yapmayan uyarılar. Koşul sağlanınca bildirim + push gelir.

const KIND_INFO: Record<AlarmKind, { label: string; explain: string }> = {
  price: { label: "Fiyat", explain: "Fiyat belirlediğiniz seviyenin üstüne çıkınca ya da altına inince haber verir." },
  day_change: {
    label: "Günlük %",
    explain: "Fiyat bir önceki kapanışa göre bir günde belirlediğiniz yüzde kadar yükselir ya da düşerse haber verir (örn. %5).",
  },
  cost_change: {
    label: "Maliyetime göre",
    explain: "Pozisyonunuz aldığınız fiyata (maliyetinize) göre belirlediğiniz yüzde kadar kâra ya da zarara geçince haber verir. TL üzerinden hesaplanır.",
  },
  volume_spike: {
    label: "Hacim",
    explain: "Bugün işlem gören miktar son 20 günün ortalamasının belirlediğiniz katına çıkarsa haber verir. Ani hacim artışı çoğu zaman bir haberin ya da büyük alım satımın işaretidir.",
  },
  signal_change: {
    label: "Teknik sinyal",
    explain: "Teknik özet sinyal (Güçlü Al … Güçlü Sat) değişince haber verir. Bu kontrol 15 dakikada bir yapılır.",
  },
};

const REPEAT_EXPLAIN =
  "Tek sefer: alarm bir kez çalar ve kapanır. Her seferinde: koşul her yeniden oluştuğunda çalar; ama iki çalma arasında en az bekleme süresi kadar zaman geçer, böylece bildirim yağmuru olmaz.";

function fmtTime(ms: number | null) {
  if (!ms) return "";
  return new Date(ms).toLocaleString("tr-TR", { timeZone: "Europe/Istanbul", dateStyle: "short", timeStyle: "short" });
}

export function AlarmsView() {
  const { data, reload } = usePolling<{ alarms: Alarm[]; events: AlarmEvent[] }>("/api/alarms", 60_000);
  const [adding, setAdding] = useState(false);
  const list = data?.alarms ?? null;

  async function remove(a: Alarm) {
    if (!confirm("Bu alarm silinsin mi?")) return;
    await fetch(`/api/alarms/${a.id}`, { method: "DELETE" });
    void reload();
  }
  async function toggle(a: Alarm) {
    await fetch(`/api/alarms/${a.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ active: !a.active }) });
    void reload();
  }

  return (
    <div className="space-y-4 md:space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Alarmlar</h1>
          <p className="text-sm text-slate-500">Alarm yalnızca haber verir; alım satım yapmaz. Koşul sağlanınca zil simgesine ve telefonunuza bildirim gelir.</p>
        </div>
        <PrimaryButton onClick={() => setAdding(true)}>+ Alarm kur</PrimaryButton>
      </div>

      <Explain title="Alarm ile emir farkı:">
        Emir, koşul sağlanınca portföyünüze işlem kaydeder. Alarm ise sadece &quot;bak, şu oldu&quot; der; kararı siz verirsiniz. Alarmların süresi dolmaz, siz silene ya da
        kapatana kadar çalışır. {REPEAT_EXPLAIN}
      </Explain>

      <section className="space-y-2">
        <h2 className="text-sm font-medium text-slate-300">Alarmlarım</h2>
        {!list ? (
          <Card className="p-6 text-center text-sm text-slate-500">Yükleniyor…</Card>
        ) : list.length === 0 ? (
          <Card className="p-6 text-center text-sm text-slate-400">Henüz alarm yok. Bir varlığın detay sayfasındaki &quot;Alarm kur&quot; düğmesini de kullanabilirsiniz.</Card>
        ) : (
          <Card className="divide-y divide-line/70">
            {list.map((a) => (
              <AlarmRow key={a.id} a={a} onDelete={() => remove(a)} onToggle={() => toggle(a)} />
            ))}
          </Card>
        )}
      </section>

      {(data?.events.length ?? 0) > 0 && (
        <section className="space-y-2">
          <h2 className="text-sm font-medium text-slate-300">Son çalan alarmlar</h2>
          <Card className="divide-y divide-line/70">
            {data!.events.map((e) => (
              <Link key={e.id} href={`/piyasa/detay?id=${encodeURIComponent(e.instrument)}`} className="block px-4 py-3 text-sm hover:bg-surface-2">
                <div className="text-slate-200">{e.message}</div>
                <div className="text-xs text-slate-500">{fmtTime(e.firedAt)}</div>
              </Link>
            ))}
          </Card>
        </section>
      )}

      {adding && (
        <Modal title="Alarm kur" onClose={() => setAdding(false)}>
          <AlarmForm
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

function AlarmRow({ a, onDelete, onToggle }: { a: Alarm; onDelete: () => void; onToggle: () => void }) {
  return (
    <div className={`flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3 ${a.active ? "" : "opacity-60"}`}>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2 text-sm font-medium">
          {a.description}
          <span className={`rounded-md px-1.5 py-0.5 text-[11px] ${a.active ? "bg-sky-500/15 text-sky-300" : "bg-slate-500/20 text-slate-300"}`}>{a.active ? "Açık" : "Kapalı"}</span>
          {a.source === "yapay_zeka" && <span className="rounded-md bg-amber-500/15 px-1.5 py-0.5 text-[11px] text-amber-200">Yapay zeka</span>}
        </div>
        <div className="text-xs text-slate-500">
          {a.repeat === "once" ? "Tek sefer" : `Her seferinde · en az ${a.cooldownMin} dk arayla`}
          {a.fireCount > 0 && ` · ${a.fireCount} kez çaldı, son: ${fmtTime(a.lastFiredAt)}`}
          {a.note && ` · ${a.note}`}
        </div>
      </div>
      <div className="flex gap-2">
        <button onClick={onToggle} className="rounded-lg border border-line px-3 py-1.5 text-xs text-slate-300 hover:bg-surface-2">
          {a.active ? "Kapat" : "Aç"}
        </button>
        <button onClick={onDelete} className="rounded-lg border border-rose-500/30 px-3 py-1.5 text-xs text-rose-300 hover:bg-rose-500/10">
          Sil
        </button>
      </div>
    </div>
  );
}

/** Alarm kurma formu. Varlık detayı / pozisyon sayfasından varlık seçili açılabilir. */
export function AlarmForm({
  initialAssetType,
  initialSymbol,
  initialMode,
  currentPrice,
  currency,
  onSaved,
}: {
  initialAssetType?: AssetType;
  initialSymbol?: string;
  initialMode?: Mode;
  currentPrice?: number | null;
  currency?: string | null;
  onSaved: () => void;
}) {
  const locked = !!initialAssetType && !!initialSymbol;
  const [kind, setKind] = useState<AlarmKind>(initialMode ? "cost_change" : "price");
  const [scope, setScope] = useState<"asset" | "watchlist">("asset");
  const [assetType, setAssetType] = useState<AssetType>(initialAssetType ?? "bist");
  const [symbol, setSymbol] = useState(initialSymbol ?? "");
  const [mode, setMode] = useState<Mode>(initialMode ?? "real");
  const [direction, setDirection] = useState<"up" | "down" | "both">("up");
  const [threshold, setThreshold] = useState(kind === "cost_change" ? "10" : "");
  const [repeat, setRepeat] = useState<"once" | "every">("once");
  const [cooldown, setCooldown] = useState("60");
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const watchOk = kind === "day_change" || kind === "volume_spike" || kind === "signal_change";
  const effScope = watchOk && !locked ? scope : "asset";

  function pickKind(k: AlarmKind) {
    setKind(k);
    setDirection(k === "price" ? "up" : "both");
    setThreshold(k === "day_change" ? "5" : k === "cost_change" ? "10" : k === "volume_spike" ? "2" : "");
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const res = await fetch("/api/alarms", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        kind,
        scope: effScope,
        assetType: effScope === "asset" ? assetType : undefined,
        symbol: effScope === "asset" ? normalizeSymbol(assetType, symbol) : undefined,
        mode: kind === "cost_change" ? mode : undefined,
        direction,
        threshold: kind === "signal_change" ? undefined : threshold,
        repeat,
        cooldownMin: cooldown,
        note,
      }),
    }).catch(() => null);
    setBusy(false);
    if (!res || !res.ok) {
      setError(((await res?.json().catch(() => ({}))) as { error?: string } | undefined)?.error ?? "Alarm kurulamadı.");
      return;
    }
    onSaved();
  }

  const unit = kind === "price" ? (currency ?? "") : kind === "volume_spike" ? "kat" : "%";
  return (
    <form onSubmit={submit} className="space-y-4">
      <Field label="Alarm türü">
        <select className={inputCls} value={kind} onChange={(e) => pickKind(e.target.value as AlarmKind)}>
          {(Object.keys(KIND_INFO) as AlarmKind[]).map((k) => (
            <option key={k} value={k}>
              {KIND_INFO[k].label}
            </option>
          ))}
        </select>
      </Field>
      <Explain>{KIND_INFO[kind].explain}</Explain>

      {watchOk && !locked && (
        <Segmented
          value={scope}
          onChange={setScope}
          options={[
            { value: "asset", label: "Tek varlık" },
            { value: "watchlist", label: "İzleme listemin tümü" },
          ]}
        />
      )}

      {effScope === "asset" && (
        locked ? (
          <p className="text-sm text-slate-300">
            Varlık: <span className="font-medium">{displaySymbol(assetType, symbol)}</span>
          </p>
        ) : (
          <div className="grid grid-cols-2 gap-3">
            <Field label="Varlık türü">
              <select
                className={inputCls}
                value={assetType}
                onChange={(e) => {
                  const next = e.target.value as AssetType;
                  setSymbol(symbolOnTypeChange(next, assetType, symbol));
                  setAssetType(next);
                }}
              >
                {ASSET_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {ASSET_TYPE_INFO[t].label}
                  </option>
                ))}
              </select>
            </Field>
            <SymbolField assetType={assetType} value={symbol} onChange={setSymbol} showHint={false} />
          </div>
        )
      )}
      {effScope === "watchlist" && <p className="text-xs text-slate-400">İzleme listenizdeki her varlık ayrı ayrı kontrol edilir; hangisi koşulu sağlarsa onun için bildirim gelir.</p>}

      {kind === "cost_change" && (
        <Segmented
          value={mode}
          onChange={setMode}
          options={[
            { value: "real", label: "Gerçek pozisyon" },
            { value: "virtual", label: "Sanal pozisyon" },
          ]}
        />
      )}

      {kind !== "signal_change" && kind !== "volume_spike" && (
        <Segmented
          value={direction}
          onChange={setDirection}
          options={
            kind === "price"
              ? [
                  { value: "up", label: "Üstüne çıkarsa" },
                  { value: "down", label: "Altına inerse" },
                ]
              : [
                  { value: "up", label: kind === "cost_change" ? "Kârda" : "Yükselirse" },
                  { value: "down", label: kind === "cost_change" ? "Zararda" : "Düşerse" },
                  { value: "both", label: "İki yön" },
                ]
          }
        />
      )}

      {kind !== "signal_change" && (
        <Field
          label={kind === "price" ? `Eşik fiyatı ${unit ? `(${unit})` : ""}` : kind === "volume_spike" ? "Kaç kat? (örn. 2)" : "Yüzde (örn. 5)"}
          hint={kind === "price" && currentPrice != null ? `Şu anki fiyat: ${currentPrice.toLocaleString("tr-TR", { maximumFractionDigits: 6 })} ${unit}` : undefined}
        >
          <input className={inputCls} inputMode="decimal" value={threshold} required onChange={(e) => setThreshold(e.target.value)} />
        </Field>
      )}

      <Segmented
        value={repeat}
        onChange={setRepeat}
        options={[
          { value: "once", label: "Tek sefer" },
          { value: "every", label: "Her seferinde" },
        ]}
      />
      {repeat === "every" && (
        <Field label="Bekleme süresi (dakika)" hint="İki bildirim arasında en az bu kadar zaman geçer.">
          <input className={inputCls} inputMode="numeric" value={cooldown} onChange={(e) => setCooldown(e.target.value)} />
        </Field>
      )}
      <Field label="Not (isteğe bağlı)">
        <input className={inputCls} value={note} maxLength={300} onChange={(e) => setNote(e.target.value)} />
      </Field>
      {error && <p className="rounded-xl bg-rose-500/10 px-3 py-2 text-sm text-rose-300">{error}</p>}
      <PrimaryButton type="submit" disabled={busy} className="w-full">
        {busy ? "Kuruluyor…" : "Alarmı kur"}
      </PrimaryButton>
    </form>
  );
}
