import type { NextRequest } from "next/server";
import * as actions from "@/lib/actions";
import { handle } from "@/lib/api";
import { kapStatus, pollKapNow, tickersOfInterest } from "@/lib/kap";

export const dynamic = "force-dynamic";

async function snapshot(ticker?: string | null, limit = 100) {
  const interest = await tickersOfInterest();
  return {
    items: await actions.listKapDisclosures({ ticker: ticker || undefined, limit }),
    tickers: [...interest.entries()].map(([symbol, i]) => ({ symbol, ...i })).sort((a, b) => a.symbol.localeCompare(b.symbol)),
    status: kapStatus(),
  };
}

/** GET /api/kap?hisse=THYAO&limit=50 — saklanan KAP bildirimleri (en yeni önce) */
export async function GET(req: NextRequest) {
  const t = req.nextUrl.searchParams.get("hisse")?.trim().toUpperCase() || null;
  const limit = Math.min(300, Math.max(1, Number(req.nextUrl.searchParams.get("limit")) || 100));
  return handle(async () => (await snapshot(t, limit)));
}

const g = globalThis as unknown as { __yatirimKapManual?: number };

/** POST /api/kap — şimdi kontrol et (en fazla 2 dakikada bir) */
export async function POST() {
  return handle(async () => {
    let message: string | null = null;
    if (Date.now() - (g.__yatirimKapManual ?? 0) < 2 * 60_000) {
      message = "Az önce kontrol edildi; birkaç dakika sonra tekrar deneyin.";
    } else {
      g.__yatirimKapManual = Date.now();
      try {
        const r = await pollKapNow();
        message = r.stored > 0 ? `${r.stored} yeni bildirim kaydedildi.` : "Yeni bildirim yok.";
      } catch (err) {
        console.warn("[kap] elle kontrol:", (err as Error).message);
        message = "KAP'a şu an ulaşılamadı; kayıtlı bildirimler gösteriliyor.";
      }
    }
    return { ...(await snapshot(null)), message };
  });
}
