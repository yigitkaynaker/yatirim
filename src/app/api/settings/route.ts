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

async function snapshot() {
  const { key, source } = await getApiKey();
  return {
    key: { source, masked: maskKey(key) },
    settings: await getAiSettings(),
    models: Object.entries(AI_MODELS).map(([k, m]) => ({ key: k, id: m.id, label: m.label, inputPerMTok: m.inputPerMTok, outputPerMTok: m.outputPerMTok })),
    budget: await getBudgetStatus(),
    savings: await monthlySavings(),
    signalAlerts: await getSignalAlertsEnabled(),
    kapNotify: await getKapNotifyScope(),
    withholding: await getDividendWithholding(),
  };
}

/** GET /api/settings — yapay zeka ayarları, anahtar durumu (maskeli), bu ayki harcama */
export async function GET() {
  return handle(async () => (await snapshot()));
}

/** PUT /api/settings — { model?, scheduleEnabled?, scheduleTimes?, maxSearches?, budgetUsd?, signalAlerts?, kapNotify? } */
export async function PUT(req: Request) {
  return handle(async () => {
    const { signalAlerts, kapNotify, withholding, ...rest } = await readJson(req);
    if (withholding !== undefined) await setDividendWithholding(withholding);
    if (signalAlerts !== undefined) await setSignalAlertsEnabled(!!signalAlerts);
    if (kapNotify !== undefined) await setKapNotifyScope(kapNotify);
    if (Object.keys(rest).length > 0) await updateAiSettings(rest);
    return NextResponse.json(await snapshot());
  });
}
