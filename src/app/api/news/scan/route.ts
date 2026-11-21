import { NextResponse } from "next/server";
import { handle } from "@/lib/api";
import { ScanBusyError, startNewsScan } from "@/lib/news";
import { getBudgetStatus, NoApiKeyError } from "@/lib/aiClient";

export const dynamic = "force-dynamic";
// Bulut modunda tarama yanıttan sonra aynı işlev içinde sürer (after); süre sınırı 300 sn.
export const maxDuration = 300;

/**
 * POST /api/news/scan — { instrument?: "bist:THYAO" }
 * Analizi arka planda başlatır; rapor kaydını hemen döndürür (status: running).
 * Bütçe dolmuşsa da çalışır (elle başlatılan), yanıtta uyarı döner.
 */
export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as { instrument?: unknown };
  const instrument = typeof body.instrument === "string" ? body.instrument : null;
  return handle(async () => {
    try {
      const budget = await getBudgetStatus();
      const report = await startNewsScan({ trigger: instrument ? "varlik" : "manuel", instrument });
      return NextResponse.json(
        {
          report,
          warning: budget.overBudget ? `Bu ayki bütçe doldu ($${budget.spentUsd.toFixed(2)} / $${budget.budgetUsd}); analiz yine de başlatıldı.` : null,
        },
        { status: 202 },
      );
    } catch (err) {
      if (err instanceof NoApiKeyError || err instanceof ScanBusyError) {
        return NextResponse.json({ error: err.message }, { status: 409 });
      }
      throw err;
    }
  });
}
