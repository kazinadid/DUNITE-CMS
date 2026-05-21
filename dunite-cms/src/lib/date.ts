// ============================================================================
//  CMS time model (production)
// ----------------------------------------------------------------------------
//  • Persistence: UTC ISO strings / Postgres `timestamptz` only.
//  • Workers / SQL: compare instants in UTC (`now()` + timestamptz).
//  • UI: format and edit in ONE consistent IANA zone per session.
//
//  When `NEXT_PUBLIC_WORKSPACE_TIME_ZONE` is set (e.g. `Asia/Dhaka`), that
//  zone drives BOTH human-readable labels and `<input type="datetime-local">`
//  encoding/decoding so headers, calendar, and pickers never disagree.
//
//  When it is unset, we use the browser/OS zone for both (true “local” mode).
//
//  Conversions use `dayjs` + `utc` + `timezone` for DST-safe wall ↔ UTC.
//  Display still uses `Intl` with an explicit `timeZone` for locale-friendly text.
// ============================================================================

import {
  utcIsoFromWallInZone,
  utcIsoToDatetimeLocalValue,
  utcMillisFromIso,
  wallPartsFromUtcIso,
} from '@/lib/time/workspaceTime';

/**
 * Whether the deployment pins a workspace IANA timezone via public env.
 * When true, scheduling UI aligns with {@link resolveLocalTimeZone}.
 */
export function hasConfiguredWorkspaceTimeZone(): boolean {
  const configured = process.env.NEXT_PUBLIC_WORKSPACE_TIME_ZONE?.trim();
  return Boolean(configured && isValidTimeZone(configured));
}

/**
 * Resolve the IANA timezone the CMS dashboard should display and schedule in.
 */
export function resolveLocalTimeZone(): string {
  const configured = process.env.NEXT_PUBLIC_WORKSPACE_TIME_ZONE?.trim();
  if (configured && isValidTimeZone(configured)) return configured;

  try {
    const browserZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    if (browserZone && isValidTimeZone(browserZone) && browserZone !== 'UTC') {
      return browserZone;
    }
  } catch {
    /* fall through */
  }

  return 'Asia/Dhaka';
}

function isValidTimeZone(timeZone: string): boolean {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone }).format(new Date(0));
    return true;
  } catch {
    return false;
  }
}

/**
 * IANA zone used to encode/decode `<input type="datetime-local">` naive strings.
 *
 * Must match the zone used by {@link formatLocalDateTime} family so pickers and
 * labels show the same wall clock.
 *
 * - **Explicit** `NEXT_PUBLIC_WORKSPACE_TIME_ZONE` → that zone (org clock).
 * - **Otherwise** → browser/OS zone in the client; on the server →
 *   {@link resolveLocalTimeZone()} (SSR/cron almost never drives these inputs).
 */
export function datetimeLocalInterpretationZone(): string {
  if (hasConfiguredWorkspaceTimeZone()) {
    return process.env.NEXT_PUBLIC_WORKSPACE_TIME_ZONE!.trim();
  }
  if (typeof window !== 'undefined') {
    try {
      const z = Intl.DateTimeFormat().resolvedOptions().timeZone;
      if (z && isValidTimeZone(z)) return z;
    } catch {
      /* fall through */
    }
    return 'UTC';
  }
  return resolveLocalTimeZone();
}

function toDate(input: string | number | Date | null | undefined): Date | null {
  if (input == null) return null;
  if (input instanceof Date) {
    return Number.isNaN(input.getTime()) ? null : input;
  }
  const d = new Date(input);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** Default formatting profile used by `formatLocalDateTime`. */
const DEFAULT_OPTS: Intl.DateTimeFormatOptions = {
  year:    'numeric',
  month:   'long',
  day:     'numeric',
  hour:    'numeric',
  minute:  '2-digit',
  hour12:  true,
  weekday: 'long',
};

/**
 * Format an ISO/Date as a long string in {@link resolveLocalTimeZone}
 * (workspace or browser fallback).
 */
export function formatLocalDateTime(
  input:    string | number | Date | null | undefined,
  options?: Intl.DateTimeFormatOptions,
): string {
  if (input == null) return '';
  const d = toDate(input);
  if (!d) return '';

  return d.toLocaleString(undefined, {
    timeZone: resolveLocalTimeZone(),
    ...DEFAULT_OPTS,
    ...options,
  });
}

export function formatLocalTime(
  input: string | number | Date | null | undefined,
): string {
  return formatLocalDateTime(input, {
    weekday: undefined,
    year:    undefined,
    month:   undefined,
    day:     undefined,
    hour:    'numeric',
    minute:  '2-digit',
    hour12:  true,
  });
}

export function formatLocalDate(
  input: string | number | Date | null | undefined,
): string {
  return formatLocalDateTime(input, {
    weekday: undefined,
    year:    'numeric',
    month:   'long',
    day:     'numeric',
    hour:    undefined,
    minute:  undefined,
    hour12:  undefined,
  });
}

/** Stable `YYYY-MM-DD` in {@link resolveLocalTimeZone}. */
export function localDateKey(input: string | number | Date | null | undefined): string {
  if (input == null) return '';
  let iso: string;
  if (input instanceof Date) {
    if (Number.isNaN(input.getTime())) return '';
    iso = input.toISOString();
  }
  else if (typeof input === 'number') {
    const d = new Date(input);
    if (Number.isNaN(d.getTime())) return '';
    iso = d.toISOString();
  }
  else {
    const ms = utcMillisFromIso(input);
    if (ms == null) return '';
    iso = new Date(ms).toISOString();
  }
  const zone = resolveLocalTimeZone();
  const p = wallPartsFromUtcIso(iso, zone);
  if (!p) return '';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${p.year}-${pad(p.month)}-${pad(p.day)}`;
}

export function formatLocalShort(
  input: string | number | Date | null | undefined,
): string {
  return formatLocalDateTime(input, {
    weekday: undefined,
    year:    undefined,
    month:   'short',
    day:     'numeric',
    hour:    'numeric',
    minute:  '2-digit',
    hour12:  true,
  });
}

/** `YYYY-MM-DDTHH:mm` for `<input type="datetime-local">`. */
export function isoToLocalDatetimeInput(
  input: string | number | Date | null | undefined,
): string {
  const d = toDate(input);
  if (!d) return '';

  const zone = datetimeLocalInterpretationZone();
  return utcIsoToDatetimeLocalValue(d.toISOString(), zone);
}

/** Wall digits from input → canonical UTC ISO (null if empty/invalid). */
export function localDatetimeInputToIso(value: string | null | undefined): string | null {
  if (!value) return null;
  const parsed = parseDatetimeLocalValue(value.trim());
  if (!parsed) return null;

  const zone = datetimeLocalInterpretationZone();
  return utcIsoFromWallInZone(parsed, zone);
}

/** UTC instant millis from persisted ISO (`Z` / offset-normalized strings). */
export function utcInstantMs(iso: string | null | undefined): number | null {
  return utcMillisFromIso(iso);
}

/** True when missing, unparseable, or before now + lead (with epsilon). */
export function isUtcScheduleTooSoon(
  iso: string | null | undefined,
  minLeadMs: number,
  toleranceMs = 999,
): boolean {
  const ms = utcInstantMs(iso);
  if (ms == null) return true;
  return ms < Date.now() + minLeadMs - toleranceMs;
}

interface DatetimeLocalParts {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
}

function parseDatetimeLocalValue(value: string): DatetimeLocalParts | null {
  const m = value.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/);
  if (!m) return null;

  const [, y, mo, d, h, mi] = m;
  const parts = {
    year: Number(y),
    month: Number(mo),
    day: Number(d),
    hour: Number(h),
    minute: Number(mi),
  };

  if (
    !Number.isInteger(parts.year) ||
    parts.month < 1 ||
    parts.month > 12 ||
    parts.day < 1 ||
    parts.day > 31 ||
    parts.hour < 0 ||
    parts.hour > 23 ||
    parts.minute < 0 ||
    parts.minute > 59
  ) {
    return null;
  }

  return parts;
}
