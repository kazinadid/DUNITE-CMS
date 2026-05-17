const DEFAULT_SCHEDULE_MS = [1_000, 2_000, 4_000, 8_000, 16_000] as const;

export function maxFacebookPublishAttempts(): number {
  const raw = process.env.FACEBOOK_MAX_RETRY_ATTEMPTS;
  const n = raw ? Number(raw) : NaN;
  return Number.isFinite(n) ? Math.min(10, Math.max(1, n)) : 5;
}

export function backoffMsForAttempt(attemptZeroBased: number): number {
  const i = Math.min(
    attemptZeroBased,
    DEFAULT_SCHEDULE_MS.length - 1,
  );
  return DEFAULT_SCHEDULE_MS[i] ?? 16_000;
}
