"use client";

import { useState } from "react";
import { ASSET_TYPE_INFO, ASSET_TYPES, type AssetType } from "@/lib/assets";
import { formatMoney, formatQuantity, formatSigned, pnlClass } from "@/lib/format";
import type { ImportField, ImportMapping, ImportPreview } from "@/lib/importExport";
import type { YearlyReport } from "@/lib/reports";
import { goToLogin, usePolling } from "@/lib/usePolling";
import { AccountSelect, refreshAccounts } from "./AccountControls";
import { Card, Explain, Field, inputCls, PrimaryButton } from "./ui";

// Rapor ve veri: yıllık gerçekleşen kazanç raporu, CSV dışa aktarma, CSV'den işlem içe aktarma.

const TAX_DISCLAIMER =
  "Bu rapor bilgilendirme amaçlıdır, resmî vergi beyanı değildir. Tutarlar işlem günündeki kurlarla TL'ye çevrilmiştir; vergi hesabında enflasyon (ÜFE) endekslemesi gibi kurallar farklı sonuç verebilir. Beyan için aracı kurumunuzun ekstresine ve bir mali müşavire başvurun.";

export function ReportsView() {
  const [account, setAccount] = useState<number | null>(null);
  return (
    <div className="space-y-4 md:space-y-6">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">Rapor ve veri</h1>
        <p className="text-sm text-slate-500">Yıllık kazanç raporu, Excel’e aktarma ve başka yerden işlem içe aktarma.</p>
      </div>
      <div className="max-w-xs">
        <AccountSelect allowAll value={account} onChange={(id) => setAccount(id)} label="Hesap" />
      </div>
      <YearlySection account={account} />
      <ExportSection account={account} />
      <ImportSection />
    </div>
  );
}

// ---- Yıllık rapor -----------------------------------------------------------------------

function YearlySection({ account }: { account: number | null }) {
  const { data, error } = usePolling<YearlyReport>(`/api/reports/yearly${account != null ? `?hesap=${account}` : ""}`, 5 * 60_000);
  const r = data && data.accountId === account ? data : null;
  const exportHref = (year: string) => `/api/export?tur=kazanc&yil=${year}${account != null ? `&hesap=${account}` : ""}`;
  return (
    <Card className="p-4 md:p-6">
      <h2 className="font-semibold">Yıllık gerçekleşen kazanç</h2>
      <p className="mt-1 text-xs text-slate-500">
        Gerçekleşen K/Z: sattığınız kısmın kârı ya da zararı (satış geliri − o kısmın ortalama maliyeti, komisyonlar dahil). Henüz satmadığınız pozisyonların
        kâr/zararı burada yoktur. Temettü brüt tutardan stopaj (kaynakta kesilen vergi) düşülerek net gösterilir.
      </p>
      {!r ? (
        <p className="mt-3 text-sm text-slate-500">{error ? "Rapor alınamadı." : "Yükleniyor…"}</p>
      ) : r.years.length === 0 ? (
        <p className="mt-3 text-sm text-slate-400">Henüz satış ya da temettü yok; rapor oluşunca burada görünür.</p>
      ) : (
        <div className="mt-4 space-y-6">
          {r.years.map((y) => (
            <div key={y.year}>
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <h3 className="text-lg font-semibold">{y.year}</h3>
                <a href={exportHref(y.year)} className="text-xs text-accent">
                  Excel’e aktar (CSV) ›
                </a>
              </div>
              <div className="mt-2 overflow-x-auto">
                <table className="num w-full min-w-[640px] text-sm">
                  <thead className="text-left text-xs text-slate-500">
                    <tr className="border-b border-line">
                      <th className="py-2 pr-3 font-medium">Varlık</th>
                      <th className="px-2 py-2 text-right font-medium">Gerçekleşen K/Z</th>
                      <th className="px-2 py-2 text-right font-medium">Temettü brüt</th>
                      <th className="px-2 py-2 text-right font-medium">Stopaj</th>
                      <th className="px-2 py-2 text-right font-medium">Temettü net</th>
                      <th className="px-2 py-2 text-right font-medium">Komisyon</th>
                      <th className="py-2 pl-2 text-right font-medium">Toplam</th>
                    </tr>
                  </thead>
                  <tbody>
                    {y.rows.map((a) => (
                      <tr key={a.instrument} className="border-b border-line/60">
                        <td className="py-2 pr-3">
                          <span className="font-medium">{a.name}</span>
                          <span className="block text-[11px] text-slate-500">
                            {ASSET_TYPE_INFO[a.assetType].label}
                            {a.soldQuantity > 0 ? ` · ${formatQuantity(a.soldQuantity)} satıldı` : ""}
                          </span>
                        </td>
                        <td className={`px-2 py-2 text-right ${pnlClass(a.realizedTry)}`}>{a.realizedTry ? formatSigned(a.realizedTry) : "—"}</td>
                        <td className="px-2 py-2 text-right">{a.dividendsGrossTry ? formatMoney(a.dividendsGrossTry) : "—"}</td>
                        <td className="px-2 py-2 text-right text-slate-400">{a.withholdingTry ? `−${formatMoney(a.withholdingTry)}` : "—"}</td>
                        <td className="px-2 py-2 text-right">{a.dividendsNetTry ? formatMoney(a.dividendsNetTry) : "—"}</td>
                        <td className="px-2 py-2 text-right text-slate-400">{a.feesTry ? formatMoney(a.feesTry) : "—"}</td>
                        <td className={`py-2 pl-2 text-right font-medium ${pnlClass(a.totalTry)}`}>{formatSigned(a.totalTry)}</td>
                      </tr>
                    ))}
                    <tr className="font-semibold">
                      <td className="py-2 pr-3">Toplam</td>
                      <td className={`px-2 py-2 text-right ${pnlClass(y.totals.realizedTry)}`}>{formatSigned(y.totals.realizedTry)}</td>
                      <td className="px-2 py-2 text-right">{formatMoney(y.totals.dividendsGrossTry)}</td>
                      <td className="px-2 py-2 text-right text-slate-400">−{formatMoney(y.totals.withholdingTry)}</td>
                      <td className="px-2 py-2 text-right">{formatMoney(y.totals.dividendsNetTry)}</td>
                      <td className="px-2 py-2 text-right text-slate-400">{formatMoney(y.totals.feesTry)}</td>
                      <td className={`py-2 pl-2 text-right ${pnlClass(y.totals.totalTry)}`}>{formatSigned(y.totals.totalTry)}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          ))}
        </div>
      )}
      {r?.fxEstimated && <p className="mt-2 text-xs text-amber-300">Bazı işlemlerin işlem günü kuru alınamadığı için güncel kur kullanıldı.</p>}
      <p className="mt-3 rounded-lg bg-amber-500/10 px-3 py-2 text-xs text-amber-100/90">{TAX_DISCLAIMER}</p>
      <p className="mt-2 text-xs text-slate-500">Komisyon sütunu bilgi içindir: alış komisyonu maliyete, satış komisyonu satış gelirine zaten yansıtılmıştır.</p>
    </Card>
  );
}

// ---- Dışa aktarma --------------------------------------------------------------------------

function ExportSection({ account }: { account: number | null }) {
  const q = account != null ? `&hesap=${account}` : "";
  const items: { tur: string; label: string; hint: string }[] = [
    { tur: "islemler", label: "İşlemler", hint: "Tüm gerçek alış/satışlar (komisyon ve kur dahil). İçe aktarma şablonuyla aynı biçim." },
    { tur: "pozisyonlar", label: "Pozisyonlar", hint: "Şu anki pozisyonlar: miktar, maliyet, değer, K/Z, yıllık getiri." },
    { tur: "temettuler", label: "Temettüler", hint: "Kaydedilen temettüler: brüt, stopaj, net." },
    { tur: "kazanc", label: "Gerçekleşen kazanç", hint: "Yıllara göre gerçekleşen K/Z raporu." },
  ];
  return (
    <Card className="p-4 md:p-6">
      <h2 className="font-semibold">Excel’e aktar (CSV)</h2>
      <p className="mt-1 text-xs text-slate-500">
        Dosyalar Türkçe Excel’de çift tıklayınca doğru açılır: Türkçe karakterler, “;” ayırıcı, ondalık virgül (12,5) ve gg.aa.yyyy tarih.
      </p>
      <ul className="mt-3 grid gap-2 sm:grid-cols-2">
        {items.map((i) => (
          <li key={i.tur}>
            <a href={`/api/export?tur=${i.tur}${q}`} className="block rounded-xl border border-line p-3 hover:bg-surface-2">
              <span className="font-medium">{i.label}</span> <span className="text-xs text-accent">indir ›</span>
              <span className="mt-0.5 block text-xs text-slate-500">{i.hint}</span>
            </a>
          </li>
        ))}
      </ul>
    </Card>
  );
}

// ---- İçe aktarma ---------------------------------------------------------------------------

const FIELDS: { key: ImportField; label: string; required?: boolean }[] = [
  { key: "date", label: "Tarih", required: true },
  { key: "symbol", label: "Sembol", required: true },
  { key: "side", label: "Yön (Alış/Satış)", required: true },
  { key: "quantity", label: "Miktar", required: true },
  { key: "price", label: "Fiyat", required: true },
  { key: "assetType", label: "Tür" },
  { key: "currency", label: "Para birimi" },
  { key: "account", label: "Hesap" },
  { key: "fee", label: "Komisyon" },
  { key: "fxTry", label: "Kur (TL)" },
  { key: "note", label: "Not" },
];

/** Dosyayı metne çevirir: UTF-8 değilse Türkçe Windows kodlaması (Excel'in eski CSV'leri) */
async function readText(file: File): Promise<string> {
  const buf = await file.arrayBuffer();
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(buf);
  } catch {
    return new TextDecoder("windows-1254").decode(buf);
  }
}

function ImportSection() {
  const [text, setText] = useState<string | null>(null);
  const [fileName, setFileName] = useState("");
  const [mapping, setMapping] = useState<ImportMapping | null>(null);
  const [defaultType, setDefaultType] = useState<AssetType>("bist");
  const [defaultAccount, setDefaultAccount] = useState<number | null>(null);
  const [createAccounts, setCreateAccounts] = useState(false);
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [rawHeaders, setHeaders] = useState<string[]>([]);

  async function call(body: Record<string, unknown>) {
    const res = await fetch("/api/import", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    if (res.status === 401) {
      goToLogin();
      throw new Error("Oturum kapandı.");
    }
    const d = (await res.json().catch(() => ({}))) as Record<string, unknown> & { error?: string };
    if (!res.ok) throw new Error(d.error ?? "İşlem başarısız.");
    return d;
  }

  async function runPreview(t: string, m: ImportMapping | null, opts: { type?: AssetType; acc?: number | null; create?: boolean } = {}) {
    setBusy(true);
    setError(null);
    setDone(null);
    try {
      const d = (await call({
        text: t,
        mapping: m ?? undefined,
        defaultAssetType: opts.type ?? defaultType,
        defaultAccountId: opts.acc !== undefined ? opts.acc : defaultAccount,
        createAccounts: opts.create ?? createAccounts,
      })) as { preview: ImportPreview };
      setPreview(d.preview);
      setMapping(d.preview.mapping);
    } catch (err) {
      setPreview(null);
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function onFile(f: File) {
    const t = await readText(f);
    setFileName(f.name);
    setText(t);
    setMapping(null);
    // İlk önizlemede başlıklardan otomatik eşleme yapılır; eksik sütun varsa yalnızca başlıklar için eşleme ekranı açılır.
    setBusy(true);
    setError(null);
    try {
      const d = (await call({ text: t, defaultAssetType: defaultType, defaultAccountId: defaultAccount, createAccounts })) as { preview: ImportPreview };
      setPreview(d.preview);
      setMapping(d.preview.mapping);
    } catch (err) {
      setPreview(null);
      // Otomatik eşleme eksikse başlıkları göster ki kullanıcı seçebilsin.
      const first = t.replace(/^﻿/, "").split(/\r?\n/, 1)[0] ?? "";
      const delim = [";", "\t", ","].sort((a, b) => first.split(b).length - first.split(a).length)[0];
      setHeaders(first.split(delim).map((h) => h.replace(/^"|"$/g, "").trim()));
      setMapping({});
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }
  const headers = preview?.headers ?? rawHeaders;

  async function commit() {
    if (!text || !preview) return;
    if (!confirm(`${preview.counts.valid} işlem içe aktarılsın mı?${preview.counts.duplicate ? ` (${preview.counts.duplicate} mükerrer satır atlanacak)` : ""}`)) return;
    setBusy(true);
    setError(null);
    try {
      const d = (await call({ text, mapping, defaultAssetType: defaultType, defaultAccountId: defaultAccount, createAccounts, commit: true })) as {
        inserted: number;
        skippedDuplicates: number;
      };
      setDone(`${d.inserted} işlem eklendi${d.skippedDuplicates ? `, ${d.skippedDuplicates} mükerrer satır atlandı` : ""}.`);
      setPreview(null);
      setText(null);
      await refreshAccounts();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const rows = preview?.rows ?? [];
  return (
    <Card className="space-y-4 p-4 md:p-6">
      <div>
        <h2 className="font-semibold">İşlemleri içe aktar (CSV)</h2>
        <p className="mt-1 text-xs text-slate-500">
          Başka bir uygulamadan ya da aracı kurumunuzun Excel dosyasından işlemlerinizi toplu ekleyin. Excel’de dosyayı “CSV (noktalı virgülle ayrılmış)” olarak kaydedin.{" "}
          <a href="/api/export?tur=sablon" className="text-accent">
            Şablonu indir
          </a>
          .
        </p>
      </div>
      <input
        type="file"
        accept=".csv,text/csv,text/plain"
        disabled={busy}
        onChange={(e) => e.target.files?.[0] && void onFile(e.target.files[0])}
        className="block w-full text-sm text-slate-300 file:mr-3 file:rounded-lg file:border-0 file:bg-surface-2 file:px-3 file:py-2 file:text-slate-200"
      />
      {text && mapping && (
        <div className="space-y-3 rounded-xl border border-line p-3">
          <h3 className="text-sm font-medium">
            Sütun eşleme <span className="text-xs font-normal text-slate-500">({fileName})</span>
          </h3>
          <p className="text-xs text-slate-500">Dosyanızdaki her sütunun ne olduğunu seçin. Bizim şablonumuzda bu otomatik yapılır.</p>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {FIELDS.map((f) => (
              <Field key={f.key} label={`${f.label}${f.required ? " *" : ""}`}>
                <select
                  className={inputCls}
                  value={mapping[f.key] ?? ""}
                  onChange={(e) => {
                    const m = { ...mapping, [f.key]: e.target.value === "" ? null : Number(e.target.value) };
                    setMapping(m);
                    void runPreview(text, m);
                  }}
                >
                  <option value="">— yok —</option>
                  {headers.map((h, i) => (
                    <option key={i} value={i}>
                      {h || `Sütun ${i + 1}`}
                    </option>
                  ))}
                </select>
              </Field>
            ))}
          </div>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            <Field label="Tür sütunu yoksa" hint="Dosyadaki tüm satırlar bu türde sayılır.">
              <select
                className={inputCls}
                value={defaultType}
                onChange={(e) => {
                  const t = e.target.value as AssetType;
                  setDefaultType(t);
                  void runPreview(text, mapping, { type: t });
                }}
              >
                {ASSET_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {ASSET_TYPE_INFO[t].label}
                  </option>
                ))}
              </select>
            </Field>
            <AccountSelect
              label="Hesap sütunu yoksa"
              value={defaultAccount}
              onChange={(id) => {
                if (id === defaultAccount) return;
                setDefaultAccount(id);
                if (text) void runPreview(text, mapping, { acc: id });
              }}
            />
          </div>
          {preview && preview.unknownAccounts.length > 0 && (
            <label className="flex items-center gap-2 text-sm text-slate-300">
              <input
                type="checkbox"
                className="h-4 w-4 accent-emerald-500"
                checked={createAccounts}
                onChange={(e) => {
                  setCreateAccounts(e.target.checked);
                  void runPreview(text, mapping, { create: e.target.checked });
                }}
              />
              Eksik hesapları oluştur: {preview.unknownAccounts.join(", ")}
            </label>
          )}
        </div>
      )}
      {error && <p className="rounded-xl bg-rose-500/10 px-3 py-2 text-sm text-rose-300">{error}</p>}
      {done && <p className="rounded-xl bg-emerald-500/10 px-3 py-2 text-sm text-emerald-300">{done}</p>}
      {preview && (
        <>
          <p className="text-sm">
            <span className="text-slate-300">{preview.counts.total} satır:</span> <span className="text-emerald-300">{preview.counts.valid} geçerli</span>
            {preview.counts.invalid > 0 && <span className="text-rose-300"> · {preview.counts.invalid} hatalı</span>}
            {preview.counts.duplicate > 0 && <span className="text-slate-400"> · {preview.counts.duplicate} mükerrer (atlanacak)</span>}
          </p>
          <div className="max-h-[28rem] overflow-auto rounded-xl border border-line">
            <table className="num w-full min-w-[720px] text-xs">
              <thead className="sticky top-0 bg-surface text-left text-slate-500">
                <tr className="border-b border-line">
                  <th className="px-2 py-2 font-medium">Satır</th>
                  <th className="px-2 py-2 font-medium">Tarih</th>
                  <th className="px-2 py-2 font-medium">Hesap</th>
                  <th className="px-2 py-2 font-medium">Tür</th>
                  <th className="px-2 py-2 font-medium">Sembol</th>
                  <th className="px-2 py-2 font-medium">Yön</th>
                  <th className="px-2 py-2 text-right font-medium">Miktar</th>
                  <th className="px-2 py-2 text-right font-medium">Fiyat</th>
                  <th className="px-2 py-2 text-right font-medium">Komisyon</th>
                  <th className="px-2 py-2 font-medium">Durum</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.line} className={`border-b border-line/60 align-top ${r.errors.length ? "bg-rose-500/10" : r.duplicate ? "opacity-50" : ""}`}>
                    <td className="px-2 py-1.5 text-slate-500">{r.line}</td>
                    <td className="px-2 py-1.5">{r.date ? r.date.split("-").reverse().join(".") : "—"}</td>
                    <td className="px-2 py-1.5">{r.account ?? "—"}</td>
                    <td className="px-2 py-1.5">{r.assetType ? ASSET_TYPE_INFO[r.assetType].label : "—"}</td>
                    <td className="px-2 py-1.5 font-medium">{r.symbol ?? "—"}</td>
                    <td className="px-2 py-1.5">{r.side === "buy" ? "Alış" : r.side === "sell" ? "Satış" : "—"}</td>
                    <td className="px-2 py-1.5 text-right">{r.quantity != null ? formatQuantity(r.quantity) : "—"}</td>
                    <td className="px-2 py-1.5 text-right">{r.price != null ? formatMoney(r.price, r.currency ?? "TRY", 6) : "—"}</td>
                    <td className="px-2 py-1.5 text-right">{r.fee ? formatMoney(r.fee, r.currency ?? "TRY") : "—"}</td>
                    <td className="px-2 py-1.5">
                      {r.errors.length ? (
                        <ul className="text-rose-300">
                          {r.errors.map((e, i) => (
                            <li key={i}>{e}</li>
                          ))}
                        </ul>
                      ) : r.duplicate ? (
                        <span className="text-slate-400">Zaten kayıtlı (mükerrer)</span>
                      ) : (
                        <span className="text-emerald-300">Hazır</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <PrimaryButton onClick={() => void commit()} disabled={busy || preview.counts.invalid > 0 || preview.counts.valid === 0}>
            {busy ? "Çalışıyor…" : `${preview.counts.valid} işlemi içe aktar`}
          </PrimaryButton>
          {preview.counts.invalid > 0 && <p className="text-xs text-rose-300">Hatalı satırlar varken içe aktarma yapılmaz: dosyayı düzeltip yeniden yükleyin ya da sütun eşlemesini değiştirin.</p>}
        </>
      )}
      <Explain>
        İçe aktarma ya hep ya hiç çalışır: bir satır bile kaydedilemezse hiçbiri kaydedilmez. Daha önce eklenmiş işlemler (aynı tarih, sembol, yön, miktar, fiyat ve
        hesap) mükerrer sayılır ve atlanır; aynı dosyayı iki kez yüklemek güvenlidir. Kur boşsa döviz işlemlerinde işlem günü kuru otomatik alınır.
      </Explain>
    </Card>
  );
}
