"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { NO_ADVICE } from "@/content/kilavuz/types";
import { TERMS, type Term } from "@/content/sozluk/terimler";
import { normalizeTr } from "@/components/help";

// SÖZLÜK sayfası: arama, A–Z gruplar, /sozluk#terim bağlantıları (ipuçlarındaki "Daha fazla").

const SORTED: Term[] = [...TERMS].sort((a, b) => a.term.localeCompare(b.term, "tr-TR"));

function letterOf(t: Term): string {
  return t.term.charAt(0).toLocaleUpperCase("tr-TR");
}

const HAY = new Map(SORTED.map((t) => [t.id, normalizeTr([t.term, ...(t.aliases ?? []), t.short, t.definition].join(" "))]));
const NAME_HAY = new Map(SORTED.map((t) => [t.id, normalizeTr([t.term, ...(t.aliases ?? [])].join(" "))]));

export function SozlukView() {
  const [query, setQuery] = useState("");
  const [target, setTarget] = useState<string | null>(null);

  // Adres #terim ile açıldıysa o terimi vurgula ve göster (aramayı temizler).
  useEffect(() => {
    const sync = () => {
      const id = decodeURIComponent(window.location.hash.slice(1));
      if (!id || !HAY.has(id)) return;
      setQuery("");
      setTarget(id);
      requestAnimationFrame(() => document.getElementById(id)?.scrollIntoView({ block: "start" }));
    };
    sync();
    window.addEventListener("hashchange", sync);
    return () => window.removeEventListener("hashchange", sync);
  }, []);

  const q = normalizeTr(query.trim());
  const list = useMemo(() => {
    if (!q) return SORTED;
    const words = q.split(/\s+/).filter(Boolean);
    const hit = SORTED.filter((t) => words.every((w) => HAY.get(t.id)!.includes(w)));
    // Adında geçenler önce
    return hit.sort((a, b) => Number(!NAME_HAY.get(a.id)!.includes(q)) - Number(!NAME_HAY.get(b.id)!.includes(q)));
  }, [q]);

  const groups = useMemo(() => {
    if (q) return [{ letter: "", items: list }];
    const m = new Map<string, Term[]>();
    for (const t of list) m.set(letterOf(t), [...(m.get(letterOf(t)) ?? []), t]);
    return [...m.entries()].map(([letter, items]) => ({ letter, items }));
  }, [list, q]);

  const letters = useMemo(() => [...new Set(SORTED.map(letterOf))], []);

  return (
    <div className="space-y-4 md:space-y-6">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">Sözlük</h1>
        <p className="mt-1 max-w-2xl text-sm text-slate-400">
          Uygulamada geçen yatırım terimleri, birer cümlelik tanım ve TL ile bir örnekle. Uygulamanın nasıl kullanıldığı için{" "}
          <Link href="/kilavuz" className="text-accent hover:underline">
            Kullanım kılavuzu
          </Link>
          &apos;na bak.
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
          placeholder="Terim ara: makas, stopaj, RSI…"
          aria-label="Sözlükte ara"
          className="w-full rounded-xl border border-line bg-surface py-2.5 pr-3 pl-9 outline-none transition focus:border-accent"
        />
      </div>

      {!q && (
        <nav aria-label="Harfler" className="flex flex-wrap gap-1">
          {letters.map((l) => (
            <a key={l} href={`#harf-${l}`} className="num flex h-8 min-w-8 items-center justify-center rounded-lg border border-line px-2 text-sm text-slate-300 hover:bg-surface-2">
              {l}
            </a>
          ))}
        </nav>
      )}

      {q && (
        <p className="text-sm text-slate-400" role="status">
          {list.length ? `${list.length} terim bulundu.` : "Bu kelimeyle terim bulunamadı. Kılavuzda aramayı deneyebilirsin."}
        </p>
      )}

      <div className="space-y-5">
        {groups.map((g) => (
          <section key={g.letter || "sonuc"} aria-label={g.letter ? `${g.letter} harfi` : "Arama sonuçları"}>
            {g.letter && (
              <h2 id={`harf-${g.letter}`} className="mb-2 scroll-mt-20 text-sm font-semibold text-slate-500">
                {g.letter}
              </h2>
            )}
            <dl className="grid gap-2 md:grid-cols-2">
              {g.items.map((t) => (
                <div
                  key={t.id}
                  id={t.id}
                  className={`scroll-mt-20 rounded-2xl border bg-surface p-4 transition ${target === t.id ? "border-accent/70 ring-2 ring-accent/30" : "border-line"}`}
                >
                  <dt className="flex items-baseline justify-between gap-2 font-semibold text-slate-100">
                    {t.term}
                    <a href={`#${t.id}`} aria-label={`${t.term} bağlantısı`} className="text-sm font-normal text-slate-600 hover:text-slate-300">
                      #
                    </a>
                  </dt>
                  <dd className="mt-1 text-sm leading-relaxed text-slate-300">{t.definition}</dd>
                  <dd className="mt-2 rounded-lg bg-bg/50 px-3 py-2 text-sm leading-relaxed text-slate-400">
                    <span className="font-medium text-slate-300">Örnek: </span>
                    {t.example}
                  </dd>
                  {t.more && (
                    <dd className="mt-2 text-xs">
                      <Link href={t.more.href} className="text-accent hover:underline">
                        {t.more.label} ›
                      </Link>
                    </dd>
                  )}
                </div>
              ))}
            </dl>
          </section>
        ))}
      </div>

      <footer className="border-t border-line/70 pt-4 text-center text-xs text-slate-500">
        {NO_ADVICE} Örneklerdeki fiyat ve oranlar yalnızca açıklama içindir; vergi oranları değişebilir.
      </footer>
    </div>
  );
}
