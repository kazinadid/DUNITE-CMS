import { z } from 'zod';

const ISO_UTC = z.string().datetime({ offset: true });

export const calendarFiltersSchema = z.object({
  start:         ISO_UTC,
  end:           ISO_UTC,
  page:          z.coerce.number().int().min(1).default(1).optional(),
  pageSize:      z.coerce.number().int().min(1).max(500).default(250).optional(),
  cursor:        ISO_UTC.optional(),
  platform:      z.string().trim().min(1).optional(),
  status:        z.string().trim().min(1).optional(),
  userId:        z.string().uuid().optional(),
  failedOnly:    z.coerce.boolean().optional(),
  scheduledOnly: z.coerce.boolean().optional(),
  mediaOnly:     z.coerce.boolean().optional(),
});

export const calendarRescheduleBodySchema = z.object({
  postId:            z.string().uuid(),
  scheduledAtIsoUtc: ISO_UTC,
  expectedUpdatedAt: ISO_UTC.optional(),
});

export const calendarResizeBodySchema = z.object({
  postId:            z.string().uuid(),
  startAtIsoUtc:     ISO_UTC,
  endAtIsoUtc:       ISO_UTC,
  expectedUpdatedAt: ISO_UTC.optional(),
});

export const calendarBulkRescheduleBodySchema = z.object({
  items: z.array(calendarRescheduleBodySchema).min(1).max(200),
});

export type CalendarFiltersInput = z.infer<typeof calendarFiltersSchema>;
export type CalendarRescheduleBody = z.infer<typeof calendarRescheduleBodySchema>;
export type CalendarBulkRescheduleBody = z.infer<typeof calendarBulkRescheduleBodySchema>;
export type CalendarResizeBody = z.infer<typeof calendarResizeBodySchema>;
