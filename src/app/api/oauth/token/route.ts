import { handleToken } from "@/lib/oauth";

export const dynamic = "force-dynamic";

/** POST /api/oauth/token — authorization_code (PKCE S256) ve refresh_token */
export const POST = (req: Request) => handleToken(req);
