import type { NextRequest } from "next/server";
import { handle } from "@/lib/api";
import { isCatalogCategory } from "@/lib/assets";
import { listCatalog } from "@/lib/catalog";
import { ValidationError } from "@/lib/portfolio";

export const dynamic = "force-dynamic";

/**
 * GET /api/catalog?kategori=kripto&q=btc&borsa=btcturk&sayfa=0 — piyasa listesinin bir sayfası
 * (fiyatlar ayrıca /api/prices ile yalnızca görünen satırlar için alınır).
 * kategori: kripto, bist, hisse, etf, endeks, emtia, doviz, altin, fon
 * borsa (yalnızca kripto; platform klasörü): binance (tümü) · binance-usdt, binance-try, binance-futures,
 *   binance-alpha · btcturk · midas · coingecko. Kriptoda yanıtta klasör sayıları (folders) da döner.
 * tur (yalnızca fon): yat (yatırım fonu), emk (emeklilik fonu, BES), byf (borsa yatırım fonu)
 */
export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  return handle(async () => {
    const category = sp.get("kategori");
    if (!isCatalogCategory(category)) throw new ValidationError("Liste türü geçersiz.");
    return await listCatalog(category, {
      q: (sp.get("q") ?? "").slice(0, 40),
      venue: sp.get("borsa") ?? undefined,
      fundKind: sp.get("tur") ?? undefined,
      page: Number(sp.get("sayfa") ?? 0) || 0,
      pageSize: Number(sp.get("adet") ?? 30) || 30,
    });
  });
}
