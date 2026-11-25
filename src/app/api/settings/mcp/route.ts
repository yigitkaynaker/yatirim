import { NextResponse } from "next/server";
import { handle, readJson } from "@/lib/api";
import { getMcpSettings, updateMcpSettings } from "@/lib/settings";
import { createStaticToken, listConnections, mcpResourceUrl, publicOrigin, revokeClient, revokeStaticToken, staticTokenInfo } from "@/lib/oauth";
import { recentMcpCalls } from "@/lib/mcp";

export const dynamic = "force-dynamic";

async function snapshot(req: Request) {
  return {
    settings: await getMcpSettings(),
    mcpUrl: mcpResourceUrl(publicOrigin(req)),
    connections: await listConnections(),
    staticToken: await staticTokenInfo(),
    calls: await recentMcpCalls(20),
  };
}

/** GET /api/settings/mcp — ChatGPT / MCP bağlantı ayarları, bağlı istemciler, son çağrılar */
export async function GET(req: Request) {
  return handle(() => snapshot(req));
}

/** PUT /api/settings/mcp — { allowWrites?, maxAmountTry? } */
export async function PUT(req: Request) {
  return handle(async () => {
    await updateMcpSettings(await readJson(req));
    return NextResponse.json(await snapshot(req));
  });
}

/** POST /api/settings/mcp — { action: "static" } yeni statik anahtar üretir (yalnızca bir kez gösterilir) */
export async function POST(req: Request) {
  return handle(async () => {
    const body = await readJson(req);
    if (body.action !== "static") return NextResponse.json({ error: "Geçersiz istek." }, { status: 400 });
    const token = await createStaticToken();
    return { token, ...(await snapshot(req)) };
  });
}

/** DELETE /api/settings/mcp?client=ID | ?static=1 — bağlantıyı kaldırır */
export async function DELETE(req: Request) {
  return handle(async () => {
    const q = new URL(req.url).searchParams;
    if (q.get("static")) await revokeStaticToken();
    else {
      const id = q.get("client");
      if (!id || !(await revokeClient(id))) return NextResponse.json({ error: "Bağlantı bulunamadı." }, { status: 404 });
    }
    return snapshot(req);
  });
}
