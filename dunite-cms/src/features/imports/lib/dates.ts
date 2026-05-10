import dayjs from 'dayjs';
import customParseFormat from 'dayjs/plugin/customParseFormat';
import utc from 'dayjs/plugin/utc';
import timezone from 'dayjs/plugin/timezone';

dayjs.extend(utc);
dayjs.extend(timezone);
dayjs.extend(customParseFormat);

const FORMATS = [
  'YYYY-MM-DDTHH:mm:ss.SSSZ',
  'YYYY-MM-DDTHH:mm:ssZ',
  'YYYY-MM-DDTHH:mm:ss',
  'YYYY-MM-DD HH:mm:ss',
  'YYYY-MM-DD',
  'MM/DD/YYYY HH:mm:ss',
  'MM/DD/YYYY',
  'DD/MM/YYYY HH:mm',
  'DD/MM/YYYY',
  'M/D/YYYY',
  'MMM D YYYY h:mm A',
  'MMM D, YYYY',
];

/**
 * Parse schedule cell → UTC `Date`. Date-only values use noon in `fallbackTz`
 * (typically `Intl` browser zone) to reduce DST surprise.
 */
export function parsePublishDate(
  raw: string,
  fallbackTz: string,
): { date: Date | null; warning?: string } {
  const s = raw.trim();
  if (!s) return { date: null };

  if (/^\d{10,13}$/.test(s)) {
    const n = Number(s);
    const ms = s.length <= 10 ? n * 1000 : n;
    const d = new Date(ms);
    return Number.isFinite(d.getTime())
      ? { date: d }
      : { date: null, warning: 'numeric_timestamp_invalid' };
  }

  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) {
    const d = dayjs.tz(`${s} 12:00`, 'YYYY-MM-DD HH:mm', fallbackTz);
    return d.isValid()
      ? { date: d.utc().toDate() }
      : { date: null, warning: 'date_only_invalid' };
  }

  const zUtc = dayjs(s);
  if (zUtc.isValid() && /[zZ]|([+-]\d{2}:?\d{2})$/.test(s)) {
    return { date: zUtc.utc().toDate() };
  }

  for (const f of FORMATS) {
    const d = dayjs.tz(s, f, fallbackTz);
    if (d.isValid()) {
      return { date: d.utc().toDate() };
    }
  }

  const native = Date.parse(s);
  if (!Number.isNaN(native)) {
    return { date: new Date(native) };
  }

  return { date: null, warning: 'unrecognized_date_format' };
}

export function getDefaultTimeZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  } catch {
    return 'UTC';
  }
}
