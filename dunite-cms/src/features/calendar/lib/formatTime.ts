/**
 * Human-friendly local times for the planner surface (explicit 12-hour clock).
 */

const SLOT_TIME_OPTS: Intl.DateTimeFormatOptions = {
  hour:   'numeric',
  minute: '2-digit',
  hour12: true,
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
  return new Date(iso).toLocaleString(undefined, SLOT_TIME_OPTS);
}

/** Schedule line for modals — e.g. "Fri, May 8, 2026, 11:32 PM". */
export function formatCalendarScheduledDetail(iso: string | null | undefined): string {
  if (!iso) return '—';
  return new Intl.DateTimeFormat(undefined, SCHEDULE_DETAIL_OPTS).format(new Date(iso));
}

export function isoToDatetimeLocalInput(iso: string | null | undefined): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
