/**
 * Scheduling conversions: wall clock in a fixed IANA zone ↔ canonical UTC ISO.
 * Uses dayjs utc + timezone (DST-safe for zone rules shipped with Intl/tz DB).
 */

import dayjs from 'dayjs';
import customParseFormat from 'dayjs/plugin/customParseFormat';
import utc from 'dayjs/plugin/utc';
import timezone from 'dayjs/plugin/timezone';

dayjs.extend(customParseFormat);
dayjs.extend(utc);
dayjs.extend(timezone);

export interface ZonedWallParts {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
}

/**
 * Interpret naive calendar digits as wall time in `ianaZone`, return UTC ISO 8601
 * (`…Z`). Returns null when the zone or combination is invalid.
 */
export function utcIsoFromWallInZone(
  parts: ZonedWallParts,
  ianaZone: string,
): string | null {
  const zone = ianaZone.trim();
  if (!zone) return null;

  const pad = (n: number) => String(n).padStart(2, '0');
  const wall =
    `${parts.year}-${pad(parts.month)}-${pad(parts.day)} ` +
    `${pad(parts.hour)}:${pad(parts.minute)}:00`;

  const d = dayjs.tz(wall, 'YYYY-MM-DD HH:mm:ss', zone);
  if (!d.isValid()) return null;
  return d.utc().toISOString();
}

export function wallPartsFromUtcIso(
  isoUtc: string,
  ianaZone: string,
): ZonedWallParts | null {
  const zone = ianaZone.trim();
  if (!zone) return null;
  const d = dayjs.utc(isoUtc).tz(zone);
  if (!d.isValid()) return null;
  return {
    year:   d.year(),
    month:  d.month() + 1,
    day:    d.date(),
    hour:   d.hour(),
    minute: d.minute(),
  };
}

/** `YYYY-MM-DDTHH:mm` for `<input type="datetime-local">` in the given zone. */
export function utcIsoToDatetimeLocalValue(isoUtc: string, ianaZone: string): string {
  const p = wallPartsFromUtcIso(isoUtc, ianaZone);
  if (!p) return '';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${p.year}-${pad(p.month)}-${pad(p.day)}T${pad(p.hour)}:${pad(p.minute)}`;
}

/** Milliseconds since Unix epoch from a UTC-normalized ISO string; null if invalid. */
export function utcMillisFromIso(iso: string | null | undefined): number | null {
  if (iso == null || iso === '') return null;
  const d = dayjs.utc(iso);
  if (!d.isValid()) return null;
  return d.valueOf();
}
