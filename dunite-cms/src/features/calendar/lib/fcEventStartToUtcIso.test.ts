import { describe, expect, it } from 'vitest';

import { fcEventStartToUtcIso } from '@/features/calendar/lib/fcEventStartToUtcIso';

describe('fcEventStartToUtcIso', () => {
  it('parses explicit offset ISO directly', () => {
    const out = fcEventStartToUtcIso('2026-05-20T21:23:00+06:00', null, 'Asia/Dhaka');
    expect(out.iso).toBe('2026-05-20T15:23:00.000Z');
    expect(out.meta?.source).toBe('fc-startStr-offset');
  });

  it('parses wall time in workspace zone when no offset', () => {
    const out = fcEventStartToUtcIso('2026-05-20T21:23:00', null, 'Asia/Dhaka');
    expect(out.iso).toBe('2026-05-20T15:23:00.000Z');
    expect(out.meta?.source).toBe('fc-startStr-wall');
  });

  it('normalizes FullCalendar space-delimited timestamps', () => {
    const out = fcEventStartToUtcIso('2026-05-20 21:23:00', null, 'Asia/Dhaka');
    expect(out.iso).toBe('2026-05-20T15:23:00.000Z');
  });

  it('falls back to Date object when startStr is invalid', () => {
    const d = new Date('2026-05-20T15:23:00.000Z');
    const out = fcEventStartToUtcIso('not-a-date', d, 'Asia/Dhaka');
    expect(out.iso).toBe('2026-05-20T15:23:00.000Z');
    expect(out.meta?.source).toBe('fc-date-fallback');
  });
});
