import { NextResponse } from "next/server";
import { handle, readJson } from "@/lib/api";
import {
  AI_MODELS,
  getAiSettings,
  getDividendWithholding,
  getKapNotifyScope,
  getSharedAiDailyLimit,
  getSharedAiGlobalLimit,
  getSignalAlertsEnabled,
  OPENAI_MODELS,
  publicKeyState,
  setDividendWithholding,
  setKapNotifyScope,
  setSharedAiDailyLimit,
  setSharedAiGlobalLimit,
  setSignalAlertsEnabled,
  sharedAiTotalToday,
  sharedAiUsedToday,
  updateAiSettings,
  usesSharedAi,
} from "@/lib/settings";
import { isOwner } from "@/lib/userContext";
import { getBudgetStatus } from "@/lib/aiClient";
import { monthlySavings } from "@/lib/news";

export const dynamic = "force-dynamic";

async function snapshot() {
  // Yalnızca kullanıcının kendi anahtarı (maskeli); sahibin anahtarı başkasına hiç dönmez.
  const an = await publicKeyState("anthropic");
  const oa = await publicKeyState("openai");
  const owner = await isOwner();
  return {
    key: an,
    keys: { anthropic: an, openai: oa },
    isOwner: owner,
    // Sahibin anahtarını paylaşma: sahip-dışı kullanıcıda günlük sınır ve bugünkü kullanım; sahipte sınır ayarı
    sharedAi: { active: await usesSharedAi(), dailyLimit: await getSharedAiDailyLimit(), usedToday: owner ? 0 : await sharedAiUsedToday(), ...(owner ? { globalLimit: await getSharedAiGlobalLimit(), totalToday: await sharedAiTotalToday() } : {}) },
    openaiModels: OPENAI_MODELS,
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

/** PUT /api/settings — { provider?, model?, openaiModel?, openaiPrice?, scheduleEnabled?, scheduleTimes?, maxSearches?, budgetUsd?, signalAlerts?, kapNotify? } */
export async function PUT(req: Request) {
  return handle(async () => {
    const { signalAlerts, kapNotify, withholding, sharedAiDailyLimit, sharedAiGlobalLimit, ...rest } = await readJson(req);
    if (sharedAiDailyLimit !== undefined) await setSharedAiDailyLimit(sharedAiDailyLimit);
    if (sharedAiGlobalLimit !== undefined) await setSharedAiGlobalLimit(sharedAiGlobalLimit);
    if (withholding !== undefined) await setDividendWithholding(withholding);
    if (signalAlerts !== undefined) await setSignalAlertsEnabled(!!signalAlerts);
    if (kapNotify !== undefined) await setKapNotifyScope(kapNotify);
    if (Object.keys(rest).length > 0) await updateAiSettings(rest);
    return NextResponse.json(await snapshot());
  });
}
