import { describe, expect, it } from 'vitest';

import type { ZonedWallParts } from '@/lib/time/workspaceTime';
import {
  utcIsoFromWallInZone,
  utcIsoToDatetimeLocalValue,
  utcMillisFromIso,
  wallPartsFromUtcIso,
} from '@/lib/time/workspaceTime';

describe('workspaceTime — Asia/Dhaka', () => {
  it('converts Dhaka wall to UTC (+6)', () => {
    const utc = utcIsoFromWallInZone(
      {
        year:   2026,
        month:  5,
        day:    20,
        hour:   21,
        minute: 23,
      },
      'Asia/Dhaka',
    );
    expect(utc).toBe('2026-05-20T15:23:00.000Z');
  });

  it('round-trips through datetime-local string (minute precision)', () => {
    const original = '2026-05-20T15:23:45.123Z';
    const local = utcIsoToDatetimeLocalValue(original, 'Asia/Dhaka');
    expect(local).toBe('2026-05-20T21:23');
    const parts = parseWallParts(local);
    expect(parts).not.toBeNull();
    const back = utcIsoFromWallInZone(parts!, 'Asia/Dhaka');
    expect(back).toBe('2026-05-20T15:23:00.000Z');
  });

  it('parses utc millis reliably', () => {
    expect(utcMillisFromIso('2026-05-20T15:23:00.000Z')).toBe(
      Date.UTC(2026, 4, 20, 15, 23, 0),
    );
    expect(utcMillisFromIso('')).toBeNull();
    expect(utcMillisFromIso(undefined)).toBeNull();
    expect(utcMillisFromIso('invalid')).toBeNull();
  });

  it('wallPartsFromUtcIso matches formatting path', () => {
    const p = wallPartsFromUtcIso('2026-05-20T15:23:00.000Z', 'Asia/Dhaka');
    expect(p).toEqual({
      year: 2026,
      month: 5,
      day: 20,
      hour: 21,
      minute: 23,
    });
  });
});

describe('workspaceTime — America/New_York (DST transitions)', () => {
  it('produces stable UTC for a fall-back ambiguous wall time', () => {
    const utc = utcIsoFromWallInZone(
      { year: 2025, month: 11, day: 2, hour: 1, minute: 30 },
      'America/New_York',
    );
    expect(typeof utc === 'string' && utc!.startsWith('202')).toBe(true);
    const round = wallPartsFromUtcIso(utc as string, 'America/New_York');
    expect(round?.hour).toBe(1);
    expect(round?.minute).toBe(30);
  });
});

function parseWallParts(local: string): ZonedWallParts | null {
  const m = local.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/);
  if (!m) return null;
  const [, y, mo, d, h, mi] = m;
  return {
    year: Number(y),
    month: Number(mo),
    day: Number(d),
    hour: Number(h),
    minute: Number(mi),
  };
}
