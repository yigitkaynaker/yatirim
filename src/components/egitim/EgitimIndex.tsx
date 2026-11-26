"use client";

import Link from "next/link";
import { Card } from "@/components/ui";
import { LEVEL_LABEL, TRACKS, type Level, type LessonSummary, type Track } from "@/content/egitim/types";
import { CheckIcon, Disclaimer, LevelBadge } from "./common";
import { setLessonDone, useCompletedLessons } from "./progress";

/** Grafik analizi bölümü seviyelere göre alt gruplara ayrılır */
const LEVELS: { level: Level; intro: string }[] = [
  { level: "baslangic", intro: "Grafik okumanın temelleri. Buradan başla." },
  { level: "orta", intro: "En sık kullanılan göstergeler ve mum formasyonları." },
  { level: "ileri", intro: "Formasyonlar, Fibonacci ve hepsini risk yönetimiyle birleştirmek." },
];

type SectionId = "grafik" | Track;

const SECTIONS: { id: SectionId; label: string; intro: string }[] = [
  { id: "grafik", label: "Grafik Analizi", intro: "Mum grafiği, trend, göstergeler ve formasyonlar." },
  ...TRACKS,
];

function sectionLessons(lessons: LessonSummary[], id: SectionId): LessonSummary[] {
  return lessons.filter((l) => (l.track ?? "grafik") === id);
}

export function EgitimIndex({ lessons }: { lessons: LessonSummary[] }) {
  const completed = useCompletedLessons();
  const doneCount = lessons.filter((l) => completed.has(l.slug)).length;
  const pct = lessons.length ? Math.round((doneCount / lessons.length) * 100) : 0;
  const next = lessons.find((l) => !completed.has(l.slug));
  const allDone = lessons.length > 0 && !next;

  return (
    <div className="space-y-4 md:space-y-6">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">Öğretici Analiz Desteği</h1>
        <p className="mt-1 max-w-2xl text-sm text-slate-400">
          Grafiklere ilk kez bakıyorsan doğru yerdesin. Yatırıma tamamen yeniysen “Temel Bilgiler” bölümüyle başlayabilirsin; kripto, hisse, ETF, emtia, döviz, altın ve fonlar için de her aracın kendi bölümü var. Her ders bir konuyu sade bir
          dille anlatır, örnek bir grafik ya da çizimle gösterir ve kısa bir testle pekiştirir. Her biri birkaç dakika sürer.
        </p>
      </div>

      <Card className="p-4 md:p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0 flex-1">
            <div className="flex items-baseline justify-between gap-2 text-sm">
              <span className="font-medium text-slate-200">İlerlemen</span>
              <span className="num text-slate-400">
                {doneCount} / {lessons.length} ders · %{pct}
              </span>
            </div>
            <div
              className="mt-2 h-2.5 overflow-hidden rounded-full bg-bg"
              role="progressbar"
              aria-valuemin={0}
              aria-valuemax={lessons.length}
              aria-valuenow={doneCount}
              aria-label="Tamamlanan dersler"
            >
              <div className="h-full rounded-full bg-accent transition-all" style={{ width: `${pct}%` }} />
            </div>
          </div>
          {next ? (
            <Link
              href={`/egitim/${next.slug}`}
              className="w-full rounded-xl bg-accent px-4 py-2.5 text-center text-sm font-semibold text-emerald-950 transition hover:brightness-110 sm:w-auto"
            >
              {doneCount === 0 ? "İlk derse başla" : "Sıradaki ders"} →
            </Link>
          ) : null}
        </div>
        {next && <p className="mt-2 text-xs text-slate-500">Sıradaki: {next.title}</p>}
        {allDone && (
          <div className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-xl bg-emerald-500/10 px-3 py-2 text-sm text-emerald-200">
            <span>Tebrikler, tüm dersleri tamamladın! Şimdi öğrendiklerini sanal portföyde deneyebilirsin.</span>
            <button
              type="button"
              onClick={() => lessons.forEach((l) => setLessonDone(l.slug, false))}
              className="rounded-lg border border-emerald-500/40 px-2.5 py-1 text-xs hover:bg-emerald-500/10"
            >
              İlerlemeyi sıfırla
            </button>
          </div>
        )}
      </Card>

      <nav aria-label="Ders bölümleri" className="-mx-1 flex flex-wrap gap-1.5">
        {SECTIONS.map((s) => {
          const group = sectionLessons(lessons, s.id);
          if (group.length === 0) return null;
          const done = group.filter((l) => completed.has(l.slug)).length;
          return (
            <a
              key={s.id}
              href={`#bolum-${s.id}`}
              className="rounded-full border border-line px-3 py-1 text-xs text-slate-300 transition hover:bg-surface-2 hover:text-white"
            >
              {s.label}{" "}
              <span className="num text-slate-500">
                {done}/{group.length}
              </span>
            </a>
          );
        })}
      </nav>

      {SECTIONS.map((s) => {
        const group = sectionLessons(lessons, s.id);
        if (group.length === 0) return null;
        return (
          <section key={s.id} id={`bolum-${s.id}`} className="scroll-mt-20 space-y-3">
            <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
              <h2 className="text-lg font-semibold tracking-tight">{s.label}</h2>
              <span className="text-xs text-slate-500">{s.intro}</span>
            </div>
            {s.id === "grafik" ? (
              LEVELS.map(({ level, intro }) => {
                const sub = group.filter((l) => l.level === level);
                if (sub.length === 0) return null;
                return (
                  <div key={level}>
                    <div className="mb-2 flex items-baseline gap-2">
                      <h3 className="text-sm font-semibold text-slate-200">{LEVEL_LABEL[level]}</h3>
                      <span className="text-xs text-slate-500">{intro}</span>
                    </div>
                    <LessonCards group={sub} lessons={lessons} completed={completed} nextSlug={next?.slug} />
                  </div>
                );
              })
            ) : (
              <LessonCards group={group} lessons={lessons} completed={completed} nextSlug={next?.slug} />
            )}
          </section>
        );
      })}

      <Disclaimer />
    </div>
  );
}

function LessonCards({
  group,
  lessons,
  completed,
  nextSlug,
}: {
  group: LessonSummary[];
  lessons: LessonSummary[];
  completed: Set<string>;
  nextSlug: string | undefined;
}) {
  return (
    <ol className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
      {group.map((l) => {
        const order = lessons.indexOf(l) + 1;
        const done = completed.has(l.slug);
        return (
          <li key={l.slug}>
            <Link
              href={`/egitim/${l.slug}`}
              className={`flex h-full gap-3 rounded-2xl border bg-surface p-4 transition hover:bg-surface-2 ${nextSlug === l.slug ? "border-accent/50" : "border-line"}`}
            >
              <span
                className={`num flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm font-semibold ${
                  done ? "bg-accent text-emerald-950" : "bg-surface-2 text-slate-300"
                }`}
                aria-label={done ? "Tamamlandı" : `${order}. ders`}
              >
                {done ? <CheckIcon /> : order}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block font-medium leading-snug text-slate-100">{l.title}</span>
                <span className="mt-1 block text-sm text-slate-400">{l.summary}</span>
                <span className="mt-2 flex flex-wrap items-center gap-2 text-xs text-slate-500">
                  <LevelBadge level={l.level} />
                  <span>{l.minutes} dk okuma</span>
                  {done && <span className="text-accent">Tamamlandı</span>}
                </span>
              </span>
            </Link>
          </li>
        );
      })}
    </ol>
  );
}
