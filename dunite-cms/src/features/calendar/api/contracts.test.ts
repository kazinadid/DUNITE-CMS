import { describe, expect, it } from 'vitest';

import {
  calendarBulkRescheduleBodySchema,
  calendarFiltersSchema,
  calendarResizeBodySchema,
  calendarRescheduleBodySchema,
} from '@/features/calendar/api/contracts';

describe('calendar contracts', () => {
  it('accepts valid range query', () => {
    const parsed = calendarFiltersSchema.parse({
      start: '2026-05-20T00:00:00.000Z',
      end: '2026-05-22T00:00:00.000Z',
      page: '1',
      pageSize: '200',
      scheduledOnly: 'true',
    });
    expect(parsed.page).toBe(1);
    expect(parsed.pageSize).toBe(200);
    expect(parsed.scheduledOnly).toBe(true);
  });

  it('rejects invalid reschedule payload', () => {
    const bad = calendarRescheduleBodySchema.safeParse({
      postId: 'not-a-uuid',
      scheduledAtIsoUtc: '2026-05-20',
    });
    expect(bad.success).toBe(false);
  });

  it('accepts valid bulk payload', () => {
    const parsed = calendarBulkRescheduleBodySchema.parse({
      items: [
        {
          postId: '11111111-1111-4111-8111-111111111111',
          scheduledAtIsoUtc: '2026-05-20T12:00:00.000Z',
        },
      ],
    });
    expect(parsed.items).toHaveLength(1);
  });

  it('accepts resize payload', () => {
    const parsed = calendarResizeBodySchema.parse({
      postId: '11111111-1111-4111-8111-111111111111',
      startAtIsoUtc: '2026-05-20T12:00:00.000Z',
      endAtIsoUtc: '2026-05-20T12:30:00.000Z',
    });
    expect(parsed.postId).toContain('-');
  });
});
