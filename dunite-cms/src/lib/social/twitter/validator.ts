import 'server-only';

import { z } from 'zod';

// ── Zod schemas for API route validation ──────────────────────────────────────

export const twitterPublishBodySchema = z.object({
  postId: z.string().uuid(),
  socialAccountId: z.string().uuid(),
});

export const twitterScheduleBodySchema = z.object({
  postId: z.string().uuid(),
  socialAccountId: z.string().uuid(),
  scheduledFor: z.string().datetime(),
});

export type TwitterPublishBody = z.infer<typeof twitterPublishBodySchema>;
export type TwitterScheduleBody = z.infer<typeof twitterScheduleBodySchema>;

export function formatZodError(error: z.ZodError): string {
  const issues = error.issues.map((i) => `${i.path.join('.')}: ${i.message}`);
  return `Validation failed: ${issues.join(', ')}`;
}
