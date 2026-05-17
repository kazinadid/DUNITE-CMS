import { z } from 'zod';

export function formatZodError(error: z.ZodError): string {
  return error.issues.map((i) => i.message).join('; ');
}

const uuid = z.string().uuid();

export const facebookPublishBodySchema = z.object({
  postId: uuid,
  socialAccountId: uuid,
});

export const facebookRetryBodySchema = z.object({
  postId: uuid,
});

export const facebookScheduleBodySchema = z.object({
  postId: uuid,
  scheduledFor: z.string().min(4),
  socialAccountId: uuid.optional(),
});

export const facebookCancelBodySchema = z.object({
  postId: uuid,
});

export type FacebookPublishBody = z.infer<typeof facebookPublishBodySchema>;
export type FacebookRetryBody = z.infer<typeof facebookRetryBodySchema>;
export type FacebookScheduleBody = z.infer<typeof facebookScheduleBodySchema>;
export type FacebookCancelBody = z.infer<typeof facebookCancelBodySchema>;
