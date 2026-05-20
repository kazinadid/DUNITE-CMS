/**
 * Calendar-specific datetime utilities — enterprise-grade, timezone-safe.
 *
 * Architecture:
 * - Storage: UTC ISO 8601 only (PostgreSQL timestamptz)
 * - Display: Local timezone via Intl.DateTimeFormat
 * - Input: datetime-local → UTC via dayjs timezone plugin
 * - FullCalendar: Luxon for FC integration (unavoidable dependency)
 *
 * All conversions are DST-safe and workspace-zone aware.
 */

import { DateTime } from 'luxon';

// ── Import dependencies for internal use ────────────────────────────────────

import {
  resolveLocalTimeZone as _resolveLocalTimeZone,
  datetimeLocalInterpretationZone,
  hasConfiguredWorkspaceTimeZone,
  isUtcScheduleTooSoon as _isUtcScheduleTooSoon,
} from '@/lib/date';
import {
  utcIsoFromWallInZone,
  wallPartsFromUtcIso,
  utcIsoToDatetimeLocalValue,
  utcMillisFromIso as _utcMillisFromIso,
  type ZonedWallParts,
} from '@/lib/time/workspaceTime';
import {
  formatCalendarSlotTime,
  formatCalendarScheduledDetail,
  isoToDatetimeLocalInput,
  datetimeLocalInputToIso,
} from '@/features/calendar/lib/formatTime';
import {
  fcEventStartToUtcIso,
  type FcUtcIsoMeta,
} from '@/features/calendar/lib/fcEventStartToUtcIso';

// ── Re-export for convenience ───────────────────────────────────────────────

export {
  resolveLocalTimeZone,
  datetimeLocalInterpretationZone,
  hasConfiguredWorkspaceTimeZone,
  isUtcScheduleTooSoon,
} from '@/lib/date';

export {
  utcIsoFromWallInZone,
  wallPartsFromUtcIso,
  utcIsoToDatetimeLocalValue,
  utcMillisFromIso,
  type ZonedWallParts,
} from '@/lib/time/workspaceTime';

export {
  formatCalendarSlotTime,
  formatCalendarScheduledDetail,
  isoToDatetimeLocalInput,
  datetimeLocalInputToIso,
} from '@/features/calendar/lib/formatTime';

export {
  fcEventStartToUtcIso,
  type FcUtcIsoMeta,
} from '@/features/calendar/lib/fcEventStartToUtcIso';

// ── NEW: Calendar Range Utilities ───────────────────────────────────────────

/**
 * Generate UTC ISO range for calendar viewport, aligned to workspace timezone.
 *
 * This prevents the "remote editor" bug where `new Date(y, m, d)` uses the
 * browser's OS zone instead of the workspace zone, corrupting
 * `[gte scheduled_at lt)` queries.
 */
export function getCalendarViewportRangeUtc(
  referenceDate: Date = new Date(),
  monthsAhead: number = 2,
  zone?: string,
): { startIso: string; endIso: string } {
  const z = zone ?? _resolveLocalTimeZone();

  const startLux = DateTime.fromJSDate(referenceDate).setZone(z).startOf('month');
  const endLux = startLux.plus({ months: monthsAhead }).startOf('month');

  return {
    startIso: startLux.toISO()!,
    endIso: endLux.toISO()!,
  };
}

/**
 * Check if a UTC ISO timestamp falls within a calendar viewport range.
 * Useful for filtering events client-side before rendering.
 */
export function isWithinCalendarRange(
  isoUtc: string,
  startIso: string,
  endIso: string,
): boolean {
  const ms = _utcMillisFromIso(isoUtc);
  const startMs = _utcMillisFromIso(startIso);
  const endMs = _utcMillisFromIso(endIso);

  if (ms === null || startMs === null || endMs === null) return false;
  return ms >= startMs && ms < endMs;
}

/**
 * Snap a UTC ISO timestamp to the nearest grid interval.
 * Used for drag-drop resize operations.
 *
 * @param isoUtc - Original timestamp
 * @param intervalMinutes - Snap interval (default: 30 minutes)
 * @returns Snapped UTC ISO timestamp
 */
export function snapToGrid(
  isoUtc: string,
  intervalMinutes: number = 30,
): string | null {
  const ms = _utcMillisFromIso(isoUtc);
  if (ms === null) return null;

  const intervalMs = intervalMinutes * 60 * 1000;
  const snapped = Math.round(ms / intervalMs) * intervalMs;
  return new Date(snapped).toISOString();
}

/**
 * Add duration to a UTC ISO timestamp.
 * Used for calculating event end times.
 *
 * @param isoUtc - Start timestamp
 * @param durationMinutes - Duration to add
 * @returns End timestamp (UTC ISO)
 */
export function addDuration(
  isoUtc: string,
  durationMinutes: number,
): string | null {
  const ms = _utcMillisFromIso(isoUtc);
  if (ms === null) return null;

  return new Date(ms + durationMinutes * 60 * 1000).toISOString();
}

/**
 * Calculate duration between two UTC ISO timestamps in minutes.
 */
export function durationBetween(
  startIso: string,
  endIso: string,
): number | null {
  const startMs = _utcMillisFromIso(startIso);
  const endMs = _utcMillisFromIso(endIso);

  if (startMs === null || endMs === null) return null;
  return Math.round((endMs - startMs) / (60 * 1000));
}

/**
 * Format a UTC ISO timestamp for display in a specific timezone.
 * More flexible than formatLocalDateTime — accepts custom zone.
 */
export function formatInZone(
  isoUtc: string,
  options: Intl.DateTimeFormatOptions = {},
  zone?: string,
): string {
  if (!isoUtc) return '';

  const d = new Date(isoUtc);
  if (isNaN(d.getTime())) return '';

  const displayZone = zone ?? _resolveLocalTimeZone();

  const defaultOpts: Intl.DateTimeFormatOptions = {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
    timeZone: displayZone,
  };

  return d.toLocaleString(undefined, { ...defaultOpts, ...options });
}

/**
 * Get human-readable relative time (e.g., "in 2 hours", "3 days ago").
 * Uses Intl.RelativeTimeFormat for locale-aware output.
 */
export function formatRelativeTime(
  isoUtc: string,
  zone?: string,
): string {
  const ms = _utcMillisFromIso(isoUtc);
  if (ms === null) return '';

  const now = Date.now();
  const diff = ms - now;
  const absDiff = Math.abs(diff);

  const rtf = new Intl.RelativeTimeFormat(undefined, { numeric: 'auto' });

  if (absDiff < 60 * 1000) {
    return rtf.format(Math.round(diff / 1000), 'second');
  } else if (absDiff < 60 * 60 * 1000) {
    return rtf.format(Math.round(diff / (60 * 1000)), 'minute');
  } else if (absDiff < 24 * 60 * 60 * 1000) {
    return rtf.format(Math.round(diff / (60 * 60 * 1000)), 'hour');
  } else {
    return rtf.format(Math.round(diff / (24 * 60 * 60 * 1000)), 'day');
  }
}

/**
 * Check if two UTC ISO timestamps represent the same calendar day
 * in a specific timezone.
 */
export function isSameCalendarDay(
  isoUtcA: string,
  isoUtcB: string,
  zone?: string,
): boolean {
  const zoneName = zone ?? _resolveLocalTimeZone();

  const partsA = wallPartsFromUtcIso(isoUtcA, zoneName);
  const partsB = wallPartsFromUtcIso(isoUtcB, zoneName);

  if (!partsA || !partsB) return false;

  return (
    partsA.year === partsB.year &&
    partsA.month === partsB.month &&
    partsA.day === partsB.day
  );
}

/**
 * Get the start and end of a calendar day in UTC, given a timezone.
 * Useful for fetching all events on a specific day.
 */
export function getDayRangeInZone(
  dateIsoUtc: string,
  zone?: string,
): { startIso: string; endIso: string } | null {
  const zoneName = zone ?? _resolveLocalTimeZone();
  const parts = wallPartsFromUtcIso(dateIsoUtc, zoneName);

  if (!parts) return null;

  const startWall = `${parts.year}-${String(parts.month).padStart(2, '0')}-${String(parts.day).padStart(2, '0')} 00:00:00`;
  const endWall = `${parts.year}-${String(parts.month).padStart(2, '0')}-${String(parts.day).padStart(2, '0')} 23:59:59`;

  const startLux = DateTime.fromFormat(startWall, 'yyyy-MM-dd HH:mm:ss', { zone: zoneName });
  const endLux = DateTime.fromFormat(endWall, 'yyyy-MM-dd HH:mm:ss', { zone: zoneName });

  return {
    startIso: startLux.toUTC().toISO()!,
    endIso: endLux.toUTC().toISO()!,
  };
}

/**
 * Validate that a UTC ISO timestamp is parseable and represents a valid instant.
 */
export function isValidUtcIso(iso: string | null | undefined): boolean {
  return _utcMillisFromIso(iso) !== null;
}

/**
 * Get the current time in UTC ISO format.
 */
export function nowUtcIso(): string {
  return new Date().toISOString();
}

/**
 * Get the current time in workspace timezone as wall parts.
 */
export function nowInWorkspaceZone(): ZonedWallParts | null {
  return wallPartsFromUtcIso(nowUtcIso(), _resolveLocalTimeZone());
}
