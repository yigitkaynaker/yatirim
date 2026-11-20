import { NextResponse } from "next/server";
import { handle, readJson } from "@/lib/api";
import { AI_MODELS, getAiSettings, getApiKey, maskKey, updateAiSettings } from "@/lib/settings";
import { getBudgetStatus } from "@/lib/aiClient";

export const dynamic = "force-dynamic";

function snapshot() {
  const { key, source } = getApiKey();
  return {
    key: { source, masked: maskKey(key) },
    settings: getAiSettings(),
    models: Object.entries(AI_MODELS).map(([k, m]) => ({ key: k, id: m.id, label: m.label, inputPerMTok: m.inputPerMTok, outputPerMTok: m.outputPerMTok })),
    budget: getBudgetStatus(),
  };
}

/** GET /api/settings — yapay zeka ayarları, anahtar durumu (maskeli), bu ayki harcama */
export async function GET() {
  return handle(() => snapshot());
}

/** PUT /api/settings — { model?, scheduleEnabled?, scheduleTimes?, maxSearches?, budgetUsd? } */
export async function PUT(req: Request) {
  return handle(async () => {
    updateAiSettings(await readJson(req));
    return NextResponse.json(snapshot());
  });
}
