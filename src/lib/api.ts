import "server-only";
import { NextResponse } from "next/server";
import { ValidationError } from "./portfolio";

/** Route handler sarmalayıcı: ValidationError → 400 (Türkçe mesaj). */
export async function handle(fn: () => unknown | Promise<unknown>, status = 200): Promise<NextResponse> {
  try {
    const result = await fn();
    if (result instanceof NextResponse) return result;
    return NextResponse.json(result, { status });
  } catch (err) {
    if (err instanceof ValidationError) return NextResponse.json({ error: err.message }, { status: 400 });
    console.error(err);
    return NextResponse.json({ error: "Sunucu hatası." }, { status: 500 });
  }
}

export const notFound = (msg = "Bulunamadı.") => NextResponse.json({ error: msg }, { status: 404 });

export function parseId(raw: string): number | null {
  const id = Number(raw);
  return Number.isInteger(id) && id > 0 ? id : null;
}

export async function readJson(req: Request): Promise<Record<string, unknown>> {
  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object") throw new ValidationError("Geçersiz istek.");
  return body as Record<string, unknown>;
}
