import { NextResponse } from "next/server";
import { handle, readJson } from "@/lib/api";
import { AI_MODELS, getAiSettings, getApiKey, getSignalAlertsEnabled, maskKey, setSignalAlertsEnabled, updateAiSettings } from "@/lib/settings";
import { getBudgetStatus } from "@/lib/aiClient";

export const dynamic = "force-dynamic";

function snapshot() {
  const { key, source } = getApiKey();
  return {
    key: { source, masked: maskKey(key) },
    settings: getAiSettings(),
    models: Object.entries(AI_MODELS).map(([k, m]) => ({ key: k, id: m.id, label: m.label, inputPerMTok: m.inputPerMTok, outputPerMTok: m.outputPerMTok })),
    budget: getBudgetStatus(),
    signalAlerts: getSignalAlertsEnabled(),
  };
}

/** GET /api/settings — yapay zeka ayarları, anahtar durumu (maskeli), bu ayki harcama */
export async function GET() {
  return handle(() => snapshot());
}

/** PUT /api/settings — { model?, scheduleEnabled?, scheduleTimes?, maxSearches?, budgetUsd?, signalAlerts? } */
export async function PUT(req: Request) {
  return handle(async () => {
    const { signalAlerts, ...rest } = await readJson(req);
    if (signalAlerts !== undefined) setSignalAlertsEnabled(!!signalAlerts);
    if (Object.keys(rest).length > 0) updateAiSettings(rest);
    return NextResponse.json(snapshot());
  });
}
