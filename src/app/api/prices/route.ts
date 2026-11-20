import { NextResponse, type NextRequest } from "next/server";
import { parseInstrumentId } from "@/lib/assets";
import { DEFAULT_WATCHLIST, getQuotes, type InstrumentRef } from "@/lib/prices";

export const dynamic = "force-dynamic";

/**
 * GET /api/prices?ids=bist:THYAO,foreign:AAPL,crypto:BTC,fx:USD,gold:GRAM
 * ids verilmezse varsayılan izleme listesi döner. &force=1 önbelleği atlar.
 */
export async function GET(req: NextRequest) {
  const raw = req.nextUrl.searchParams.get("ids");
  let instruments: InstrumentRef[] = DEFAULT_WATCHLIST;
  if (raw) {
    instruments = [];
    for (const part of raw.split(",").slice(0, 50)) {
      const parsed = parseInstrumentId(part.trim());
      if (!parsed) return NextResponse.json({ error: `Geçersiz enstrüman: ${part}` }, { status: 400 });
      instruments.push(parsed);
    }
  }
  const quotes = await getQuotes(instruments, { force: req.nextUrl.searchParams.get("force") === "1" });
  return NextResponse.json({ quotes, updatedAt: Date.now() });
}
