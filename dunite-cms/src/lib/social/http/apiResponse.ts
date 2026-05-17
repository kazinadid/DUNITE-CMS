import { NextResponse } from 'next/server';

export function okJson<T>(data: T): NextResponse {
  return NextResponse.json({ ok: true as const, data });
}

export function failJson(
  message: string,
  status: number,
  code?: string,
): NextResponse {
  return NextResponse.json(
    {
      ok: false as const,
      error: message,
      ...(code ? { code } : {}),
    },
    { status },
  );
}
