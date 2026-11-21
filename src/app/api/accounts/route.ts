import * as actions from "@/lib/actions";
import { handle, readJson } from "@/lib/api";

export const dynamic = "force-dynamic";

/** GET /api/accounts — tüm hesaplar (arşivliler dahil) */
export async function GET() {
  return handle(async () => ({ accounts: await actions.listAccounts({ includeArchived: true }) }));
}

/** POST /api/accounts { name, feePct?, includeInTotal? } — yeni hesap */
export async function POST(req: Request) {
  return handle(async () => {
    const b = await readJson(req);
    return {
      account: await actions.createAccount({
        name: String(b.name ?? ""),
        feePct: (b.feePct as string | number | null | undefined) ?? null,
        includeInTotal: b.includeInTotal !== false,
      }),
    };
  }, 201);
}
