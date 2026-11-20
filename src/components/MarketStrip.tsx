"use client";

import { displaySymbol, parseInstrumentId } from "@/lib/assets";
import { formatMoney, formatPercent, pnlClass } from "@/lib/format";
import type { Quote } from "@/lib/prices";
import { usePolling } from "@/lib/usePolling";
import { StaleBadge } from "./ui";

/** Üst şerit: USD/TRY, EUR/TRY, gram altın, BTC (varsayılan izleme listesi). */
export function MarketStrip() {
  const { data } = usePolling<{ quotes: Quote[] }>("/api/prices");
  const quotes = data?.quotes ?? [];
  return (
    <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 [scrollbar-width:none] md:mx-0 md:grid md:grid-cols-4 md:px-0">
      {(quotes.length ? quotes : Array.from({ length: 4 }, () => null)).map((q, i) => {
        const ref = q ? parseInstrumentId(q.id) : null;
        return (
          <div key={q?.id ?? i} className="min-w-36 shrink-0 rounded-xl border border-line bg-surface px-3 py-2">
            <div className="flex items-center justify-between gap-2 text-xs text-slate-400">
              <span>{ref ? displaySymbol(ref.type, ref.symbol) : "…"}</span>
              {q?.stale && <StaleBadge fetchedAt={q.fetchedAt} />}
            </div>
            <div className="num mt-0.5 flex items-baseline justify-between gap-2">
              <span className="font-semibold">{q ? formatMoney(q.price, q.currency || "TRY", q.price != null && q.price < 100 ? 4 : 2) : "—"}</span>
              <span className={`text-xs ${pnlClass(q?.changePct)}`}>{q ? formatPercent(q.changePct) : ""}</span>
            </div>
          </div>
        );
      })}
    </div>
  );
}
