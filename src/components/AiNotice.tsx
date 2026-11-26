import Link from "next/link";

/**
 * Yapay zeka anahtarı yokken tüm yapay zeka ekranlarında gösterilen dostça durum. shared: sahip-dışı
 * kullanıcı, uygulama sahibinin paylaşılabilir (Claude / OpenAI) anahtarı da yok.
 */
export function AiMissingKey({ compact = false, shared = false }: { compact?: boolean; shared?: boolean }) {
  const headline = shared ? "Paylaşılan yapay zeka şu an kullanılamıyor" : "Yapay zeka anahtarı eklenmedi";
  if (compact) {
    return (
      <p className="rounded-xl border border-line bg-surface px-3 py-2.5 text-sm text-slate-400">
        {headline} —{" "}
        <Link href="/ayarlar" className="text-accent underline-offset-2 hover:underline">
          {shared ? "Ayarlar'dan kendi anahtarınızı ekleyin" : "Ayarlar'dan ekleyin"}
        </Link>
        .
      </p>
    );
  }
  return (
    <div className="flex flex-col items-center justify-center rounded-2xl border border-line bg-surface p-6 text-center">
      <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-violet-500/15 text-violet-200">
        <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <path d="M15 7a4 4 0 1 1-3.9 4.9L4 19v2h3v-2h2v-2h2l1.1-1.1A4 4 0 0 1 15 7zM16 10h.01" />
        </svg>
      </div>
      <p className="font-medium">{shared ? "Paylaşılan yapay zeka şu an kullanılamıyor" : "Yapay zeka anahtarı eklenmedi — Ayarlar'dan ekleyin"}</p>
      <p className="mt-1 max-w-sm text-sm text-slate-500">
        {shared
          ? "Uygulama sahibi paylaşılan bir Claude ya da OpenAI anahtarı tanımlamamış. Kendi API anahtarınızı Ayarlar'dan ekleyerek sohbet ve haber analizini kullanabilirsiniz."
          : "Sohbet ve haber analizi için bir Claude API anahtarı gerekiyor. Ayarlar sayfasında nasıl alacağınız adım adım anlatılıyor."}
      </p>
      <Link href="/ayarlar" className="mt-4 rounded-xl bg-violet-500 px-4 py-2.5 text-sm font-semibold text-white hover:brightness-110">
        Ayarlar&apos;a git
      </Link>
    </div>
  );
}

export function BudgetLine({ spentUsd, budgetUsd }: { spentUsd: number; budgetUsd: number }) {
  const pct = budgetUsd > 0 ? Math.min(100, (spentUsd / budgetUsd) * 100) : 100;
  const over = spentUsd >= budgetUsd;
  return (
    <div>
      <div className="flex items-baseline justify-between gap-2 text-sm">
        <span className="text-slate-400">Bu ay tahmini harcama</span>
        <span className={`num font-medium ${over ? "text-rose-300" : ""}`}>
          ${spentUsd.toFixed(2)} / ${budgetUsd.toFixed(2)}
        </span>
      </div>
      <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-surface-2">
        <div className={`h-full rounded-full ${over ? "bg-rose-400" : pct > 80 ? "bg-amber-400" : "bg-accent"}`} style={{ width: `${pct}%` }} />
      </div>
      {over && <p className="mt-1.5 text-xs text-rose-300">Bütçe doldu: otomatik taramalar durdu. Elle kullanım uyarıyla çalışmaya devam eder.</p>}
    </div>
  );
}
