import { z } from 'zod';

import { formatZodError } from '@/lib/social/facebook/validator';

export { formatZodError };

const isoDateOrEmpty = z
  .string()
  .trim()
  .regex(/^[0-9]{4}-[0-9]{2}-[0-9]{2}$/)
  .optional();

export const facebookDashboardQuerySchema = z.object({
  from: isoDateOrEmpty,
  to: isoDateOrEmpty,
  socialAccountId: z.string().uuid().optional(),
  auditView: z.enum(['1']).optional(),
});

export const facebookAnalyticsSyncBodySchema = z.object({
  organizationScoped: z.boolean().optional(),
  postIds: z.array(z.string().uuid()).max(40).optional(),
});

export type FacebookDashboardQuery = z.infer<typeof facebookDashboardQuerySchema>;
export type FacebookAnalyticsSyncBody = z.infer<typeof facebookAnalyticsSyncBodySchema>;

export const facebookExportQuerySchema = z.object({
  format: z.enum(['csv', 'json']),
  from: isoDateOrEmpty,
  to: isoDateOrEmpty,
  socialAccountId: z.string().uuid().optional(),
});

export type FacebookExportQuery = z.infer<typeof facebookExportQuerySchema>;

const insightValue = z.object({
  value: z.union([z.number(), z.string()]).optional(),
  end_time: z.string().optional(),
});

export const facebookInsightsEnvelopeSchema = z.object({
  data: z.array(
    z.object({
      name: z.string(),
      values: z.array(insightValue),
    }),
  ),
});

export const facebookPostSummarySchema = z.object({
  id: z.string().optional(),
  shares: z
    .object({
      count: z.number().optional(),
    })
    .optional(),
  likes: z
    .object({
      summary: z
        .object({
          total_count: z.number().optional(),
        })
        .optional(),
    })
    .optional(),
  comments: z
    .object({
      summary: z
        .object({
          total_count: z.number().optional(),
        })
        .optional(),
    })
    .optional(),
  reactions: z
    .object({
      summary: z
        .object({
          total_count: z.number().optional(),
        })
        .optional(),
    })
    .optional(),
});
