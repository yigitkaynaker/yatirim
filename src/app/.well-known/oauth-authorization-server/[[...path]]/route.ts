import { authServerMetadata, json } from "@/lib/oauth";

export const dynamic = "force-dynamic";

/** RFC 8414 yetkilendirme sunucusu meta verisi */
export const GET = (req: Request) => json(authServerMetadata(req), 200, { "Access-Control-Allow-Origin": "*" });
