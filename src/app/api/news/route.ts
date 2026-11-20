import type { NextRequest } from "next/server";
import { handle } from "@/lib/api";
import { getLatestReport, isScanRunning, listReports } from "@/lib/news";
import { getBudgetStatus, isAiConfigured } from "@/lib/aiClient";
import { getAiSettings } from "@/lib/settings";

export const dynamic = "force-dynamic";

/**
 * GET /api/news — rapor geçmişi + durum.
 * GET /api/news?instrument=bist:THYAO — o varlığı içeren en son rapor.
 */
export async function GET(req: NextRequest) {
  const instrument = req.nextUrl.searchParams.get("instrument");
  return handle(() => {
    const base = { configured: isAiConfigured(), running: isScanRunning(), budget: getBudgetStatus(), settings: getAiSettings() };
    if (instrument) return { ...base, latest: getLatestReport(instrument) };
    return { ...base, reports: listReports(30) };
  });
}
