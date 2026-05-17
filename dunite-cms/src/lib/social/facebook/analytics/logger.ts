import 'server-only';

export type AnalyticsLogPhase =
  | 'sync'
  | 'queue'
  | 'graph'
  | 'cron'
  | 'api';

export function analyticsStructuredLog(payload: {
  phase: AnalyticsLogPhase;
  event: string;
  organization_id?: string;
  sync_job_id?: string;
  post_id?: string;
  ms?: number;
  level?: 'info' | 'warn' | 'error';
  extra?: Record<string, unknown>;
}): void {
  const line = {
    svc:       'facebook_analytics',
    ts:        new Date().toISOString(),
    level:     payload.level ?? 'info',
    phase:     payload.phase,
    event:     payload.event,
    org:       payload.organization_id,
    sync_job:  payload.sync_job_id,
    post_id:   payload.post_id,
    ms:        payload.ms,
    ...payload.extra,
  };
  const msg = JSON.stringify(line);
  if (line.level === 'error') console.error(msg);
  else if (line.level === 'warn') console.warn(msg);
  else console.info(msg);
}
