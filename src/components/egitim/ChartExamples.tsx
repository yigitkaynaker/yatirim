"use client";

import { useState } from "react";
import type { ChartExample } from "@/content/egitim/types";
import { LessonChart } from "./LessonChart";

/** "Grafikte nasıl görünür?" bölümü: örnek sekmeleri, grafik ve Göster / Gizle düğmesi */
export function ChartExamples({ examples }: { examples: ChartExample[] }) {
  const [index, setIndex] = useState(0);
  const [show, setShow] = useState(true);
  const ex = examples[index] ?? examples[0];
  if (!ex) return null;

  return (
    <div>
      {examples.length > 1 && (
        <div role="tablist" aria-label="Örnekler" className="mb-3 flex flex-wrap gap-1.5">
          {examples.map((e, i) => (
            <button
              key={e.tab}
              type="button"
              role="tab"
              aria-selected={i === index}
              onClick={() => setIndex(i)}
              className={`rounded-lg border px-3 py-1.5 text-sm transition ${
                i === index ? "border-slate-500 bg-surface-2 text-white" : "border-line text-slate-400 hover:text-white"
              }`}
            >
              {e.tab}
            </button>
          ))}
        </div>
      )}

      <div className="flex items-center justify-between gap-3">
        <span className="text-xs text-slate-500">Örnek veri (gerçek bir varlık değildir)</span>
        <button
          type="button"
          aria-pressed={show}
          onClick={() => setShow((s) => !s)}
          className={`inline-flex shrink-0 items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium transition ${
            show ? "border-accent/50 bg-accent/10 text-accent" : "border-line text-slate-300 hover:text-white"
          }`}
        >
          <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            {show ? (
              <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12zM12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z" />
            ) : (
              <path d="M3 3l18 18M10.6 5.1A10.4 10.4 0 0 1 12 5c6.5 0 10 7 10 7a17.6 17.6 0 0 1-3.2 4.2M6.6 6.6C3.8 8.4 2 12 2 12s3.5 7 10 7c1.9 0 3.6-.6 5-1.5M9.9 9.9a3 3 0 0 0 4.2 4.2" />
            )}
          </svg>
          {show ? "İşaretlemeleri gizle" : "İşaretlemeleri göster"}
        </button>
      </div>

      <div className="mt-2 -mx-1">
        <LessonChart key={index} spec={ex.chart} show={show} />
      </div>

      {ex.chart.legend && ex.chart.legend.length > 0 && (
        <ul className={`mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-400 transition ${show ? "" : "opacity-40"}`}>
          {ex.chart.legend.map((l) => (
            <li key={l.label} className="flex items-center gap-1.5">
              <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: l.color }} />
              {l.label}
            </li>
          ))}
        </ul>
      )}
      <p className="mt-3 text-sm leading-relaxed text-slate-300">{ex.caption}</p>
      {!show && <p className="mt-2 text-xs text-slate-500">İpucu: Önce işaretlemeler olmadan kendin bulmaya çalış, sonra göster ve karşılaştır.</p>}
    </div>
  );
}
