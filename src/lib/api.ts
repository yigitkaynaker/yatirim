import "server-only";
import { after, NextResponse } from "next/server";
import { ConflictError, ValidationError } from "./portfolio";
import { drainBackground, hasBackgroundWork } from "./background";

/**
 * Route handler sarmalayıcı: ValidationError → 400 (Türkçe mesaj), ConflictError → 409.
 * İstek arka plan işi başlattıysa (bildirim gönderme vb.) yanıttan sonra bitmeleri beklenir
 * (bulut modunda işlev erken dondurulmasın diye).
 */
export async function handle(fn: () => unknown, status = 200): Promise<NextResponse> {
  try {
    const result = await fn();
    if (result instanceof NextResponse) return result;
    return NextResponse.json(result, { status });
  } catch (err) {
    const r = errorResponse(err);
    if (r) return r;
    console.error(err);
    return NextResponse.json({ error: "Sunucu hatası." }, { status: 500 });
  } finally {
    if (hasBackgroundWork()) {
      try {
        after(() => drainBackground(280_000));
      } catch {}
    }
  }
}

/** ValidationError / ConflictError için JSON yanıtı (diğer hatalarda null) */
export function errorResponse(err: unknown): NextResponse | null {
  if (err instanceof ConflictError) return NextResponse.json({ error: err.message }, { status: 409 });
  if (err instanceof ValidationError) return NextResponse.json({ error: err.message }, { status: 400 });
  return null;
}

export const notFound = (msg = "Bulunamadı.") => NextResponse.json({ error: msg }, { status: 404 });

export function parseId(raw: string): number | null {
  const id = Number(raw);
  return Number.isInteger(id) && id > 0 ? id : null;
}

export async function readJson(req: Request): Promise<Record<string, unknown>> {
  const body: unknown = await req.json().catch(() => null);
  if (!body || typeof body !== "object") throw new ValidationError("Geçersiz istek.");
  return body as Record<string, unknown>;
}
