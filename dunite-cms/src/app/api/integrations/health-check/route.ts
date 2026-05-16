// ============================================================================
// DUNITE CMS — Background health check job handler
// POST /api/integrations/health-check
// ============================================================================
// Called by cron to run token validation and health sync.
// Protected by a shared CRON_SECRET header.
// ============================================================================

import { NextRequest, NextResponse } from 'next/server';
import {
  listAccountsDueForValidation,
} from '@/features/integrations/server/socialAccountsRepository';
import { runFacebookDiagnostics } from '@/features/integrations/server/diagnosticsService';

export const dynamic = 'force-dynamic';

const BATCH_SIZE = 20;

export async function POST(req: NextRequest) {
  // ── Authenticate cron caller ───────────────────────────────────────────────
  const authHeader = req.headers.get('authorization');
  const cronSecret = process.env.CRON_SECRET;

  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const startedAt = Date.now();
  let processed = 0;
  let succeeded = 0;
  let failed = 0;
  const errors: string[] = [];

  try {
    const accounts = await listAccountsDueForValidation(BATCH_SIZE);
    processed = accounts.length;

    console.info(`[health-check] Processing ${accounts.length} accounts`);

    for (const account of accounts) {
      try {
        if (account.platform === 'facebook') {
          await runFacebookDiagnostics(account);
          succeeded++;
        }
      } catch (err) {
        failed++;
        errors.push(`${account.id}: ${(err as Error).message}`);
        console.error(`[health-check] Failed account ${account.id}:`, err);
      }
    }

    // Also purge expired OAuth states
    try {
      const supabase = (await import('@/lib/supabase/server')).createSupabaseServiceRoleClient();
      await supabase.rpc('oauth_states_cleanup');
    } catch {
      console.warn('[health-check] OAuth state cleanup failed (non-critical)');
    }

  } catch (err) {
    console.error('[health-check] Fatal error:', err);
    return NextResponse.json(
      { ok: false, error: (err as Error).message },
      { status: 500 }
    );
  }

  const durationMs = Date.now() - startedAt;
  console.info(`[health-check] Complete: ${succeeded}/${processed} ok, ${failed} failed, ${durationMs}ms`);

  return NextResponse.json({
    ok: true,
    processed,
    succeeded,
    failed,
    duration_ms: durationMs,
    errors: errors.slice(0, 10),
  });
}
