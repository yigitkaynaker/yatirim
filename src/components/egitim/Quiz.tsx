"use client";

import { useState } from "react";
import type { QuizQuestion } from "@/content/egitim/types";

/** "Kendini dene": her soruda tek tıkla anında geri bildirim ve açıklama */
export function Quiz({ questions, onComplete }: { questions: QuizQuestion[]; onComplete?: (correct: number) => void }) {
  const [answers, setAnswers] = useState<(number | null)[]>(() => questions.map(() => null));
  const answered = answers.filter((a) => a != null).length;
  const correct = answers.filter((a, i) => a === questions[i].answer).length;
  const done = answered === questions.length;

  function choose(qi: number, oi: number) {
    if (answers[qi] != null) return;
    const next = answers.map((a, i) => (i === qi ? oi : a));
    setAnswers(next);
    if (next.every((a) => a != null)) onComplete?.(next.filter((a, i) => a === questions[i].answer).length);
  }

  return (
    <div className="space-y-4">
      {questions.map((q, qi) => {
        const picked = answers[qi];
        const isAnswered = picked != null;
        return (
          <fieldset key={qi} className="rounded-xl border border-line bg-bg/40 p-3 sm:p-4">
            <legend className="sr-only">Soru {qi + 1}</legend>
            <p className="text-sm font-medium text-slate-100">
              <span className="mr-1.5 text-slate-500">{qi + 1}.</span>
              {q.question}
            </p>
            <div className="mt-3 grid gap-2">
              {q.options.map((opt, oi) => {
                const isRight = oi === q.answer;
                const isPicked = picked === oi;
                let cls = "border-line text-slate-300 hover:border-slate-500 hover:text-white";
                if (isAnswered) {
                  if (isRight) cls = "border-emerald-500/60 bg-emerald-500/10 text-emerald-200";
                  else if (isPicked) cls = "border-rose-500/60 bg-rose-500/10 text-rose-200";
                  else cls = "border-line text-slate-500";
                }
                return (
                  <button
                    key={oi}
                    type="button"
                    disabled={isAnswered}
                    aria-pressed={isPicked}
                    onClick={() => choose(qi, oi)}
                    className={`flex items-start gap-2 rounded-lg border px-3 py-2.5 text-left text-sm transition disabled:cursor-default ${cls}`}
                  >
                    <span className="mt-px w-4 shrink-0 text-center font-semibold" aria-hidden>
                      {isAnswered && isRight ? "✓" : isAnswered && isPicked ? "✗" : String.fromCharCode(65 + oi)}
                    </span>
                    <span>{opt}</span>
                  </button>
                );
              })}
            </div>
            {isAnswered && (
              <p role="status" className={`mt-3 rounded-lg px-3 py-2 text-sm ${picked === q.answer ? "bg-emerald-500/10 text-emerald-200" : "bg-amber-500/10 text-amber-200"}`}>
                <span className="font-semibold">{picked === q.answer ? "Doğru! " : "Tam değil. "}</span>
                {q.explanation}
              </p>
            )}
          </fieldset>
        );
      })}

      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-sm text-slate-400">
          {done ? (
            <>
              Sonuç: <span className="font-semibold text-white">{correct} / {questions.length}</span>{" "}
              {correct === questions.length ? "Harika, hepsi doğru!" : "Açıklamaları okuyup yeniden deneyebilirsin."}
            </>
          ) : (
            `${answered} / ${questions.length} soru yanıtlandı`
          )}
        </span>
        {answered > 0 && (
          <button
            type="button"
            onClick={() => setAnswers(questions.map(() => null))}
            className="rounded-lg border border-line px-3 py-1.5 text-xs text-slate-300 hover:text-white"
          >
            Yeniden dene
          </button>
        )}
      </div>
    </div>
  );
}
