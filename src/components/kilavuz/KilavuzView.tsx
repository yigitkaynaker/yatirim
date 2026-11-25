"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { blockText, GUIDE_SECTIONS, NO_ADVICE, plain, type Block, type GuideSection } from "@/content/kilavuz";
import { TERMS, type Term } from "@/content/sozluk/terimler";
import { Card } from "@/components/ui";
import { setFirstStepsHidden } from "@/components/FirstSteps";
import { normalizeTr } from "@/components/help";
import { GuideFigure } from "./Figures";
import { Rich } from "./Rich";

// KULLANIM KILAVUZU sayfası: arama (tarayıcıda), içindekiler, bağlantılı bölüm başlıkları.

interface Indexed {
  s: GuideSection;
  n: number;
  hay: string;
}

const INDEX: Indexed[] = GUIDE_SECTIONS.map((s, i) => ({
  s,
  n: i + 1,
  hay: normalizeTr([s.title, s.summary, ...s.blocks.map((b) => plain(blockText(b)))].join(" ")),
}));

function matches(hay: string, q: string): boolean {
  return q.split(/\s+/).filter(Boolean).every((w) => hay.includes(w));
}

export function KilavuzView() {
  const [query, setQuery] = useState("");
  const q = normalizeTr(query.trim());
  const shown = useMemo(() => (q ? INDEX.filter((x) => matches(x.hay, q)) : INDEX), [q]);
  const terms = useMemo(
    () => (q ? (TERMS as readonly Term[]).filter((t) => matches(normalizeTr([t.term, ...(t.aliases ?? [])].join(" ")), q)).slice(0, 6) : []),
    [q],
  );

  return (
    <div className="space-y-4 md:space-y-6">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">Kullanım kılavuzu</h1>
        <p className="mt-1 max-w-2xl text-sm text-slate-400">
          Uygulamanın her bölümü, hiç yatırım yapmamış biri için sade bir dille. Baştan sona okuman gerekmez: içindekilerden ya da aramadan merak ettiğin
          konuya atla. Bilmediğin bir kelime için <Link href="/sozluk" className="text-accent hover:underline">Sözlük</Link>&apos;e bak.
        </p>
      </div>

      <div className="relative">
        <svg viewBox="0 0 24 24" className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-slate-500" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" aria-hidden>
          <path d="M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14zM20 20l-4-4" />
        </svg>
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Kılavuzda ara: komisyon, bildirim, şifre…"
          aria-label="Kılavuzda ara"
          className="w-full rounded-xl border border-line bg-surface py-2.5 pr-3 pl-9 outline-none transition focus:border-accent"
        />
      </div>

      {q && (
        <p className="text-sm text-slate-400" role="status">
          {shown.length ? `${shown.length} bölüm bulundu.` : "Kılavuzda sonuç yok."}
          {terms.length > 0 && (
            <>
              {" "}Sözlükte:{" "}
              {terms.map((t, i) => (
                <span key={t.id}>
                  {i > 0 && ", "}
                  <Link href={`/sozluk#${t.id}`} className="text-sky-300 hover:underline">
                    {t.term}
                  </Link>
                </span>
              ))}
            </>
          )}
        </p>
      )}

      <div className="lg:grid lg:grid-cols-[15rem_minmax(0,1fr)] lg:gap-6">
        <nav aria-label="İçindekiler" className="mb-4 lg:mb-0">
          <details className="group rounded-2xl border border-line bg-surface lg:sticky lg:top-20 lg:max-h-[calc(100dvh-6rem)] lg:overflow-y-auto" open>
            <summary className="flex cursor-pointer list-none items-center justify-between px-4 py-3 text-sm font-semibold">
              İçindekiler
              <span className="text-slate-500 transition group-open:rotate-180" aria-hidden>
                ▾
              </span>
            </summary>
            <ol className="grid gap-0.5 px-2 pb-3 text-sm sm:grid-cols-2 lg:grid-cols-1">
              {INDEX.map(({ s, n }) => {
                const hit = !q || shown.some((x) => x.s.id === s.id);
                return (
                  <li key={s.id}>
                    <a
                      href={`#${s.id}`}
                      onClick={(e) => {
                        if (hit) return;
                        e.preventDefault();
                        setQuery("");
                        requestAnimationFrame(() => {
                          document.getElementById(s.id)?.scrollIntoView();
                          history.replaceState(null, "", `#${s.id}`);
                        });
                      }}
                      className={`flex gap-2 rounded-lg px-2 py-1.5 hover:bg-surface-2 ${hit ? "text-slate-300" : "text-slate-600"}`}>
                      <span className="num w-5 shrink-0 text-right text-slate-500">{n}.</span>
                      <span>{s.title}</span>
                    </a>
                  </li>
                );
              })}
            </ol>
          </details>
        </nav>

        <div className="min-w-0 space-y-4">
          {shown.map(({ s, n }) => (
            <SectionCard key={s.id} s={s} n={n} />
          ))}
          <footer className="border-t border-line/70 pt-4 text-center text-xs text-slate-500">
            {NO_ADVICE} Kılavuzdaki örnekler yalnızca açıklama içindir.
          </footer>
        </div>
      </div>
    </div>
  );
}

function SectionCard({ s, n }: { s: GuideSection; n: number }) {
  return (
    <Card className="scroll-mt-20 p-4 md:p-6">
      <section id={s.id} className="scroll-mt-20" aria-labelledby={`${s.id}-baslik`}>
        <h2 id={`${s.id}-baslik`} className="group flex items-baseline gap-2 text-lg font-semibold tracking-tight">
          <span className="num text-sm text-slate-500">{n}.</span>
          <span>{s.title}</span>
          <a href={`#${s.id}`} aria-label={`${s.title} bölümüne bağlantı`} className="text-sm text-slate-600 opacity-0 transition group-hover:opacity-100 focus:opacity-100">
            #
          </a>
        </h2>
        <p className="mt-1 text-sm text-slate-500">{s.summary}</p>
        <div className="mt-4 space-y-3">
          {s.blocks.map((b, i) => (
            <BlockView key={i} b={b} />
          ))}
        </div>
      </section>
    </Card>
  );
}

const ARROW = (
  <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <path d="M9 6l6 6-6 6" />
  </svg>
);

function BlockView({ b }: { b: Block }) {
  const router = useRouter();
  switch (b.type) {
    case "p":
      return (
        <p className="text-[15px] leading-relaxed text-slate-300">
          <Rich text={b.text} />
        </p>
      );
    case "h":
      return <h3 className="pt-2 font-semibold text-slate-100">{b.text}</h3>;
    case "steps":
      return (
        <ol className="space-y-2">
          {b.items.map((t, i) => (
            <li key={i} className="flex gap-3 text-[15px] leading-relaxed text-slate-300">
              <span className="num mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-surface-2 text-xs font-semibold text-slate-200">{i + 1}</span>
              <span>
                <Rich text={t} />
              </span>
            </li>
          ))}
        </ol>
      );
    case "list":
      return (
        <ul className="space-y-2">
          {b.items.map((t, i) => (
            <li key={i} className="flex gap-3 text-[15px] leading-relaxed text-slate-300">
              <span className="mt-2.5 h-1.5 w-1.5 shrink-0 rounded-full bg-slate-500" aria-hidden />
              <span>
                <Rich text={t} />
              </span>
            </li>
          ))}
        </ul>
      );
    case "tip":
      return (
        <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-3 py-2.5 text-sm leading-relaxed text-emerald-100">
          <span className="font-semibold text-emerald-300">İpucu: </span>
          <Rich text={b.text} />
        </div>
      );
    case "warn":
      return (
        <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-3 py-2.5 text-sm leading-relaxed text-amber-100">
          <span className="font-semibold text-amber-300">Dikkat: </span>
          <Rich text={b.text} />
        </div>
      );
    case "figure":
      return (
        <figure className="rounded-xl border border-line/70 bg-bg/40 p-3">
          <GuideFigure id={b.figure} />
          <figcaption className="mt-2 text-xs leading-relaxed text-slate-400">
            <span className="text-slate-500">Şekil (taslak): </span>
            {b.caption}
          </figcaption>
        </figure>
      );
    case "faq":
      return (
        <div className="divide-y divide-line/60 rounded-xl border border-line">
          {b.items.map((f) => (
            <details key={f.q} className="group px-3">
              <summary className="flex cursor-pointer list-none items-start justify-between gap-3 py-3 text-[15px] font-medium text-slate-200">
                {f.q}
                <span className="mt-0.5 text-slate-500 transition group-open:rotate-180" aria-hidden>
                  ▾
                </span>
              </summary>
              <p className="pb-3 text-sm leading-relaxed text-slate-300">
                <Rich text={f.a} />
              </p>
            </details>
          ))}
        </div>
      );
    case "open":
      return (
        <div className="flex flex-wrap items-center gap-2 pt-1">
          <span className="text-xs text-slate-500">Uygulamada aç:</span>
          {b.links.map((l) => (
            <Link key={l.href + l.label} href={l.href} className="inline-flex items-center gap-0.5 rounded-lg border border-line px-2.5 py-1.5 text-sm text-accent hover:bg-surface-2">
              {l.label}
              {ARROW}
            </Link>
          ))}
        </div>
      );
    case "checklist":
      return (
        <button
          type="button"
          onClick={() => {
            setFirstStepsHidden(false);
            router.push("/");
          }}
          className="rounded-xl border border-line px-4 py-2.5 text-sm text-slate-200 hover:bg-surface-2"
        >
          İlk adımlar kartını yeniden göster
        </button>
      );
  }
}
