import { handleRegister } from "@/lib/oauth";

export const dynamic = "force-dynamic";

/** POST /api/oauth/register — dinamik istemci kaydı (RFC 7591) */
export const POST = (req: Request) => handleRegister(req);
