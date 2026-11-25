"use client";

import { useCallback, useEffect, useState } from "react";
import { fetchJson, goToLogin, UnauthorizedError } from "@/lib/usePolling";
import { BudgetLine } from "./AiNotice";
import { AccountsSection, BackupSection, NobetSection } from "./DataSettings";
import { Card, Field, inputCls, PrimaryButton, Segmented } from "./ui";
import { useHashScroll } from "./help";

interface SettingsData {
  /** owner: sahibin anahtarı paylaşımlı kullanılıyor (anahtarın kendisi gösterilmez) */
  key: { source: "env" | "db" | "owner" | null; masked: string | null };
  isOwner?: boolean;
  sharedAi?: { active: boolean; dailyLimit: number; usedToday: number; globalLimit?: number; totalToday?: number };
  settings: { model: "ekonomik" | "gelismis"; scheduleEnabled: boolean; scheduleTimes: string[]; maxSearches: number; budgetUsd: number };
  models: { key: string; id: string; label: string; inputPerMTok: number; outputPerMTok: number }[];
  budget: { spentUsd: number; budgetUsd: number; overBudget: boolean; searches: number; calls: number };
  savings?: { searches: number; usd: number };
  signalAlerts: boolean;
  kapNotify: "real" | "all" | "off";
  withholding?: { bist: number; foreign: number };
}

type Msg = { ok: boolean; text: string } | null;

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

function Note({ msg }: { msg: Msg }) {
  if (!msg) return null;
  return (
    <p role="status" className={`rounded-xl px-3 py-2 text-sm ${msg.ok ? "bg-emerald-500/10 text-emerald-300" : "bg-rose-500/10 text-rose-300"}`}>
      {msg.text}
    </p>
  );
}

export function SettingsView() {
  const [data, setData] = useState<SettingsData | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  useHashScroll();

  const load = useCallback(async () => {
    try {
      setData(await fetchJson<SettingsData>("/api/settings"));
      setLoadError(null);
    } catch (err) {
      if (err instanceof UnauthorizedError) return goToLogin();
      setLoadError("Ayarlar yüklenemedi.");
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load]);

  return (
    <div className="space-y-4 md:space-y-6">
      <h1 className="text-xl font-semibold tracking-tight">Ayarlar</h1>
      <UserSection />
      <AccountsSection />
      <BackupSection />
      <NobetSection />
      {loadError && <Note msg={{ ok: false, text: loadError }} />}
      {!data ? (
        !loadError && <p className="text-sm text-slate-500">Yükleniyor…</p>
      ) : (
        <>
          <KeySection data={data} onChange={setData} />
          {data.isOwner && data.sharedAi && <SharedAiLimitSection data={data} onChange={setData} />}
          <AiSettingsSection key={JSON.stringify(data.settings)} data={data} onChange={setData} />
          <SignalAlertsSection data={data} onChange={setData} />
          <KapSection data={data} onChange={setData} />
          <WithholdingSection data={data} onChange={setData} />
        </>
      )}
      <PushSection />
    </div>
  );
}

// ---- API anahtarı -------------------------------------------------------------------

function KeySection({ data, onChange }: { data: SettingsData; onChange: (d: SettingsData) => void }) {
  const [value, setValue] = useState("");
  const [busy, setBusy] = useState<"save" | "delete" | "test" | null>(null);
  const [msg, setMsg] = useState<Msg>(null);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy("save");
    setMsg(null);
    try {
      const r = (await send("/api/settings/key", "POST", { apiKey: value })) as Pick<SettingsData, "key">;
      onChange({ ...data, key: r.key });
      setValue("");
      setMsg({ ok: true, text: "Anahtar kaydedildi. Şimdi \"Bağlantıyı test et\" ile deneyebilirsiniz." });
    } catch (err) {
      if (!(err instanceof UnauthorizedError)) setMsg({ ok: false, text: (err as Error).message });
    } finally {
      setBusy(null);
    }
  }

  async function remove() {
    if (!confirm("Kayıtlı anahtar silinsin mi?")) return;
    setBusy("delete");
    setMsg(null);
    try {
      const r = (await send("/api/settings/key", "DELETE")) as Pick<SettingsData, "key">;
      onChange({ ...data, key: r.key });
      setMsg({ ok: true, text: "Anahtar silindi." });
    } catch (err) {
      if (!(err instanceof UnauthorizedError)) setMsg({ ok: false, text: (err as Error).message });
    } finally {
      setBusy(null);
    }
  }

  async function test() {
    setBusy("test");
    setMsg(null);
    try {
      const r = (await send("/api/ai/test", "POST")) as { ok: boolean; message: string };
      setMsg({ ok: r.ok, text: r.message });
    } catch (err) {
      if (!(err instanceof UnauthorizedError)) setMsg({ ok: false, text: (err as Error).message });
    } finally {
      setBusy(null);
    }
  }

  const { source, masked } = data.key;

  return (
    <Card className="space-y-4 p-4 md:p-6">
      <div id="anahtar" className="scroll-mt-20">
        <h2 className="font-semibold">Yapay zeka anahtarı</h2>
        <p className="mt-1 text-sm text-slate-500">Sohbet ve haber analizi Claude yapay zekasını kullanır. Bunun için bir API anahtarı gerekir.</p>
      </div>

      {source === "owner" && data.sharedAi && (
        <p className="rounded-xl bg-sky-500/10 px-3 py-2 text-sm text-sky-200">
          Kendi anahtarınız olmadığı için uygulama sahibinin yapay zeka erişimi kullanılıyor. Günde en fazla{" "}
          <b className="num">{data.sharedAi.dailyLimit}</b> istek yapabilirsiniz (bugün <span className="num">{data.sharedAi.usedToday}</span> kullanıldı). Otomatik
          (zamanlanmış) haber taraması bu durumda çalışmaz. Kendi anahtarınızı eklerseniz sınır kalkar.
        </p>
      )}

      <div className="flex flex-wrap items-center gap-2 rounded-xl border border-line bg-bg px-3 py-2.5 text-sm">
        {source === "owner" ? (
          <>
            <span className="h-2 w-2 rounded-full bg-sky-400" />
            <span className="text-slate-300">Uygulama sahibinin erişimi (paylaşımlı)</span>
          </>
        ) : source ? (
          <>
            <span className="h-2 w-2 rounded-full bg-emerald-400" />
            <span className="num font-mono">{masked}</span>
            <span className="text-slate-500">{source === "env" ? "(.env dosyasından)" : "(Ayarlar'dan kaydedildi)"}</span>
          </>
        ) : (
          <>
            <span className="h-2 w-2 rounded-full bg-slate-500" />
            <span className="text-slate-400">Anahtar eklenmedi</span>
          </>
        )}
      </div>

      {source === "env" ? (
        <p className="text-sm text-slate-500">
          Anahtar <code>.env</code> dosyasındaki <code>ANTHROPIC_API_KEY</code> değerinden geliyor ve önceliklidir. Değiştirmek için .env dosyasını düzenleyip sunucuyu yeniden başlatın.
        </p>
      ) : (
        <form onSubmit={save} className="space-y-2">
          <Field label={source && source !== "owner" ? "Anahtarı değiştir" : "Kendi anahtarınızı yapıştırın"} hint="Anahtar bu bilgisayardaki veritabanında saklanır ve ekranda yalnızca maskeli gösterilir.">
            <input
              type="password"
              autoComplete="off"
              spellCheck={false}
              value={value}
              onChange={(e) => setValue(e.target.value)}
              placeholder="sk-ant-..."
              className={`${inputCls} font-mono`}
            />
          </Field>
          <div className="flex flex-wrap gap-2">
            <PrimaryButton type="submit" tone="virtual" disabled={!value.trim() || busy !== null}>
              {busy === "save" ? "Kaydediliyor…" : "Kaydet"}
            </PrimaryButton>
            {source === "db" && (
              <button type="button" onClick={remove} disabled={busy !== null} className="rounded-xl border border-line px-4 py-2.5 text-sm text-rose-300 hover:bg-surface-2 disabled:opacity-50">
                {busy === "delete" ? "Siliniyor…" : "Anahtarı sil"}
              </button>
            )}
          </div>
        </form>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={test}
          disabled={busy !== null || !source}
          className="rounded-xl border border-line bg-surface-2 px-4 py-2.5 text-sm font-medium hover:brightness-125 disabled:opacity-50"
        >
          {busy === "test" ? "Deneniyor…" : "Bağlantıyı test et"}
        </button>
        <span className="text-xs text-slate-500">Çok küçük bir istek gönderir (maliyeti binde birkaç sent).</span>
      </div>
      <Note msg={msg} />

      <details className="rounded-xl border border-line bg-bg px-3 py-2.5 text-sm">
        <summary className="cursor-pointer font-medium text-slate-200">Anahtarı nasıl alırım?</summary>
        <ol className="mt-2 list-decimal space-y-1.5 pl-5 text-slate-400">
          <li>
            <a href="https://console.anthropic.com" target="_blank" rel="noreferrer" className="text-accent">
              console.anthropic.com
            </a>{" "}
            adresinde ücretsiz hesap açın.
          </li>
          <li>
            <b>Billing</b> bölümünden kredi yükleyin (başlangıç için 5 $ yeterli). Kredi olmadan anahtar çalışmaz.
          </li>
          <li>
            <b>API Keys</b> › <b>Create Key</b> ile bir anahtar oluşturun ve kopyalayın (yalnızca bir kez gösterilir).
          </li>
          <li>Buraya yapıştırıp Kaydet&apos;e, sonra &quot;Bağlantıyı test et&quot;e basın.</li>
        </ol>
        <p className="mt-2 text-xs text-slate-500">Harcamayı aşağıdaki aylık bütçeyle sınırlayabilirsiniz. Console&apos;da da harcama limiti koymanız önerilir.</p>
      </details>
    </Card>
  );
}

// ---- Hesap (giriş bilgileri) ------------------------------------------------------------

interface AccountInfo {
  user: { id: number; email: string | null; isOwner: boolean } | null;
}

function UserSection() {
  const [info, setInfo] = useState<AccountInfo | null>(null);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<Msg>(null);

  useEffect(() => {
    fetchJson<AccountInfo>("/api/account")
      .then((d) => {
        setInfo(d);
        setEmail(d.user?.email ?? "");
      })
      .catch((err) => {
        if (err instanceof UnauthorizedError) goToLogin();
      });
  }, []);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMsg(null);
    try {
      const d = (await send("/api/account", "POST", { email: email.trim(), password })) as AccountInfo;
      setInfo(d);
      setPassword("");
      setMsg({ ok: true, text: "Giriş bilgileri kaydedildi. Artık bu e-posta ve şifreyle de girebilirsiniz." });
    } catch (err) {
      if (!(err instanceof UnauthorizedError)) setMsg({ ok: false, text: (err as Error).message });
    } finally {
      setBusy(false);
    }
  }

  const u = info?.user;
  if (!u) return null;
  return (
    <Card className="space-y-3 p-4 md:p-6">
      <div id="hesabim" className="scroll-mt-20">
        <h2 className="font-semibold">Hesabım</h2>
        <p className="mt-1 text-sm text-slate-500">
          {u.email ? (
            <>
              Giriş e-postası: <b className="text-slate-300">{u.email}</b>
            </>
          ) : (
            "Bu hesaba henüz giriş e-postası tanımlanmadı; uygulama şifresiyle (e-posta boş) giriliyor."
          )}
          {" "}Verileriniz yalnızca bu hesapta görünür.
        </p>
      </div>
      {u.email && <ChangePasswordForm />}
      {u.isOwner && (
        <form onSubmit={save} className="space-y-2">
          <p className="text-sm text-slate-400">
            Uygulama sahibi olarak isterseniz kendinize e-posta + şifre tanımlayabilirsiniz (isteğe bağlı). Uygulama şifresiyle girmeye devam edebilirsiniz.
          </p>
          <div className="grid gap-2 md:grid-cols-2">
            <Field label="E-posta">
              <input type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} className={inputCls} />
            </Field>
            <Field label="Yeni şifre" hint="En az 8 karakter.">
              <input type="password" autoComplete="new-password" minLength={8} value={password} onChange={(e) => setPassword(e.target.value)} className={inputCls} />
            </Field>
          </div>
          <PrimaryButton type="submit" tone="virtual" disabled={busy || !email.trim() || password.length < 8}>
            {busy ? "Kaydediliyor…" : "Giriş bilgilerini kaydet"}
          </PrimaryButton>
          <Note msg={msg} />
        </form>
      )}
    </Card>
  );
}

function ChangePasswordForm() {
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [next2, setNext2] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<Msg>(null);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (next !== next2) return setMsg({ ok: false, text: "Yeni şifreler aynı değil." });
    setBusy(true);
    setMsg(null);
    try {
      await send("/api/account", "PUT", { currentPassword: current, newPassword: next });
      setCurrent("");
      setNext("");
      setNext2("");
      setMsg({ ok: true, text: "Şifreniz değiştirildi." });
    } catch (err) {
      if (!(err instanceof UnauthorizedError)) setMsg({ ok: false, text: (err as Error).message });
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={save} className="space-y-2">
      <h3 className="text-sm font-medium text-slate-200">Şifre değiştir</h3>
      <div className="grid gap-2 md:grid-cols-3">
        <Field label="Mevcut şifre">
          <input type="password" autoComplete="current-password" value={current} onChange={(e) => setCurrent(e.target.value)} className={inputCls} />
        </Field>
        <Field label="Yeni şifre" hint="En az 8 karakter.">
          <input type="password" autoComplete="new-password" minLength={8} value={next} onChange={(e) => setNext(e.target.value)} className={inputCls} />
        </Field>
        <Field label="Yeni şifre (tekrar)">
          <input type="password" autoComplete="new-password" minLength={8} value={next2} onChange={(e) => setNext2(e.target.value)} className={inputCls} />
        </Field>
      </div>
      <PrimaryButton type="submit" tone="virtual" disabled={busy || !current || next.length < 8 || !next2}>
        {busy ? "Kaydediliyor…" : "Şifreyi değiştir"}
      </PrimaryButton>
      <Note msg={msg} />
    </form>
  );
}

// ---- Paylaşılan yapay zeka sınırı (yalnızca sahip) --------------------------------------

function SharedAiLimitSection({ data, onChange }: { data: SettingsData; onChange: (d: SettingsData) => void }) {
  const [value, setValue] = useState(String(data.sharedAi?.dailyLimit ?? 50));
  const [total, setTotal] = useState(String(data.sharedAi?.globalLimit ?? 300));
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<Msg>(null);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMsg(null);
    try {
      onChange((await send("/api/settings", "PUT", { sharedAiDailyLimit: value, sharedAiGlobalLimit: total })) as SettingsData);
      setMsg({ ok: true, text: "Kaydedildi." });
    } catch (err) {
      if (!(err instanceof UnauthorizedError)) setMsg({ ok: false, text: (err as Error).message });
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className="space-y-3 p-4 md:p-6">
      <div id="paylasilan-yz" className="scroll-mt-20">
        <h2 className="font-semibold">Diğer kullanıcılar için yapay zeka sınırı</h2>
        <p className="mt-1 text-sm text-slate-500">
          Kendi anahtarı olmayan kullanıcılar sizin yapay zeka anahtarınızı kullanır (anahtarınızı göremezler). Maliyeti sınırlamak için kullanıcı başına
          günlük istek sınırı ve tüm kullanıcılar için toplam günlük tavan uygulanır; sizin için sınır yoktur. Otomatik haber taraması bu kullanıcılarda çalışmaz. 0: paylaşım kapalı.
          {data.sharedAi?.totalToday != null && <> Bugün toplam <span className="num">{data.sharedAi.totalToday}</span> istek yapıldı.</>}
        </p>
      </div>
      <form onSubmit={save} className="flex flex-wrap items-end gap-2">
        <Field label="Günlük istek sınırı (kullanıcı başına)">
          <input inputMode="numeric" value={value} onChange={(e) => setValue(e.target.value)} className={`${inputCls} w-32`} />
        </Field>
        <Field label="Toplam günlük tavan (tüm kullanıcılar)">
          <input inputMode="numeric" value={total} onChange={(e) => setTotal(e.target.value)} className={`${inputCls} w-32`} />
        </Field>
        <PrimaryButton type="submit" tone="virtual" disabled={busy}>
          {busy ? "Kaydediliyor…" : "Kaydet"}
        </PrimaryButton>
      </form>
      <Note msg={msg} />
    </Card>
  );
}

// ---- Model, takvim, bütçe ---------------------------------------------------------------

function AiSettingsSection({ data, onChange }: { data: SettingsData; onChange: (d: SettingsData) => void }) {
  const s = data.settings;
  const [model, setModel] = useState(s.model);
  const [enabled, setEnabled] = useState(s.scheduleEnabled);
  const [times, setTimes] = useState(s.scheduleTimes.join(", "));
  const [maxSearches, setMaxSearches] = useState(String(s.maxSearches));
  const [budget, setBudget] = useState(String(s.budgetUsd).replace(".", ","));
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<Msg>(null);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMsg(null);
    try {
      const r = (await send("/api/settings", "PUT", {
        model,
        scheduleEnabled: enabled,
        scheduleTimes: times,
        maxSearches,
        budgetUsd: budget,
      })) as SettingsData;
      onChange(r);
      setMsg({ ok: true, text: "Ayarlar kaydedildi." });
    } catch (err) {
      if (!(err instanceof UnauthorizedError)) setMsg({ ok: false, text: (err as Error).message });
    } finally {
      setBusy(false);
    }
  }

  const n = Math.max(0, Math.round(Number(maxSearches) || 0));
  const scansPerMonth = enabled ? times.split(/[,\s]+/).filter(Boolean).length * 22 : 0;

  return (
    <Card className="p-4 md:p-6">
      <form onSubmit={save} className="space-y-5">
        <div>
          <h2 className="font-semibold">Yapay zeka ayarları</h2>
          <p className="mt-1 text-sm text-slate-500">Tüm tutarlar tahminidir; asıl fatura Claude Console&apos;dadır.</p>
        </div>

        <Field label="Model" hint={model === "ekonomik" ? "Hızlı ve çok ucuz. Günlük kullanım için önerilir." : "Daha derin analiz, yaklaşık 20 kat pahalı."}>
          <Segmented<"ekonomik" | "gelismis">
            value={model}
            onChange={setModel}
            options={[
              { value: "ekonomik", label: "Ekonomik (Haiku)", activeCls: "bg-violet-500/20 text-violet-200" },
              { value: "gelismis", label: "Gelişmiş (Sonnet)", activeCls: "bg-violet-500/20 text-violet-200" },
            ]}
          />
        </Field>

        <div className="space-y-3 rounded-xl border border-line bg-bg p-3">
          <label className="flex items-center justify-between gap-3">
            <span>
              <span className="block text-sm text-slate-200">Otomatik haber taraması</span>
              <span className="block text-xs text-slate-500">Hafta içi, İstanbul saatiyle. Portföy, izleme listesi ve emirlerdeki varlıklar taranır.</span>
            </span>
            <input type="checkbox" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} className="h-5 w-5 shrink-0 accent-violet-500" />
          </label>
          {enabled && (
            <Field label="Tarama saatleri" hint="Virgülle ayırın. Örnek: 09:45, 13:00, 18:30">
              <input value={times} onChange={(e) => setTimes(e.target.value)} className={inputCls} inputMode="numeric" />
            </Field>
          )}
        </div>

        <Field
          label="Tarama başına en fazla web araması"
          hint={`Her arama ~0,01 $ tutar ve maliyetin çoğunu oluşturur. 0: web araması kapalı.${
            scansPerMonth ? ` Otomatik taramalarla ayda en fazla ~${scansPerMonth * n} arama (~${(scansPerMonth * n * 0.01).toFixed(2).replace(".", ",")} $).` : ""
          }`}
        >
          <input value={maxSearches} onChange={(e) => setMaxSearches(e.target.value)} className={inputCls} inputMode="numeric" />
        </Field>

        <Field label="Aylık bütçe (USD)" hint="Bütçe dolunca otomatik taramalar durur; sohbet ve elle analiz uyarıyla çalışmaya devam eder.">
          <input value={budget} onChange={(e) => setBudget(e.target.value)} className={inputCls} inputMode="decimal" />
        </Field>

        <BudgetLine spentUsd={data.budget.spentUsd} budgetUsd={data.budget.budgetUsd} />
        <p className="text-xs text-slate-500">
          Bu ay {data.budget.calls} istek, {data.budget.searches} web araması.
        </p>
        {data.savings && (
          <p className="text-xs text-emerald-300" title="Haber taramasında önce ücretsiz Google Haberler / Yahoo başlıkları ve KAP bildirimleri kullanılır; bu sayede yapılmayan ücretli aramaların tahmini tutarı.">
            Bu ay ücretsiz kaynaklarla tasarruf: ~$
            {data.savings.usd.toLocaleString("tr-TR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ({data.savings.searches} ücretli arama yapılmadı)
          </p>
        )}

        <Note msg={msg} />
        <PrimaryButton type="submit" tone="virtual" disabled={busy}>
          {busy ? "Kaydediliyor…" : "Ayarları kaydet"}
        </PrimaryButton>
      </form>
    </Card>
  );
}

// ---- Teknik sinyal uyarıları ---------------------------------------------------------

function SignalAlertsSection({ data, onChange }: { data: SettingsData; onChange: (d: SettingsData) => void }) {
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<Msg>(null);

  async function toggle(on: boolean) {
    setBusy(true);
    setMsg(null);
    try {
      onChange((await send("/api/settings", "PUT", { signalAlerts: on })) as SettingsData);
      setMsg({ ok: true, text: on ? "Sinyal uyarıları açıldı." : "Sinyal uyarıları kapatıldı." });
    } catch (err) {
      if (!(err instanceof UnauthorizedError)) setMsg({ ok: false, text: (err as Error).message });
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className="space-y-3 p-4 md:p-6">
      <label className="flex items-center justify-between gap-3">
        <span>
          <span className="block font-semibold">Teknik sinyal uyarıları</span>
          <span className="mt-1 block text-sm text-slate-500">
            Her gün 19:00&apos;dan sonra (İstanbul) portföy ve izleme listenizdeki varlıkların teknik sinyali kontrol edilir. Bir varlığın özeti
            değişirse (örn. Nötr → Al) bildirim ve anlık bildirim gönderilir. Sunucu çalışırken yapılır.
          </span>
        </span>
        <input
          type="checkbox"
          checked={data.signalAlerts}
          disabled={busy}
          onChange={(e) => toggle(e.target.checked)}
          className="h-5 w-5 shrink-0 accent-emerald-500"
        />
      </label>
      <p className="text-xs text-slate-500">Teknik sinyaller geçmiş fiyatlara dayanır, geleceği garanti etmez; yatırım tavsiyesi değildir.</p>
      <Note msg={msg} />
    </Card>
  );
}

// ---- KAP bildirimleri ------------------------------------------------------------------

type KapScope = SettingsData["kapNotify"];

function KapSection({ data, onChange }: { data: SettingsData; onChange: (d: SettingsData) => void }) {
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<Msg>(null);

  async function change(v: KapScope) {
    setBusy(true);
    setMsg(null);
    try {
      onChange((await send("/api/settings", "PUT", { kapNotify: v })) as SettingsData);
      setMsg({ ok: true, text: "KAP bildirim ayarı kaydedildi." });
    } catch (err) {
      if (!(err instanceof UnauthorizedError)) setMsg({ ok: false, text: (err as Error).message });
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className="space-y-3 p-4 md:p-6">
      <div>
        <span className="block font-semibold">KAP bildirimleri</span>
        <span className="mt-1 block text-sm text-slate-500">
          KAP, borsadaki şirketlerin resmi açıklamalarını yaptığı sitedir. Hafta içi 08:00–22:00 arasında 10 dakikada bir kontrol edilir; portföyünüzdeki bir
          hisse için yeni açıklama gelince bildirim ve anlık bildirim gönderilir. Sık tekrarlanan teknik duyurular (devre kesici vb.) bildirim üretmez.
        </span>
      </div>
      <div className={busy ? "pointer-events-none opacity-60" : ""}>
        <Segmented<KapScope>
          value={data.kapNotify}
          onChange={change}
          options={[
            { value: "real", label: "Yalnız gerçek" },
            { value: "all", label: "Gerçek + sanal" },
            { value: "off", label: "Kapalı" },
          ]}
        />
      </div>
      <p className="text-xs text-slate-500">Bildirim kapalı olsa da açıklamalar KAP sayfasında ve varlık detayında görünmeye devam eder.</p>
      <Note msg={msg} />
    </Card>
  );
}

// ---- Temettü stopajı -------------------------------------------------------------------

function WithholdingSection({ data, onChange }: { data: SettingsData; onChange: (d: SettingsData) => void }) {
  const w = data.withholding ?? { bist: 15, foreign: 15 };
  const [bist, setBist] = useState(String(w.bist).replace(".", ","));
  const [foreign, setForeign] = useState(String(w.foreign).replace(".", ","));
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<Msg>(null);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMsg(null);
    try {
      onChange((await send("/api/settings", "PUT", { withholding: { bist, foreign } })) as SettingsData);
      setMsg({ ok: true, text: "Stopaj oranları kaydedildi." });
    } catch (err) {
      if (!(err instanceof UnauthorizedError)) setMsg({ ok: false, text: (err as Error).message });
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className="p-4 md:p-6">
      <form onSubmit={save} className="space-y-3">
        <div>
          <span className="block font-semibold">Temettü stopajı</span>
          <span className="mt-1 block text-sm text-slate-500">
            Stopaj, temettü ödenirken kaynağında kesilen vergidir. Temettü önerileri brüt tutardan bu oran düşülerek NET (hesabınıza geçecek) tutarla gösterilir.
            Türkiye&apos;de bireysel yatırımcı için kâr payı stopajı genelde %15, ABD hisselerinde W-8BEN formu varsa %15&apos;tir. Oranlar değişebilir; kendi
            durumunuza göre düzenleyin.
          </span>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="BIST hisseleri (%)">
            <input value={bist} onChange={(e) => setBist(e.target.value)} className={inputCls} inputMode="decimal" />
          </Field>
          <Field label="Yabancı hisseler (%)">
            <input value={foreign} onChange={(e) => setForeign(e.target.value)} className={inputCls} inputMode="decimal" />
          </Field>
        </div>
        <Note msg={msg} />
        <PrimaryButton type="submit" disabled={busy}>
          {busy ? "Kaydediliyor…" : "Kaydet"}
        </PrimaryButton>
      </form>
    </Card>
  );
}

// ---- Bildirimler (Web Push) ------------------------------------------------------------

function urlBase64ToUint8Array(base64: string): Uint8Array<ArrayBuffer> {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const b64 = (base64 + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(b64);
  const out = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

interface PushInfo {
  publicKey: string;
  devices: { id: number; endpointHost: string; userAgent: string | null; createdAt: string; lastOkAt: string | null }[];
}

function deviceName(ua: string | null) {
  if (!ua) return "Bilinmeyen cihaz";
  const os = /iPhone|iPad/.test(ua) ? "iPhone/iPad" : /Android/.test(ua) ? "Android" : /Windows/.test(ua) ? "Windows" : /Mac OS/.test(ua) ? "Mac" : "Cihaz";
  const br = /Edg\//.test(ua) ? "Edge" : /Chrome\//.test(ua) ? "Chrome" : /Firefox\//.test(ua) ? "Firefox" : /Safari\//.test(ua) ? "Safari" : "";
  return [os, br].filter(Boolean).join(" · ");
}

function PushSection() {
  const [info, setInfo] = useState<PushInfo | null>(null);
  const [endpoint, setEndpoint] = useState<string | null>(null);
  const [support, setSupport] = useState<"ok" | "insecure" | "unsupported" | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<Msg>(null);

  const load = useCallback(async () => {
    try {
      setInfo(await fetchJson<PushInfo>("/api/push"));
    } catch (err) {
      if (err instanceof UnauthorizedError) return goToLogin();
    }
    if (!window.isSecureContext) return setSupport("insecure");
    if (!("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) return setSupport("unsupported");
    setSupport("ok");
    const reg = await navigator.serviceWorker.getRegistration("/");
    const sub = await reg?.pushManager.getSubscription();
    setEndpoint(sub?.endpoint ?? null);
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load]);

  async function enable() {
    if (!info) return;
    setBusy(true);
    setMsg(null);
    try {
      const perm = await Notification.requestPermission();
      if (perm !== "granted") throw new Error("Bildirim izni verilmedi. Tarayıcı ayarlarından bu site için bildirimlere izin verin.");
      const reg = (await navigator.serviceWorker.getRegistration("/")) ?? (await navigator.serviceWorker.register("/sw.js", { scope: "/" }));
      await navigator.serviceWorker.ready;
      let sub = await reg.pushManager.getSubscription();
      if (!sub) sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlBase64ToUint8Array(info.publicKey) });
      await send("/api/push/subscribe", "POST", sub.toJSON());
      setEndpoint(sub.endpoint);
      setMsg({ ok: true, text: "Bildirimler bu cihazda açıldı." });
      await load();
    } catch (err) {
      if (!(err instanceof UnauthorizedError)) setMsg({ ok: false, text: (err as Error).message || "Bildirimler açılamadı." });
    } finally {
      setBusy(false);
    }
  }

  async function disable() {
    setBusy(true);
    setMsg(null);
    try {
      const reg = await navigator.serviceWorker.getRegistration("/");
      const sub = await reg?.pushManager.getSubscription();
      if (sub) {
        await send("/api/push/unsubscribe", "POST", { endpoint: sub.endpoint });
        await sub.unsubscribe();
      }
      setEndpoint(null);
      setMsg({ ok: true, text: "Bu cihazda bildirimler kapatıldı." });
      await load();
    } catch (err) {
      if (!(err instanceof UnauthorizedError)) setMsg({ ok: false, text: (err as Error).message });
    } finally {
      setBusy(false);
    }
  }

  async function test() {
    setBusy(true);
    setMsg(null);
    try {
      const r = (await send("/api/push/test", "POST")) as { sent: number; failed: number };
      setMsg(r.sent > 0 ? { ok: true, text: `Deneme bildirimi ${r.sent} cihaza gönderildi.` } : { ok: false, text: "Gönderilecek cihaz yok ya da gönderim başarısız." });
    } catch (err) {
      if (!(err instanceof UnauthorizedError)) setMsg({ ok: false, text: (err as Error).message });
    } finally {
      setBusy(false);
    }
  }

  async function removeDevice(id: number) {
    await send("/api/push/unsubscribe", "POST", { id }).catch(() => {});
    await load();
  }

  return (
    <Card className="space-y-4 p-4 md:p-6">
      <div id="bildirimler" className="scroll-mt-20">
        <h2 className="font-semibold">Bildirimler</h2>
        <p className="mt-1 text-sm text-slate-500">
          Emir gerçekleşince ya da başarısız olunca, önemli (4–5) haberlerde ve teknik sinyal değişince bu cihaza anlık bildirim gönderilir. Uygulama içi zil aynı şekilde çalışmaya devam eder.
        </p>
      </div>

      {support === "insecure" && (
        <p className="rounded-xl bg-amber-500/10 px-3 py-2 text-sm text-amber-200">
          Anlık bildirimler yalnızca HTTPS bağlantıda (ya da bu bilgisayarda localhost üzerinden) çalışır. Telefonda README&apos;deki <code>tailscale serve</code> adımıyla açılan https adresini kullanın.
        </p>
      )}
      {support === "unsupported" && (
        <p className="rounded-xl bg-amber-500/10 px-3 py-2 text-sm text-amber-200">
          Bu tarayıcı anlık bildirimleri desteklemiyor. iPhone&apos;da önce uygulamayı ana ekrana ekleyin, sonra oradan açıp tekrar deneyin.
        </p>
      )}

      {support === "ok" && (
        <div className="flex flex-wrap gap-2">
          {endpoint ? (
            <>
              <span className="inline-flex items-center gap-2 rounded-xl bg-emerald-500/10 px-3 py-2.5 text-sm text-emerald-300">
                <span className="h-2 w-2 rounded-full bg-emerald-400" /> Bu cihazda açık
              </span>
              <button onClick={test} disabled={busy} className="rounded-xl border border-line bg-surface-2 px-4 py-2.5 text-sm hover:brightness-125 disabled:opacity-50">
                Deneme bildirimi gönder
              </button>
              <button onClick={disable} disabled={busy} className="rounded-xl border border-line px-4 py-2.5 text-sm text-slate-300 hover:bg-surface-2 disabled:opacity-50">
                Bu cihazda kapat
              </button>
            </>
          ) : (
            <PrimaryButton onClick={enable} disabled={busy || !info}>
              {busy ? "Açılıyor…" : "Bildirimleri aç"}
            </PrimaryButton>
          )}
        </div>
      )}
      <Note msg={msg} />

      {info && info.devices.length > 0 && (
        <div>
          <div className="mb-1.5 text-sm text-slate-400">Kayıtlı cihazlar</div>
          <ul className="divide-y divide-line/70 rounded-xl border border-line">
            {info.devices.map((d) => (
              <li key={d.id} className="flex items-center gap-3 px-3 py-2 text-sm">
                <div className="min-w-0 flex-1">
                  <div className="truncate">{deviceName(d.userAgent)}</div>
                  <div className="truncate text-xs text-slate-500">
                    {d.endpointHost} · eklendi {d.createdAt.slice(0, 10)}
                  </div>
                </div>
                <button onClick={() => removeDevice(d.id)} className="shrink-0 rounded-lg px-2 py-1 text-xs text-slate-400 hover:text-rose-300">
                  Kaldır
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </Card>
  );
}
