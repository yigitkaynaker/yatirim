import { NextResponse, type NextRequest } from "next/server";
import * as actions from "@/lib/actions";
import { parseId } from "@/lib/api";
import { ValidationError } from "@/lib/portfolio";

export const dynamic = "force-dynamic";

const KINDS: actions.ExportKind[] = ["islemler", "pozisyonlar", "temettuler", "kazanc"];

/** GET /api/export?tur=islemler|pozisyonlar|temettuler|kazanc|sablon&hesap=<id>&yil=<yyyy> — Excel (Türkçe) uyumlu CSV */
export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const kind = sp.get("tur") ?? "islemler";
  const account = sp.get("hesap") ? parseId(sp.get("hesap")!) : null;
  const year = sp.get("yil");
  try {
    let csv: string;
    let name: string;
    if (kind === "sablon") {
      csv = actions.importTemplateCsv();
      name = "islem-sablonu.csv";
    } else if ((KINDS as string[]).includes(kind)) {
      csv = await actions.exportCsv(kind as actions.ExportKind, { account, year: year && /^\d{4}$/.test(year) ? year : null });
      const stamp = new Date().toLocaleDateString("en-CA", { timeZone: "Europe/Istanbul" });
      name = `yatirim-${kind}${year ? `-${year}` : ""}-${stamp}.csv`;
    } else {
      return NextResponse.json({ error: "Geçersiz dışa aktarma türü." }, { status: 400 });
    }
    return new NextResponse(csv, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${name}"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (err) {
    if (err instanceof ValidationError) return NextResponse.json({ error: err.message }, { status: 400 });
    console.error(err);
    return NextResponse.json({ error: "Sunucu hatası." }, { status: 500 });
  }
}
