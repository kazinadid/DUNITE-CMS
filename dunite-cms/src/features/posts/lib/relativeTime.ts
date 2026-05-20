// ============================================================================
//  Relative time formatting
// ----------------------------------------------------------------------------
//  Linear / Notion / Buffer style "5m ago" / "in 2 days" timestamps.
//  Uses the platform `Intl.RelativeTimeFormat` so localisation is automatic.
//
//  Absolute strings delegate to `@/lib/date` which pins formatting to
//  {@link resolveLocalTimeZone} (explicit workspace TZ or browser fallback).
// ============================================================================

import { formatLocalDateTime, resolveLocalTimeZone } from '@/lib/date';

const UNITS: { unit: Intl.RelativeTimeFormatUnit; ms: number }[] = [
  { unit: 'year',   ms: 1000 * 60 * 60 * 24 * 365 },
  { unit: 'month',  ms: 1000 * 60 * 60 * 24 * 30  },
  { unit: 'week',   ms: 1000 * 60 * 60 * 24 * 7   },
  { unit: 'day',    ms: 1000 * 60 * 60 * 24       },
  { unit: 'hour',   ms: 1000 * 60 * 60            },
  { unit: 'minute', ms: 1000 * 60                 },
  { unit: 'second', ms: 1000                      },
];

let _rtf: Intl.RelativeTimeFormat | null = null;
function rtf() {
  if (!_rtf) _rtf = new Intl.RelativeTimeFormat(undefined, { numeric: 'auto' });
  return _rtf;
}

/**
 * Format an ISO timestamp as a short, human-readable relative string.
 *
 *   "Just now"         — within 30 seconds
 *   "2m ago"           — past, < 1 hour
 *   "in 3 days"        — future
 *   "yesterday"        — Intl.RelativeTimeFormat default
 *   "Mar 12, 2025"     — falls back to absolute when older than ~6 months
 */
export function formatRelative(iso: string | null | undefined): string {
  if (!iso) return '';
  const date = new Date(iso);
  const ms = date.getTime() - Date.now();
  const abs = Math.abs(ms);

  if (abs < 30 * 1000) return 'Just now';

  // Older than ~6 months — show absolute date so users orient quickly.
  if (abs > 1000 * 60 * 60 * 24 * 30 * 6) {
    return date.toLocaleDateString(undefined, {
      timeZone: resolveLocalTimeZone(),
      month:    'short',
      day:      'numeric',
      year:     'numeric',
    });
  }

  for (const { unit, ms: unitMs } of UNITS) {
    if (abs >= unitMs || unit === 'second') {
      const value = Math.round(ms / unitMs);
      return rtf().format(value, unit);
    }
  }
  return '';
}

/** Same input, but always full date+time in the viewer's local zone. */
export function formatAbsolute(iso: string | null | undefined): string {
  return formatLocalDateTime(iso, {
    weekday: undefined,
    month:   'short',
    day:     'numeric',
    year:    'numeric',
    hour:    '2-digit',
    minute:  '2-digit',
    hour12:  true,
  });
}
