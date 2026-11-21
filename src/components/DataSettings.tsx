"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { Account } from "@/lib/accounts";
import type { BackupCheck, BackupFile } from "@/lib/backup";
import { fetchJson, goToLogin, UnauthorizedError } from "@/lib/usePolling";
import { ACCOUNT_EXPLAIN, FEE_EXPLAIN, refreshAccounts, useAccounts } from "./AccountControls";
import { Card, Explain, Field, inputCls, PrimaryButton } from "./ui";

// Ayarlar: hesap yönetimi (ekle, yeniden adlandır, komisyon oranı, toplama dahil, arşivle)
// ve yedekleme / geri yükleme.

type Msg = { ok: boolean; text: string } | null;

function Note({ msg }: { msg: Msg }) {
  if (!msg) return null;
  return (
    <p role="status" className={`rounded-xl px-3 py-2 text-sm ${msg.ok ? "bg-emerald-500/10 text-emerald-300" : "bg-rose-500/10 text-rose-300"}`}>
      {msg.text}
    </p>
  );
}

async function send(url: string, method: string, body?: unknown) {
  const res = await fetch(url, {
    method,
    headers: body !== undefined ? { "Content-Type": "application/json" } : undefined,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  if (res.status === 401) {
    goToLogin();
    throw new UnauthorizedError();
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((data as { error?: string }).error ?? "İşlem başarısız.");
  return data;
}

const pctInput = (n: number) => (n ? String(n).replace(".", ",") : "");

// ---- Hesaplar ---------------------------------------------------------------------------

export function AccountsSection() {
  const { accounts } = useAccounts();
  const [name, setName] = useState("");
  const [fee, setFee] = useState("");
  const [msg, setMsg] = useState<Msg>(null);
  const [busy, setBusy] = useState(false);
  const [showArchived, setShowArchived] = useState(false);

  async function add(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMsg(null);
    try {
      await send("/api/accounts", "POST", { name, feePct: fee });
      setName("");
      setFee("");
      await refreshAccounts();
      setMsg({ ok: true, text: "Hesap eklendi." });
    } catch (err) {
      if (!(err instanceof UnauthorizedError)) setMsg({ ok: false, text: (err as Error).message });
    } finally {
      setBusy(false);
    }
  }

  const list = (accounts ?? []).filter((a) => showArchived || !a.archived);
  const archivedCount = (accounts ?? []).filter((a) => a.archived).length;

  return (
    <Card className="space-y-4 p-4 md:p-6">
      <div id="hesaplar" className="scroll-mt-20">
        <h2 className="font-semibold">Hesaplar</h2>
        <p className="mt-1 text-sm text-slate-400">{ACCOUNT_EXPLAIN}</p>
      </div>
      {!accounts ? (
        <p className="text-sm text-slate-500">Yükleniyor…</p>
      ) : (
        <ul className="divide-y divide-line/60 rounded-xl border border-line">
          {list.map((a) => (
            <AccountRow key={`${a.id}-${a.name}-${a.feePct}-${a.archived}-${a.includeInTotal}`} a={a} onMsg={setMsg} />
          ))}
        </ul>
      )}
      {archivedCount > 0 && (
        <button onClick={() => setShowArchived((v) => !v)} className="text-xs text-slate-400 hover:text-white">
          {showArchived ? "Arşivlenenleri gizle" : `Arşivlenen hesapları göster (${archivedCount})`}
        </button>
      )}
      <form onSubmit={add} className="grid grid-cols-1 gap-3 sm:grid-cols-[1fr_9rem_auto] sm:items-end">
        <Field label="Yeni hesap adı">
          <input className={inputCls} maxLength={40} placeholder="örn. Midas, İş Yatırım, Altın kasası" value={name} onChange={(e) => setName(e.target.value)} required />
        </Field>
        <Field label="Komisyon %">
          <input className={inputCls} inputMode="decimal" placeholder="örn. 0,2" value={fee} onChange={(e) => setFee(e.target.value)} />
        </Field>
        <PrimaryButton type="submit" disabled={busy || !name.trim()}>
          Ekle
        </PrimaryButton>
      </form>
      <Note msg={msg} />
      <Explain>
        {FEE_EXPLAIN} Buraya yazdığınız oran, o hesaba eklenen yeni işlemlerde komisyon alanına otomatik yazılır (işlemde değiştirebilirsiniz). Arşivlenen hesap
        listelerde görünmez ama geçmiş işlemleri ve raporları korunur; açık pozisyonu olan hesap arşivlenemez.
      </Explain>
    </Card>
  );
}

function AccountRow({ a, onMsg }: { a: Account; onMsg: (m: Msg) => void }) {
  const [edit, setEdit] = useState(false);
  const [name, setName] = useState(a.name);
  const [fee, setFee] = useState(pctInput(a.feePct));
  const [busy, setBusy] = useState(false);

  async function patch(body: Record<string, unknown>, ok: string) {
    setBusy(true);
    onMsg(null);
    try {
      await send(`/api/accounts/${a.id}`, "PATCH", body);
      await refreshAccounts();
      onMsg({ ok: true, text: ok });
      setEdit(false);
    } catch (err) {
      if (!(err instanceof UnauthorizedError)) onMsg({ ok: false, text: (err as Error).message });
    } finally {
      setBusy(false);
    }
  }

  if (edit) {
    return (
      <li className="grid grid-cols-1 gap-2 p-3 sm:grid-cols-[1fr_8rem_auto_auto] sm:items-end">
        <Field label="Ad">
          <input className={inputCls} maxLength={40} value={name} onChange={(e) => setName(e.target.value)} />
        </Field>
        <Field label="Komisyon %">
          <input className={inputCls} inputMode="decimal" value={fee} onChange={(e) => setFee(e.target.value)} />
        </Field>
        <PrimaryButton disabled={busy} onClick={() => void patch({ name, feePct: fee }, "Hesap güncellendi.")}>
          Kaydet
        </PrimaryButton>
        <button onClick={() => setEdit(false)} className="rounded-xl border border-line px-3 py-2.5 text-sm text-slate-300">
          Vazgeç
        </button>
      </li>
    );
  }
  return (
    <li className={`flex flex-wrap items-center gap-x-3 gap-y-2 p-3 ${a.archived ? "opacity-60" : ""}`}>
      <div className="min-w-0 flex-1">
        <div className="font-medium">
          {a.name} {a.archived && <span className="ml-1 rounded bg-slate-500/20 px-1.5 py-0.5 text-[11px]">arşiv</span>}
        </div>
        <div className="text-xs text-slate-500">Komisyon %{a.feePct.toLocaleString("tr-TR", { maximumFractionDigits: 3 })}</div>
      </div>
      {!a.archived && (
        <label className="flex cursor-pointer items-center gap-2 text-xs text-slate-400" title="Kapalıysa bu hesap toplam portföy değerine ve grafiklere dahil edilmez.">
          <input
            type="checkbox"
            className="h-4 w-4 accent-emerald-500"
            checked={a.includeInTotal}
            disabled={busy}
            onChange={() => void patch({ includeInTotal: !a.includeInTotal }, a.includeInTotal ? "Hesap toplamdan çıkarıldı." : "Hesap toplama eklendi.")}
          />
          Toplama dahil
        </label>
      )}
      <div className="flex gap-1">
        {!a.archived && (
          <button onClick={() => setEdit(true)} className="rounded-lg px-2.5 py-1.5 text-sm text-slate-300 hover:bg-surface-2">
            Düzenle
          </button>
        )}
        <button
          disabled={busy}
          onClick={() => {
            if (!a.archived && !confirm(`"${a.name}" arşivlensin mi? Geçmiş işlemleri korunur, yeni işlemlerde seçilemez.`)) return;
            void patch({ archived: !a.archived }, a.archived ? "Hesap arşivden çıkarıldı." : "Hesap arşivlendi.");
          }}
          className="rounded-lg px-2.5 py-1.5 text-sm text-slate-400 hover:bg-surface-2"
        >
          {a.archived ? "Geri al" : "Arşivle"}
        </button>
      </div>
    </li>
  );
}

// ---- Yedekleme ---------------------------------------------------------------------------

const KIND_LABEL: Record<BackupFile["kind"], string> = {
  gunluk: "Günlük (otomatik)",
  elle: "Elle",
  "geri-yukleme-oncesi": "Geri yükleme öncesi",
  "gecis-oncesi": "Güncelleme öncesi",
  diger: "Diğer",
};

function size(n: number) {
  return n >= 1024 * 1024 ? `${(n / 1024 / 1024).toLocaleString("tr-TR", { maximumFractionDigits: 1 })} MB` : `${Math.max(1, Math.round(n / 1024))} KB`;
}

export function BackupSection() {
  const [list, setList] = useState<BackupFile[] | null>(null);
  const [cloud, setCloud] = useState(false);
  const [msg, setMsg] = useState<Msg>(null);
  const [busy, setBusy] = useState(false);
  const [staged, setStaged] = useState<{ token: string; check: BackupCheck; name: string } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    try {
      const d = await fetchJson<{ backups: BackupFile[]; cloud?: boolean }>("/api/backups");
      setList(d.backups);
      setCloud(!!d.cloud);
    } catch (err) {
      if (err instanceof UnauthorizedError) return goToLogin();
      setMsg({ ok: false, text: "Yedek listesi alınamadı." });
    }
  }, []);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load]);

  async function backupNow() {
    setBusy(true);
    setMsg(null);
    try {
      const d = (await send("/api/backups", "POST")) as { backup: BackupFile };
      setMsg({ ok: true, text: `Yedek alındı: ${d.backup.name}` });
      await load();
    } catch (err) {
      if (!(err instanceof UnauthorizedError)) setMsg({ ok: false, text: (err as Error).message });
    } finally {
      setBusy(false);
    }
  }

  async function upload(file: File) {
    setBusy(true);
    setMsg(null);
    setStaged(null);
    try {
      const form = new FormData();
      form.append("file", file);
      const res = await fetch("/api/backups/restore", { method: "POST", body: form });
      if (res.status === 401) return goToLogin();
      const d = (await res.json().catch(() => ({}))) as { token?: string; check?: BackupCheck; error?: string };
      if (!res.ok || !d.token || !d.check) throw new Error(d.error ?? "Dosya doğrulanamadı.");
      setStaged({ token: d.token, check: d.check, name: file.name });
    } catch (err) {
      setMsg({ ok: false, text: (err as Error).message });
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  async function restore() {
    if (!staged) return;
    // İki kez onay: geri yükleme mevcut verilerin yerine geçer.
    if (!confirm(`"${staged.name}" geri yüklensin mi? Şu anki verilerinizin YERİNE geçecek (önce otomatik yedeği alınır).`)) return;
    if (!confirm("Emin misiniz? Bu yedekten sonra yaptığınız işlemler görünmeyecek. Devam etmek için Tamam'a basın.")) return;
    setBusy(true);
    setMsg(null);
    try {
      const d = (await send("/api/backups/restore", "POST", { token: staged.token, confirm: "GERI YUKLE" })) as { before: BackupFile };
      setStaged(null);
      await refreshAccounts();
      await load();
      setMsg({
        ok: true,
        text: `Geri yükleme tamamlandı. Önceki verileriniz "${d.before.name}" olarak yedeklendi. Sayfalar eski görünürse sayfayı yenileyin; sorun sürerse uygulamayı yeniden başlatın.`,
      });
    } catch (err) {
      if (!(err instanceof UnauthorizedError)) setMsg({ ok: false, text: (err as Error).message });
    } finally {
      setBusy(false);
    }
  }

  if (cloud) return <CloudBackupSection />;

  return (
    <Card className="space-y-4 p-4 md:p-6">
      <div id="yedek" className="scroll-mt-20">
        <h2 className="font-semibold">Yedekleme ve geri yükleme</h2>
        <p className="mt-1 text-sm text-slate-400">
          Tüm verileriniz bilgisayarınızdaki tek bir dosyadadır. Disk arızası, yanlışlıkla silme ya da hatalı bir içe aktarmada verilerinizi geri getirmenin tek yolu
          yedektir. Uygulama çalışırken her gün otomatik yedek alır ve son 14 yedeği saklar. Ara sıra bir yedeği indirip başka bir yere (USB bellek, bulut) koymanız önerilir.
        </p>
      </div>
      <PrimaryButton onClick={() => void backupNow()} disabled={busy}>
        {busy ? "Çalışıyor…" : "Şimdi yedekle"}
      </PrimaryButton>
      <Note msg={msg} />
      {list && list.length === 0 && <p className="text-sm text-slate-500">Henüz yedek yok.</p>}
      {list && list.length > 0 && (
        <ul className="num divide-y divide-line/60 rounded-xl border border-line text-sm">
          {list.map((b) => (
            <li key={b.name} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2">
              <div className="min-w-0 flex-1">
                <div className="truncate text-slate-200">{new Date(b.createdAt).toLocaleString("tr-TR", { timeZone: "Europe/Istanbul", dateStyle: "medium", timeStyle: "short" })}</div>
                <div className="truncate text-xs text-slate-500">
                  {KIND_LABEL[b.kind]} · {size(b.size)} · {b.name}
                </div>
              </div>
              <a href={`/api/backups/${encodeURIComponent(b.name)}`} download className="rounded-lg border border-line px-2.5 py-1.5 text-xs text-slate-300 hover:bg-surface-2">
                İndir
              </a>
            </li>
          ))}
        </ul>
      )}
      <div className="rounded-xl border border-amber-500/30 p-3">
        <h3 className="text-sm font-medium">Yedekten geri yükle</h3>
        <p className="mt-1 text-xs text-slate-400">
          Bir yedek dosyası (.db) seçin. Dosya önce kontrol edilir; onaylarsanız şu anki verileriniz otomatik yedeklenir ve seçtiğiniz yedek yerine konur.
        </p>
        <input
          ref={fileRef}
          type="file"
          accept=".db,application/vnd.sqlite3,application/octet-stream"
          disabled={busy}
          onChange={(e) => e.target.files?.[0] && void upload(e.target.files[0])}
          className="mt-2 block w-full text-sm text-slate-300 file:mr-3 file:rounded-lg file:border-0 file:bg-surface-2 file:px-3 file:py-2 file:text-slate-200"
        />
        {staged && (
          <div className="mt-3 space-y-2 text-sm">
            <p className="text-emerald-300">Dosya geçerli bir yedek.</p>
            <ul className="num text-xs text-slate-400">
              <li>İşlem sayısı: {staged.check.transactions}</li>
              <li>Son işlem tarihi: {staged.check.lastTransactionDate ?? "—"}</li>
              <li>Hesap sayısı: {staged.check.accounts ?? "1 (eski sürüm; 'Ana hesap' olarak taşınacak)"}</li>
              <li>Şema sürümü: {staged.check.schemaVersion}</li>
            </ul>
            <div className="flex gap-2">
              <button onClick={() => void restore()} disabled={busy} className="rounded-xl bg-rose-500 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">
                Yedekten geri yükle
              </button>
              <button onClick={() => setStaged(null)} className="rounded-xl border border-line px-4 py-2 text-sm text-slate-300">
                Vazgeç
              </button>
            </div>
          </div>
        )}
      </div>
    </Card>
  );
}

// ---- Bulut modu: JSON yedek -----------------------------------------------------------------

type DumpPreview = { name: string; data: unknown; counts: Record<string, number>; exportedAt: string | null };

/** Bulut modunda dosya yedeği yoktur: tüm veriler tek JSON dosyası olarak indirilir / geri yüklenir. */
export function CloudBackupSection() {
  const [msg, setMsg] = useState<Msg>(null);
  const [busy, setBusy] = useState(false);
  const [staged, setStaged] = useState<DumpPreview | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  async function pick(file: File) {
    setMsg(null);
    setStaged(null);
    try {
      if (file.size > 4 * 1024 * 1024) throw new Error("Dosya 4 MB'tan büyük; bulutta tek seferde yüklenemez. BULUT.md'deki \"tasi:neon\" adımını kullanın.");
      const data = JSON.parse(await file.text()) as { format?: string; exportedAt?: string; tables?: Record<string, unknown[]> };
      if (data.format !== "yatirim-veri" || !data.tables) throw new Error("Bu dosya bir yatırım uygulaması veri dosyası değil.");
      const counts = Object.fromEntries(Object.entries(data.tables).map(([t, rows]) => [t, Array.isArray(rows) ? rows.length : 0]));
      setStaged({ name: file.name, data, counts, exportedAt: data.exportedAt ?? null });
    } catch (err) {
      setMsg({ ok: false, text: err instanceof SyntaxError ? "Dosya okunamadı (geçerli bir JSON değil)." : (err as Error).message });
    } finally {
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  async function restore() {
    if (!staged) return;
    if (!confirm(`"${staged.name}" geri yüklensin mi? Şu anki verilerinizin YERİNE geçecek.`)) return;
    if (!confirm("Emin misiniz? Önce mevcut verileriniz bilgisayarınıza indirilecek, sonra geri yükleme yapılacak.")) return;
    setBusy(true);
    setMsg(null);
    try {
      // Güvenlik için önce mevcut verilerin bir kopyasını indir.
      const a = document.createElement("a");
      a.href = "/api/data/export";
      a.download = "";
      a.click();
      const d = (await send("/api/data/import", "POST", { confirm: "GERI YUKLE", data: staged.data })) as { transactions: number };
      setStaged(null);
      await refreshAccounts();
      setMsg({ ok: true, text: `Geri yükleme tamamlandı (${d.transactions} işlem). Sayfalar eski görünürse sayfayı yenileyin.` });
    } catch (err) {
      if (!(err instanceof UnauthorizedError)) setMsg({ ok: false, text: (err as Error).message });
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className="space-y-4 p-4 md:p-6">
      <div id="yedek" className="scroll-mt-20">
        <h2 className="font-semibold">Yedekleme (bulut)</h2>
        <p className="mt-1 text-sm text-slate-400">
          Verileriniz bulut veritabanında (Neon) duruyor. Ara sıra &quot;Tüm verilerimi indir&quot; ile bir kopyasını bilgisayarınıza alın. Dosya ayarlarınızı (API anahtarı dahil)
          da içerir; güvenli bir yerde saklayın.
        </p>
      </div>
      <a href="/api/data/export" download className="inline-block rounded-xl bg-emerald-500 px-4 py-2.5 text-sm font-semibold text-slate-950">
        Tüm verilerimi indir (JSON)
      </a>
      <Note msg={msg} />
      <div className="rounded-xl border border-amber-500/30 p-3">
        <h3 className="text-sm font-medium">JSON&apos;dan geri yükle</h3>
        <p className="mt-1 text-xs text-slate-400">
          Daha önce indirdiğiniz .json dosyasını seçin. Onaylarsanız önce mevcut verileriniz indirilir, sonra seçtiğiniz dosya mevcut verilerin yerine yazılır.
        </p>
        <input
          ref={fileRef}
          type="file"
          accept=".json,application/json"
          disabled={busy}
          onChange={(e) => e.target.files?.[0] && void pick(e.target.files[0])}
          className="mt-2 block w-full text-sm text-slate-300 file:mr-3 file:rounded-lg file:border-0 file:bg-surface-2 file:px-3 file:py-2 file:text-slate-200"
        />
        {staged && (
          <div className="mt-3 space-y-2 text-sm">
            <ul className="num text-xs text-slate-400">
              <li>Dosya tarihi: {staged.exportedAt ? new Date(staged.exportedAt).toLocaleString("tr-TR", { timeZone: "Europe/Istanbul" }) : "—"}</li>
              <li>İşlem sayısı: {staged.counts.transactions ?? 0}</li>
              <li>Hesap sayısı: {staged.counts.accounts ?? 0}</li>
              <li>Emir sayısı: {staged.counts.orders ?? 0}</li>
            </ul>
            <div className="flex gap-2">
              <button onClick={() => void restore()} disabled={busy} className="rounded-xl bg-rose-500 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">
                {busy ? "Yükleniyor…" : "Geri yükle"}
              </button>
              <button onClick={() => setStaged(null)} className="rounded-xl border border-line px-4 py-2 text-sm text-slate-300">
                Vazgeç
              </button>
            </div>
          </div>
        )}
      </div>
      <Explain>
        Neon ayrıca veritabanını kısa bir süre geriye (ücretsiz planda son birkaç saat) döndürebilir: Neon panelinde projeniz → &quot;Restore&quot;. Bu süre kısa olduğu için
        düzenli JSON yedeği yine de önerilir.
      </Explain>
    </Card>
  );
}

// ---- Nöbet durumu ----------------------------------------------------------------------------

interface NobetStatusDto {
  mode: "bulut" | "yerel";
  lastTickAt: number | null;
  lastSource: string | null;
  expectedMaxGapMs: number;
  late: boolean;
  tasks: { name: string; label: string; lastRunAt: number | null; lastOkAt: number | null; lastError: string | null }[];
}

function ago(ms: number) {
  const min = Math.floor(ms / 60_000);
  if (min < 1) return "az önce";
  if (min < 60) return `${min} dk önce`;
  const h = Math.floor(min / 60);
  return h < 24 ? `${h} sa önce` : `${Math.floor(h / 24)} gün önce`;
}

/** "Son nöbet: x dk önce": emir / alarm kontrolünün en son ne zaman çalıştığı */
export function NobetSection() {
  const [s, setS] = useState<NobetStatusDto | null>(null);
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    let alive = true;
    const load = async () => {
      try {
        const d = await fetchJson<NobetStatusDto>("/api/cron/status");
        if (alive) {
          setS(d);
          setNow(Date.now());
        }
      } catch (err) {
        if (err instanceof UnauthorizedError) goToLogin();
      }
    };
    void load();
    const t = setInterval(() => void load(), 60_000);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, []);
  if (!s) return null;
  return (
    <Card className="space-y-2 p-4 md:p-6">
      <h2 className="font-semibold">Nöbet (otomatik kontroller)</h2>
      <p className={`text-sm ${s.late ? "text-amber-300" : "text-emerald-300"}`}>
        Son nöbet: {s.lastTickAt ? ago(now - s.lastTickAt) : "hiç çalışmadı"}
        {s.lastSource ? ` · ${s.lastSource}` : ""}
      </p>
      {s.late && (
        <p role="alert" className="rounded-xl bg-amber-500/10 px-3 py-2 text-sm text-amber-200">
          {s.mode === "bulut"
            ? `Son nöbet beklenenden eski (en fazla ${Math.round(s.expectedMaxGapMs / 60_000)} dk olmalı). Emirler ve alarmlar şu an kontrol edilmiyor olabilir: cron-job.org görevinin açık olduğunu ve CRON_SECRET başlığının doğru olduğunu kontrol edin (BULUT.md).`
            : "Yerel izleyici çalışmıyor görünüyor. Uygulamayı yeniden başlatın."}
        </p>
      )}
      <p className="text-xs text-slate-500">
        {s.mode === "bulut"
          ? "Bulut modu: dış zamanlayıcı hafta içi 09:30–18:30 her dakika, diğer zamanlarda 30 dakikada bir bekleyen emirleri, alarmları ve zamanlanmış işleri çalıştırır."
          : "Yerel mod: uygulama açıkken her 30 saniyede bir bekleyen emirler ve alarmlar kontrol edilir."}
      </p>
      {s.tasks.length > 0 && (
        <ul className="num divide-y divide-line/60 rounded-xl border border-line text-xs">
          {s.tasks.map((t) => (
            <li key={t.name} className="flex flex-wrap justify-between gap-x-3 px-3 py-1.5">
              <span className="text-slate-300">{t.label}</span>
              <span className={t.lastError ? "text-rose-300" : "text-slate-500"}>
                {t.lastRunAt ? ago(now - t.lastRunAt) : "henüz yok"}
                {t.lastError ? ` · hata: ${t.lastError.slice(0, 80)}` : ""}
              </span>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
