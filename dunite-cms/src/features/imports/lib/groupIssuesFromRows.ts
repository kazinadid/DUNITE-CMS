import type { NormalizedImportRow } from '../types';

export interface GroupedIssueRollup {
  code: string;
  count: number;
  severity: 'error' | 'warning';
  sampleMessage: string;
}

/**
 * Rolls up issue codes across visible rows for dashboard-style groupings.
 */
export function groupIssuesFromRows(
  rows: readonly NormalizedImportRow[],
  opts?: { limit?: number },
): { errors: GroupedIssueRollup[]; warnings: GroupedIssueRollup[] } {
  const limit = opts?.limit ?? 12;
  const errMap = new Map<string, { count: number; sample: string }>();
  const warnMap = new Map<string, { count: number; sample: string }>();

  for (const row of rows) {
    for (const issue of row.issues) {
      const target = issue.severity === 'error' ? errMap : warnMap;
      const cur = target.get(issue.code);
      if (cur) cur.count += 1;
      else target.set(issue.code, { count: 1, sample: issue.message });
    }
  }

  const toSorted = (m: Map<string, { count: number; sample: string }>, sev: 'error' | 'warning') =>
    [...m.entries()]
      .map(([code, v]) => ({ code, count: v.count, severity: sev, sampleMessage: v.sample }))
      .sort((a, b) => b.count - a.count)
      .slice(0, limit);

  return {
    errors: toSorted(errMap, 'error'),
    warnings: toSorted(warnMap, 'warning'),
  };
}
