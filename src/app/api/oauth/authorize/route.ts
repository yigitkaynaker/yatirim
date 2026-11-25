import { handleAuthorizeGet, handleAuthorizePost } from "@/lib/oauth";

export const dynamic = "force-dynamic";

/** GET: oturum ister, Türkçe izin sayfası. POST: "İzin ver" / "Reddet" formu. */
export const GET = (req: Request) => handleAuthorizeGet(req);
export const POST = (req: Request) => handleAuthorizePost(req);
