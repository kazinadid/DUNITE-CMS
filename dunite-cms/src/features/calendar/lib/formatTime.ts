/**
 * Human-friendly local times for the planner surface (explicit 12-hour clock).
 *
 * All formatters delegate the actual rendering to `@/lib/date`, which pins
 * the IANA time zone to the viewer's resolved zone so the calendar never
 * accidentally shows UTC (e.g. 1:10 PM instead of the user's 7:10 PM in
 * Asia/Dhaka).
 */

import {
  formatLocalDateTime,
  isoToLocalDatetimeInput,
  localDatetimeInputToIso,
} from '@/lib/date';

const SLOT_TIME_OPTS: Intl.DateTimeFormatOptions = {
  weekday: undefined,
  year:    undefined,
  month:   undefined,
  day:     undefined,
  hour:    'numeric',
  minute:  '2-digit',
  hour12:  true,
};

const SCHEDULE_DETAIL_OPTS: Intl.DateTimeFormatOptions = {
  weekday: 'long',
  month:   'short',
  day:     'numeric',
  year:    'numeric',
  hour:    'numeric',
  minute:  '2-digit',
  hour12:  true,
};

/** e.g. "11:32 PM", "12:01 AM" in the viewer's locale/time zone. */
export function formatCalendarSlotTime(iso: string | null | undefined): string {
  if (!iso) return '—';
  return formatLocalDateTime(iso, SLOT_TIME_OPTS);
}

/** Schedule line for modals — e.g. "Fri, May 8, 2026, 11:32 PM". */
export function formatCalendarScheduledDetail(iso: string | null | undefined): string {
  if (!iso) return '—';
  return formatLocalDateTime(iso, SCHEDULE_DETAIL_OPTS);
}

export function isoToDatetimeLocalInput(iso: string | null | undefined): string {
  return isoToLocalDatetimeInput(iso);
}

export function datetimeLocalInputToIso(value: string | null | undefined): string | null {
  return localDatetimeInputToIso(value);
}
