import { handle } from "@/lib/api";
import { generateDailySummary, getLatestSummary, SUMMARY_TIME } from "@/lib/dailySummary";
import { isAiConfigured } from "@/lib/aiClient";

export const dynamic = "force-dynamic";

/** GET /api/summary — son günlük özet */
export async function GET() {
  return handle(async () => ({ summary: await getLatestSummary(), aiConfigured: await isAiConfigured(), time: SUMMARY_TIME }));
}

/** POST /api/summary — özeti şimdi oluştur (anahtar yoksa kurallı özet; bütçe dolduysa yapay zeka kullanılmaz) */
export async function POST() {
  return handle(async () => ({ summary: await generateDailySummary({ notify: false }), aiConfigured: await isAiConfigured(), time: SUMMARY_TIME }));
}
