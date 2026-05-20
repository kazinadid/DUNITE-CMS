import { DateTime } from 'luxon';

export type FcUtcIsoMeta =
  | { source: 'fc-startStr-offset' | 'fc-startStr-wall'; startStrUsed: string }
  | { source: 'fc-date-fallback'; startStrUsed?: string };

/**
 * FC `formatIso` may emit `YYYY-MM-DD HH:mm(:ss(.fff)?)` — Luxon rejects the space delimiter.
 */
function normalizeFcIsoStartForLuxon(trimmed: string): string {
  const m = /^(\d{4}-\d{2}-\d{2})\s+(.*)$/.exec(trimmed);
  if (!m) return trimmed;
  return `${m[1]}T${m[2]}`;
}

/**
 * Persist `scheduled_at` from a drag/drop'd FullCalendar event.
 *
 * Prefer `event.startStr` — it reflects the calendar `timeZone` + Luxon parsing (see `ContentCalendar`).
 * Naive RFC3339-ish strings **without** an offset are interpreted as **wall clock in `workspaceIanaTz`**.
 */
export function fcEventStartToUtcIso(
  startStr: string | null | undefined,
  startDate: Date | null | undefined,
  workspaceIanaTz: string,
): { iso: string | null; meta: FcUtcIsoMeta | null } {
  const trimmedRaw = startStr?.trim();

  const hasEmbeddedOffset = (s: string) =>
    /[zZ]\s*$/.test(s) || /([+-])(\d{2}):?(\d{2})\s*$/.test(s.trim());

  const trimmed =
    trimmedRaw ? normalizeFcIsoStartForLuxon(trimmedRaw) : undefined;

  if (trimmed) {
    const dt = hasEmbeddedOffset(trimmed)
      ? DateTime.fromISO(trimmed, { setZone: true })
      : DateTime.fromISO(trimmed, { zone: workspaceIanaTz });

    if (dt.isValid) {
      const iso = dt.toUTC().toISO();
      if (iso) {
        return {
          iso,
          meta: hasEmbeddedOffset(trimmed)
            ? { source: 'fc-startStr-offset', startStrUsed: trimmed }
            : { source: 'fc-startStr-wall', startStrUsed: trimmed },
        };
      }
    }
  }

  if (startDate instanceof Date && !Number.isNaN(startDate.getTime())) {
    return {
      iso:           startDate.toISOString(),
      meta:           { source: 'fc-date-fallback', startStrUsed: trimmedRaw || undefined },
    };
  }

  return { iso: null, meta: null };
}
