import 'server-only';

import { FacebookServiceError } from '@/features/integrations/server/facebook.service';
import { FacebookInsightsError } from '@/lib/social/facebook/insights/errors';
import { analyticsStructuredLog } from './logger';

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

function classifyRetryable(err: unknown): { retry: boolean; delayMs: number } {
  if (err instanceof FacebookInsightsError || err instanceof FacebookServiceError) {
    const code = err.graphCode;
    if (code === 190 || code === 102) return { retry: false, delayMs: 0 };
    if (err.retryable) {
      return { retry: true, delayMs: 450 };
    }
  }
  return { retry: false, delayMs: 0 };
}

/** Wraps Graph fetchers with bounded exponential backoff (server-only). */
export async function withFacebookInsightsRetry<T>(
  label: string,
  fn: () => Promise<T>,
  opts?: { maxAttempts?: number },
): Promise<T> {
  const max = Math.min(5, Math.max(1, opts?.maxAttempts ?? 3));
  let attempt = 0;
  let last: unknown;

  while (attempt < max) {
    const t0 = Date.now();
    try {
      const out = await fn();
      analyticsStructuredLog({
        phase: 'graph',
        event: 'graph_call_ok',
        ms:    Date.now() - t0,
        extra: { label, attempt },
      });
      return out;
    } catch (e) {
      last = e;
      const { retry, delayMs } = classifyRetryable(e);
      attempt++;
      analyticsStructuredLog({
        phase:     'graph',
        event:     'graph_call_fail',
        level:     retry && attempt < max ? 'warn' : 'error',
        ms:        Date.now() - t0,
        extra:     { label, attempt, message: (e as Error).message, retry },
      });
      if (!retry || attempt >= max) break;
      await sleep(delayMs * attempt);
    }
  }

  throw last instanceof Error ? last : new Error(`${label}_failed`);
}
