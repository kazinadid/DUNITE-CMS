import 'server-only';

import { NextResponse } from 'next/server';

/** Shared cron auth for `/api/cron/facebook/analytics/*` routes. */
export function requireCronBearer(request: Request):
  | { ok: true; secretUsed: boolean }
  | { ok: false; response: NextResponse } {

  const secret = process.env.CRON_SECRET;

  if (!secret) {
    return {
      ok: false,
      response: NextResponse.json(
        { ok: false as const, error: 'CRON_SECRET is not configured' },
        { status: 503 },
      ),
    };
  }

  const auth = request.headers.get('authorization');
  if (auth !== `Bearer ${secret}`) {
    return {
      ok: false,
      response: NextResponse.json({ ok: false as const, error: 'Unauthorized' }, { status: 401 }),
    };
  }

  return { ok: true, secretUsed: true };
}
