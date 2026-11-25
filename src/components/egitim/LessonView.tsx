"use client";

import Link from "next/link";
import { useState } from "react";
import { Card } from "@/components/ui";
import type { Lesson, LessonSummary } from "@/content/egitim/types";
import { ChartExamples } from "./ChartExamples";
import { LessonDiagram } from "./LessonDiagram";
import { CheckIcon, Disclaimer, LevelBadge } from "./common";
import { PositionCalculator } from "./PositionCalculator";
import { setLessonDone, useCompletedLessons } from "./progress";
import { Quiz } from "./Quiz";

function Section({ id, title, children }: { id: string; title: string; children: React.ReactNode }) {
  return (
    <Card className="p-4 md:p-6">
      <h2 id={id} className="mb-3 font-semibold">
        {title}
      </h2>
      {children}
    </Card>
  );
}

export function LessonView({
  lesson,
  order,
  total,
  prev,
  next,
}: {
  lesson: Lesson;
  order: number;
  total: number;
  prev: LessonSummary | null;
  next: LessonSummary | null;
}) {
  const completed = useCompletedLessons();
  const done = completed.has(lesson.slug);
  const [justFinished, setJustFinished] = useState(false);

  return (
    <article className="mx-auto max-w-3xl space-y-4 md:space-y-5">
      <div>
        <Link href="/egitim" className="-ml-1 inline-flex items-center gap-1 rounded-lg px-1 py-1 text-sm text-slate-400 hover:text-white">
          <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <path d="M15 18l-6-6 6-6" />
          </svg>
          Öğretici Analiz Desteği
        </Link>
        <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-slate-500">
          <span className="num">
            Ders {order} / {total}
          </span>
          <LevelBadge level={lesson.level} />
          <span>{lesson.minutes} dk okuma</span>
          {done && (
            <span className="inline-flex items-center gap-1 text-accent">
              <CheckIcon className="h-3.5 w-3.5" /> Tamamlandı
            </span>
          )}
        </div>
        <h1 className="mt-1 text-xl font-semibold tracking-tight md:text-2xl">{lesson.title}</h1>
      </div>

      <Section id="nedir" title="Nedir?">
        <div className="space-y-3 text-[15px] leading-relaxed text-slate-300">
          {lesson.what.map((p, i) => (
            <p key={i}>{p}</p>
          ))}
        </div>
      </Section>

      {lesson.examples.length > 0 && (
        <Section id="grafikte" title="Grafikte nasıl görünür?">
          <ChartExamples examples={lesson.examples} />
        </Section>
      )}

      {lesson.diagram && (
        <Section id="sekil" title={lesson.diagram.title}>
          <LessonDiagram id={lesson.diagram.id} />
          <p className="mt-3 text-sm leading-relaxed text-slate-300">{lesson.diagram.caption}</p>
        </Section>
      )}

      <Section id="yorum" title="Nasıl yorumlanır?">
        <ol className="space-y-2.5">
          {lesson.steps.map((s, i) => (
            <li key={i} className="flex gap-3 text-[15px] leading-relaxed text-slate-300">
              <span className="num mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-surface-2 text-xs font-semibold text-slate-200">{i + 1}</span>
              <span>{s}</span>
            </li>
          ))}
        </ol>
      </Section>

      <Section id="hatalar" title="Sık yapılan hatalar">
        <ul className="space-y-2.5">
          {lesson.mistakes.map((m, i) => (
            <li key={i} className="flex gap-3 text-[15px] leading-relaxed text-slate-300">
              <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-amber-500/15 text-sm font-bold text-amber-300" aria-hidden>
                !
              </span>
              <span>{m}</span>
            </li>
          ))}
        </ul>
      </Section>

      {lesson.extra === "positionCalculator" && (
        <Section id="hesapla" title="Pozisyon büyüklüğünü hesapla">
          <PositionCalculator />
        </Section>
      )}

      <Section id="test" title="Kendini dene">
        <Quiz
          key={lesson.slug}
          questions={lesson.quiz}
          onComplete={() => {
            if (!done) {
              setLessonDone(lesson.slug, true);
              setJustFinished(true);
            }
          }}
        />
        {justFinished && (
          <p className="mt-3 flex items-center gap-2 rounded-lg bg-emerald-500/10 px-3 py-2 text-sm text-emerald-200">
            <CheckIcon /> Ders tamamlandı olarak işaretlendi.
          </p>
        )}
      </Section>

      <Section id="uygula" title="Uygulamada dene">
        <ul className="space-y-3">
          {lesson.tryIt.map((t) => (
            <li key={t.href + t.label} className="rounded-xl border border-line bg-bg/40 p-3">
              <Link href={t.href} className="inline-flex items-center gap-1 font-medium text-accent hover:underline">
                {t.label}
                <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                  <path d="M9 6l6 6-6 6" />
                </svg>
              </Link>
              <p className="mt-1 text-sm text-slate-400">{t.hint}</p>
            </li>
          ))}
        </ul>
      </Section>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <button
          type="button"
          onClick={() => {
            setLessonDone(lesson.slug, !done);
            setJustFinished(false);
          }}
          className={`inline-flex items-center gap-2 rounded-xl border px-4 py-2.5 text-sm font-medium transition ${
            done ? "border-accent/50 bg-accent/10 text-accent" : "border-line text-slate-200 hover:bg-surface-2"
          }`}
        >
          <CheckIcon />
          {done ? "Tamamlandı (geri al)" : "Dersi tamamladım"}
        </button>
      </div>

      <nav aria-label="Dersler arası gezinme" className="grid grid-cols-2 gap-2">
        {prev ? (
          <Link href={`/egitim/${prev.slug}`} className="rounded-2xl border border-line bg-surface p-3 transition hover:bg-surface-2">
            <span className="block text-xs text-slate-500">← Önceki ders</span>
            <span className="mt-0.5 block text-sm font-medium leading-snug text-slate-200">{prev.title}</span>
          </Link>
        ) : (
          <span />
        )}
        {next ? (
          <Link href={`/egitim/${next.slug}`} className="rounded-2xl border border-line bg-surface p-3 text-right transition hover:bg-surface-2">
            <span className="block text-xs text-slate-500">Sonraki ders →</span>
            <span className="mt-0.5 block text-sm font-medium leading-snug text-slate-200">{next.title}</span>
          </Link>
        ) : (
          <Link href="/egitim" className="rounded-2xl border border-line bg-surface p-3 text-right transition hover:bg-surface-2">
            <span className="block text-xs text-slate-500">Son ders</span>
            <span className="mt-0.5 block text-sm font-medium leading-snug text-slate-200">Ders listesine dön</span>
          </Link>
        )}
      </nav>

      <Disclaimer />
    </article>
  );
}
