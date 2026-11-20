import { handle } from "@/lib/api";
import { generateDailySummary, getLatestSummary, SUMMARY_TIME } from "@/lib/dailySummary";
import { isAiConfigured } from "@/lib/aiClient";

export const dynamic = "force-dynamic";

/** GET /api/summary — son günlük özet */
export async function GET() {
  return handle(() => ({ summary: getLatestSummary(), aiConfigured: isAiConfigured(), time: SUMMARY_TIME }));
}

/** POST /api/summary — özeti şimdi oluştur (anahtar yoksa kurallı özet; bütçe dolduysa yapay zeka kullanılmaz) */
export async function POST() {
  return handle(async () => ({ summary: await generateDailySummary({ notify: false }), aiConfigured: isAiConfigured(), time: SUMMARY_TIME }));
}
