import { handleMcpRequest } from "@/lib/mcp";

// MCP sunucusu (ChatGPT / Claude.ai bağlayıcısı). Oturum çerezi değil, OAuth / statik Bearer
// belirteci ister (bkz. lib/oauth.ts); proxy bu yolu atlar.
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export const POST = (req: Request) => handleMcpRequest(req);
export const GET = (req: Request) => handleMcpRequest(req);
export const DELETE = (req: Request) => handleMcpRequest(req);
