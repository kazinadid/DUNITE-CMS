import dayjs from 'dayjs';
import customParseFormat from 'dayjs/plugin/customParseFormat';
import utc from 'dayjs/plugin/utc';
import timezone from 'dayjs/plugin/timezone';

import type { NormalizedImportRow } from '../types';

dayjs.extend(utc);
dayjs.extend(timezone);
dayjs.extend(customParseFormat);

/** OA (Excel) serial: days since 1899-12-30 UTC, fractional day = time-of-day. */
const OA_UNIX_EPOCH_OFFSET = 25569; // days from OA epoch to 1970-01-01

const FORMATS_STRICT = [
  'YYYY-MM-DDTHH:mm:ss.SSSZ',
  'YYYY-MM-DDTHH:mm:ssZ',
  'YYYY-MM-DDTHH:mm:ss.SSS',
  'YYYY-MM-DDTHH:mm:ss',
  'YYYY-MM-DDTHH:mm',
  'YYYY-MM-DD HH:mm:ss',
  'YYYY-MM-DD HH:mm',
  'YYYY-MM-DD',
  'MM/DD/YYYY HH:mm:ss',
  'MM/DD/YYYY HH:mm',
  'MM/DD/YYYY',
  'M/D/YYYY HH:mm:ss',
  'M/D/YYYY',
  'DD/MM/YYYY HH:mm:ss',
  'DD/MM/YYYY HH:mm',
  'DD/MM/YYYY',
  'D/M/YYYY',
  'MMM D YYYY h:mm A',
  'MMM D, YYYY h:mm A',
  'MMM D YYYY',
  'MMM D, YYYY',
] as const;

const RE_ISO_OFFSET = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d{1,9})?)?(Z|[+-]\d{2}(:?\d{2})?)$/i;

const RE_UNIX_INT = /^\d{10,13}$/;

/** Looks like OA serial: optional fraction, not a bare calendar year. */
const RE_OA_SERIAL = /^\d{4,6}(\.\d{1,12})?$/;

export type PublishDateReasonCode =
  | 'empty'
  | 'unsupported_publish_date_format'
  | 'numeric_timestamp_invalid'
  | 'excel_serial_out_of_range'
  | 'excel_serial_invalid'
  | 'date_only_invalid'
  | 'native_parse_unsafe'
  | 'unrecognized_date_format';

export const PUBLISH_DATE_REASON_MESSAGES: Record<PublishDateReasonCode, string> = {
  empty: 'No publish date was provided.',
  unsupported_publish_date_format: 'Unsupported publish date format.',
  numeric_timestamp_invalid: 'Numeric timestamp could not be read as a valid instant.',
  excel_serial_out_of_range: 'Spreadsheet serial date is outside the supported range.',
  excel_serial_invalid: 'Spreadsheet serial date could not be converted.',
  date_only_invalid: 'Calendar date is not valid for the workspace timezone.',
  native_parse_unsafe: 'Date string was rejected after validation.',
  unrecognized_date_format: 'Publish date could not be interpreted.',
};

export function lookupPublishDateReasonMessage(code?: string): string {
  if (code && Object.prototype.hasOwnProperty.call(PUBLISH_DATE_REASON_MESSAGES, code)) {
    return PUBLISH_DATE_REASON_MESSAGES[code as PublishDateReasonCode];
  }
  return PUBLISH_DATE_REASON_MESSAGES.unsupported_publish_date_format;
}

export interface ParsePublishDateResult {
  date: Date | null;
  /** Non-fatal parse path (e.g. heuristic). */
  warning?: string;
  reasonCode?: PublishDateReasonCode;
  normalizedIso?: string | null;
}

export function isValidUtcInstant(d: unknown): d is Date {
  return d instanceof Date && Number.isFinite(d.getTime());
}

/**
 * Normalizes `publish_at` after JSON transport or legacy rows: ISO strings → `Date`,
 * drops invalid `Date` instances.
 */
export function coerceUnknownToUtcDate(value: unknown, fallbackTz = 'UTC'): Date | null {
  if (value == null) return null;
  if (value instanceof Date) {
    return Number.isFinite(value.getTime()) ? value : null;
  }
  if (typeof value === 'string') {
    const r = parsePublishDate(value, fallbackTz);
    return r.date;
  }
  return null;
}

function toUtcDateOrNull(d: Date): Date | null {
  return Number.isFinite(d.getTime()) ? d : null;
}

function oaSerialToUtcDate(serial: number): Date | null {
  if (!Number.isFinite(serial)) return null;
  const whole = Math.floor(serial);
  const frac = serial - whole;
  const ms = (whole - OA_UNIX_EPOCH_OFFSET) * 86_400_000 + Math.round(frac * 86_400_000);
  const d = new Date(ms);
  return toUtcDateOrNull(d);
}

/**
 * Interprets a string as Excel / OA serial when it matches shape and magnitude.
 * Rejects bare years (e.g. "2026") and Unix-like 10–13 digit strings.
 */
function tryParseOaSerialString(s: string): Date | null {
  if (!RE_OA_SERIAL.test(s) || RE_UNIX_INT.test(s)) return null;
  const n = Number(s);
  if (!Number.isFinite(n)) return null;
  const intPart = Math.floor(n);
  const hasFraction = s.includes('.');
  // Bare 1900–2100 without fractional part → likely a year, not OA.
  if (!hasFraction && intPart >= 1900 && intPart <= 2100) return null;
  // Typical modern sheet serials (approx 1995–2175) plus headroom.
  if (n < 30000 || n > 800_000) return null;
  return oaSerialToUtcDate(n);
}

function tryParseUnixString(s: string): ParsePublishDateResult {
  const n = Number(s);
  const ms = s.length <= 10 ? n * 1000 : n;
  const d = new Date(ms);
  if (!toUtcDateOrNull(d)) {
    return {
      date: null,
      reasonCode: 'numeric_timestamp_invalid',
      normalizedIso: null,
    };
  }
  return { date: d, normalizedIso: d.toISOString() };
}

/**
 * Parse schedule cell → validated UTC `Date`. Never returns an invalid `Date`.
 * All wall-clock interpretations use `fallbackTz`, then convert to UTC for storage.
 */
export function parsePublishDate(raw: string, fallbackTz: string): ParsePublishDateResult {
  const s = raw.trim();
  if (!s) {
    return { date: null, reasonCode: 'empty', normalizedIso: null };
  }

  if (RE_UNIX_INT.test(s)) {
    return tryParseUnixString(s);
  }

  const oa = tryParseOaSerialString(s);
  if (oa) {
    return {
      date: oa,
      normalizedIso: oa.toISOString(),
      warning: 'excel_oa_serial',
    };
  }

  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) {
    const d = dayjs.tz(`${s} 12:00`, 'YYYY-MM-DD HH:mm', fallbackTz);
    if (!d.isValid()) {
      return {
        date: null,
        reasonCode: 'date_only_invalid',
        normalizedIso: null,
      };
    }
    const utc = d.utc().toDate();
    return toUtcDateOrNull(utc)
      ? { date: utc, normalizedIso: utc.toISOString() }
      : { date: null, reasonCode: 'date_only_invalid', normalizedIso: null };
  }

  if (RE_ISO_OFFSET.test(s)) {
    const ms = Date.parse(s);
    if (!Number.isFinite(ms)) {
      return { date: null, reasonCode: 'unsupported_publish_date_format', normalizedIso: null };
    }
    const d = new Date(ms);
    return toUtcDateOrNull(d)
      ? { date: d, normalizedIso: d.toISOString() }
      : { date: null, reasonCode: 'unsupported_publish_date_format', normalizedIso: null };
  }

  for (const f of FORMATS_STRICT) {
    const d = dayjs.tz(s, f, fallbackTz);
    if (!d.isValid()) continue;
    const utc = d.utc().toDate();
    if (toUtcDateOrNull(utc)) {
      return { date: utc, normalizedIso: utc.toISOString() };
    }
  }

  // Lenient native parse only for strings that look like real datetimes (not short codes).
  if (s.length >= 8 && /[-/:T]/.test(s)) {
    const ms = Date.parse(s);
    if (Number.isFinite(ms)) {
      const d = new Date(ms);
      if (toUtcDateOrNull(d)) {
        return {
          date: d,
          normalizedIso: d.toISOString(),
          warning: 'native_date_parse',
        };
      }
    }
  }

  return {
    date: null,
    reasonCode: 'unrecognized_date_format',
    normalizedIso: null,
  };
}

export function getDefaultTimeZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  } catch {
    return 'UTC';
  }
}

export function publishAtToIsoOrNull(value: unknown): string | null {
  const d = coerceUnknownToUtcDate(value);
  return d ? d.toISOString() : null;
}

export function formatPublishAtForDisplay(
  publishAt: unknown,
  publishAtRaw: string | undefined,
  opts?: { dateStyle?: Intl.DateTimeFormatOptions['dateStyle']; timeStyle?: Intl.DateTimeFormatOptions['timeStyle'] },
): string {
  const d = coerceUnknownToUtcDate(publishAt);
  if (d) {
    try {
      return new Intl.DateTimeFormat(undefined, {
        dateStyle: opts?.dateStyle ?? 'short',
        timeStyle: opts?.timeStyle ?? 'short',
      }).format(d);
    } catch {
      return d.toISOString();
    }
  }
  const raw = publishAtRaw?.trim();
  if (raw) return raw.length > 48 ? `${raw.slice(0, 48)}…` : raw;
  return '—';
}

/**
 * Coerces JSON-revived `publishAt` strings and repairs invalid `Date` before rules run.
 */
export function sanitizeRowPublishAtField(row: NormalizedImportRow, fallbackTz: string): void {
  const raw = row.publishAtRaw?.trim() ?? '';
  const at = row.publishAt as unknown;

  if (at instanceof Date) {
    if (!Number.isFinite(at.getTime())) {
      row.publishAt = null;
      if (raw) {
        row.parseHints.dateParseFailed = true;
        row.parseHints.dateParseDiagnostics = {
          original: raw,
          normalizedIso: null,
          reasonCode: 'unsupported_publish_date_format',
          reason: PUBLISH_DATE_REASON_MESSAGES.unsupported_publish_date_format,
        };
      }
    }
    return;
  }

  if (typeof at === 'string') {
    const p = parsePublishDate(at, fallbackTz);
    row.publishAt = p.date;
    return;
  }

  if (at != null) {
    row.publishAt = null;
  }
}
