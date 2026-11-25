import { json, protectedResourceMetadata } from "@/lib/oauth";

export const dynamic = "force-dynamic";

/** RFC 9728 korunan kaynak meta verisi (/.well-known/oauth-protected-resource ve …/api/mcp) */
export const GET = (req: Request) => json(protectedResourceMetadata(req), 200, { "Access-Control-Allow-Origin": "*" });
