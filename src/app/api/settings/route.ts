import { NextResponse } from "next/server";
import { handle, readJson } from "@/lib/api";
import {
  AI_MODELS,
  getAiSettings,
  getApiKey,
  getDividendWithholding,
  getKapNotifyScope,
  getSignalAlertsEnabled,
  maskKey,
  setDividendWithholding,
  setKapNotifyScope,
  setSignalAlertsEnabled,
  updateAiSettings,
} from "@/lib/settings";
import { getBudgetStatus } from "@/lib/aiClient";
import { monthlySavings } from "@/lib/news";

export const dynamic = "force-dynamic";

function snapshot() {
  const { key, source } = getApiKey();
  return {
    key: { source, masked: maskKey(key) },
    settings: getAiSettings(),
    models: Object.entries(AI_MODELS).map(([k, m]) => ({ key: k, id: m.id, label: m.label, inputPerMTok: m.inputPerMTok, outputPerMTok: m.outputPerMTok })),
    budget: getBudgetStatus(),
    savings: monthlySavings(),
    signalAlerts: getSignalAlertsEnabled(),
    kapNotify: getKapNotifyScope(),
    withholding: getDividendWithholding(),
  };
}

/** GET /api/settings — yapay zeka ayarları, anahtar durumu (maskeli), bu ayki harcama */
export async function GET() {
  return handle(() => snapshot());
}

/** PUT /api/settings — { model?, scheduleEnabled?, scheduleTimes?, maxSearches?, budgetUsd?, signalAlerts?, kapNotify? } */
export async function PUT(req: Request) {
  return handle(async () => {
    const { signalAlerts, kapNotify, withholding, ...rest } = await readJson(req);
    if (withholding !== undefined) setDividendWithholding(withholding);
    if (signalAlerts !== undefined) setSignalAlertsEnabled(!!signalAlerts);
    if (kapNotify !== undefined) setKapNotifyScope(kapNotify);
    if (Object.keys(rest).length > 0) updateAiSettings(rest);
    return NextResponse.json(snapshot());
  });
}
