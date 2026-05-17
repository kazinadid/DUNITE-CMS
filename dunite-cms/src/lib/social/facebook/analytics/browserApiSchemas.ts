import { z } from 'zod';

import { facebookDashboardQuerySchema } from '@/lib/social/facebook/insights/validator';
import { formatZodError } from '@/lib/social/facebook/validator';

export const analyticsOverviewQuerySchema = facebookDashboardQuerySchema;

const isoDay = z
  .string()
  .trim()
  .regex(/^[0-9]{4}-[0-9]{2}-[0-9]{2}$/);

export const analyticsPostsTableQuerySchema = z.object({
  from:   isoDay.optional(),
  to:     isoDay.optional(),
  socialAccountId: z.string().uuid().optional(),
  sort: z
    .enum(['engagements', 'reach', 'impressions', 'metric_date'])
    .optional()
    .default('engagements'),
});

export const analyticsPagesTableQuerySchema = z.object({
  from:   isoDay,
  to:     isoDay,
  socialAccountId: z.string().uuid().optional(),
  sortDir: z.enum(['desc', 'asc']).optional().default('desc'),
});

export { formatZodError };
