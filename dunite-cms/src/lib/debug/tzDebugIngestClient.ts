/**
 * Dev visibility for `/api/debug/tz-ingest`: earlier `.catch(() => {})` hid 403 (prod/local `next start`)
 * and log-append 500 — no workspace file ⇒ no Cursor NDJSON. Console warns on failure and logs successes.
 *
 * `localStorage` mirrors:
 *   - {@link TZ_DEBUG_LAST_INGEST_KEY} — last full payload envelope
 *   - {@link TZ_DEBUG_INGEST_ROLL_KEY} — rolling compact trail (TZ2 vs FC‑VIEW vs FC‑DROP).
 * DevTools + automatic workspace mirror (`dunite-tz-export.latest.json` via `EXPORT-BUNDLE` POST to `/api/debug/tz-ingest`).
 */

import { isTzDebugClientHooksEnabled } from '@/lib/debug/tzIngestGate';

/** Application → Local Storage → copy JSON for Cursor. */
export const TZ_DEBUG_LAST_INGEST_KEY = '__dunite_tz_last_ingest';

/** Rolling buffer (JSON array), max {@link TZ_INGEST_ROLL_CAP} rows. Also see RAM mirror `window.__duniteTzTrail`. */
export const TZ_DEBUG_INGEST_ROLL_KEY = '__dunite_tz_ingest_roll';

const TZ_INGEST_ROLL_CAP = 32;

function rollupData(data: unknown): Record<string, unknown> {
  if (!data || typeof data !== 'object' || Array.isArray(data)) return {};
  const d = data as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  const strKeys =
    [
      'iso',
      'startUtc',
      'endUtc',
      'fcStartStr',
      'interpZone',
      'workspaceZone',
      'workspaceTz',
      'isoPrefix',
      'pathname',
      'origin',
      'nodeEnvBundled',
      'browserTz',
      'firstUtcPrefix',
    ] as const;

  for (const k of strKeys) {
    const v = d[k];
    if (typeof v === 'string') {
      out[k] = v.length > 140 ? `${v.slice(0, 137)}…` : v;
    }
  }

  if (typeof d.parseMeta === 'object' && d.parseMeta !== null) {
    try {
      out.parseMetaShort = JSON.stringify(d.parseMeta).slice(0, 220);
    } catch {
      /* ignore */
    }
  }

  return out;
}

/** Client RAM mirror when `/api/debug/tz-ingest` or Cursor’s localhost never see your traffic. Paste: `copy(JSON.stringify(window.__duniteTzTrail, null, 2))` */
const TZ_WINDOW_TRAIL_CAP = 48;

type TzTrailWindow = Window & {
  __duniteTzTrail?: Record<string, unknown>[];
  __duniteTzUnloadAttached?: boolean;
  /** Paste result for Cursor: bundled trail + whatever landed in `localStorage`. */
  __duniteTzExport?: () => string;
  /** Triggers browser download — move file next to Cursor workspace (`dunite-tz-export*.json`). */
  __duniteTzExportDownload?: () => boolean;
};

function readJsonLocalStorage(key: string): unknown {
  try {
    const raw = window.localStorage.getItem(key);
    if (raw == null || raw === '') return null;
    return JSON.parse(raw) as unknown;
  } catch {
    return null;
  }
}

/** Same object as DevTools helpers; posted as `/api/debug/tz-ingest` with `hypothesisId: EXPORT-BUNDLE` to mirror a JSON file beside `.git`. */
export function buildTzEvidenceSnapshot(): Record<string, unknown> {
  if (typeof window === 'undefined') {
    return { error: 'ssr_no_window', sessionId: 'e436a7' };
  }

  const w = window as TzTrailWindow;
  return {
    sessionId:      'e436a7',
    exportsAtMs:    Date.now(),
    pageOrigin:     window.location.origin,
    pagePath:       window.location.pathname,
    nodeEnvBundled: process.env.NODE_ENV ?? '(unset)',
    windowTrail:    w.__duniteTzTrail ?? [],
    ingestRoll:     readJsonLocalStorage(TZ_DEBUG_INGEST_ROLL_KEY),
    ingestLast:     readJsonLocalStorage(TZ_DEBUG_LAST_INGEST_KEY),
  };
}

/** Coalesced POST to `/api/debug/tz-ingest` (`EXPORT-BUNDLE`): writes Cursor-readable JSON beside `.git`. */
let workspaceTzDumpQueued = false;
function scheduleTzWorkspaceEvidenceDump(): void {
  if (typeof window === 'undefined') return;
  if (!isTzDebugClientHooksEnabled()) return;
  if (workspaceTzDumpQueued) return;

  workspaceTzDumpQueued = true;

  queueMicrotask(() => {
    workspaceTzDumpQueued = false;
    const payload = {
      ...buildTzEvidenceSnapshot(),
      hypothesisId: 'EXPORT-BUNDLE',
      location:       'tzDebugIngestClient:schedule',
      message:
        'Full evidence mirror for Cursor (windowTrail + localStorage rolls after ingest)',
      timestamp: Date.now(),
    };

    void fetch(`${window.location.origin}/api/debug/tz-ingest`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      cache:       'no-store',
      body:        JSON.stringify(payload),
    })
      .then(async (res) => {
        if (!res.ok && isTzDebugClientHooksEnabled()) {
          let t = '';
          try {
            t = await res.clone().text();
          } catch {
            /* ignore */
          }
          console.warn('[tz-ingest EXPORT-BUNDLE]', res.status, t.slice(0, 260));
          return;
        }
        try {
          const j = (await res.json()) as {
            exportLatestWritten?: string | null;
          };

          if (j.exportLatestWritten) {
            console.info('[tz-export-latest]', j.exportLatestWritten);
          }
        } catch {
          /* ignore */
        }
      })
      .catch((e: unknown) => {
        if (isTzDebugClientHooksEnabled()) {
          console.warn('[tz-ingest EXPORT-BUNDLE] fetch', e);
        }
      });
  });
}

function attachGlobalTzExportOnce(): void {
  if (typeof window === 'undefined') return;

  const w = window as TzTrailWindow;
  if (typeof w.__duniteTzExport === 'function') return;

  const buildPayloadString = (): string =>
    JSON.stringify(buildTzEvidenceSnapshot(), null, 2);

  w.__duniteTzExport = (): string => buildPayloadString();

  w.__duniteTzExportDownload = (): boolean => {
    try {
      const txt = buildPayloadString();
      const blob = new Blob([txt], { type: 'application/json' });
      const u = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = u;
      a.download = `dunite-tz-export-${Date.now()}.json`;
      a.rel = 'noopener';
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(u);
      return true;
    } catch {
      return false;
    }
  };
}

/** Registers `window.__duniteTzExport()` (idempotent). Call from dashboard boot so export exists even before first ingest. */
export function ensureTzDebugExportHook(): void {
  if (typeof window === 'undefined') return;
  attachGlobalTzExportOnce();
}

function mirrorTzPayloadToWindow(payload: Record<string, unknown>): void {
  if (typeof window === 'undefined') return;

  const w = window as TzTrailWindow;
  const entry: Record<string, unknown> = {
    receivedAtMs: Date.now(),
    hypothesisId: payload.hypothesisId,
    location: payload.location,
    peek: rollupData(payload.data),
    pageOrigin: window.location.origin,
    pagePath:   window.location.pathname,
    nodeEnv:    process.env.NODE_ENV ?? '(unset)',
  };

  w.__duniteTzTrail = [...(w.__duniteTzTrail ?? []), entry].slice(
    -TZ_WINDOW_TRAIL_CAP,
  );
}

function attachTzUnloadBeaconOnce(): void {
  if (
    typeof window === 'undefined'
    || !isTzDebugClientHooksEnabled()
    || typeof navigator.sendBeacon !== 'function'
  ) return;

  const w = window as TzTrailWindow;
  if (w.__duniteTzUnloadAttached) return;

  w.__duniteTzUnloadAttached = true;

  const flush = (): void => {
    const tail = [...(w.__duniteTzTrail ?? [])].slice(-14);
    if (tail.length === 0) return;

    const url = `${window.location.origin}/api/debug/tz-ingest`;
    const blob = JSON.stringify({
      sessionId:      'e436a7',
      hypothesisId: 'UNLOAD-BEACON',
      location:       'tzDebugIngestClient:pagehide',
      message:        'flush window.__duniteTzTrail tail on unload',
      data: {
        pageOrigin:     window.location.origin,
        pagePath:       window.location.pathname,
        nodeEnvBundled: process.env.NODE_ENV,
        trailTail:       tail,
      },
      timestamp: Date.now(),
    });

    navigator.sendBeacon(
      url,
      new Blob([blob], { type: 'application/json' }),
    );
  };

  window.addEventListener('pagehide', flush, { passive: true });
}

function appendRoll(entry: {
  timestamp: number;
  hypothesisId: unknown;
  writtenTo?: string | null;
  httpStatus?: number;
  err?: string;
  peek: Record<string, unknown>;
}) {
  try {
    const raw = window.localStorage.getItem(TZ_DEBUG_INGEST_ROLL_KEY);
    let arr = raw ? (JSON.parse(raw) as typeof entry[]) : [];
    if (!Array.isArray(arr)) arr = [];
    arr.push(entry);
    window.localStorage.setItem(
      TZ_DEBUG_INGEST_ROLL_KEY,
      JSON.stringify(arr.slice(-TZ_INGEST_ROLL_CAP)),
    );
  } catch {
    /* quota / disabled */
  }
}

function stashLastTzIngest(
  hypothesisId: unknown,
  payload: Record<string, unknown>,
  writtenTo?: string | null,
  httpStatus?: number,
  errorBody?: string,
) {
  const timestamp = Date.now();
  const envelope = {
    timestamp,
    hypothesisId,
    writtenTo,
    httpStatus,
    errorBodySnippet: errorBody?.slice(0, 400),
    location: payload.location,
    sessionId:        payload.sessionId,
    data:             payload.data,
  };

  try {
    window.localStorage.setItem(TZ_DEBUG_LAST_INGEST_KEY, JSON.stringify(envelope));
  } catch {
    /* private/storage disabled */
  }

  appendRoll({
    timestamp,
    hypothesisId,
    writtenTo,
    httpStatus,
    err:
      typeof errorBody === 'string'
        ? errorBody.slice(0, 260)
        : undefined,
    peek: rollupData(payload.data),
  });

  scheduleTzWorkspaceEvidenceDump();
}

export function postTzDebugIngest(payload: Record<string, unknown>): void {
  if (typeof window === 'undefined') return;

  mirrorTzPayloadToWindow(payload);
  attachGlobalTzExportOnce();
  attachTzUnloadBeaconOnce();

  const ingestUrl =
    `${window.location.origin}/api/debug/tz-ingest`;

  void fetch(ingestUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
    credentials: 'include',
    cache: 'no-store',
  })
    .then(async (res) => {
      if (!res.ok) {
        let body = '';
        try {
          body = await res.clone().text();
        } catch {
          /* ignore */
        }
        if (isTzDebugClientHooksEnabled()) {
          console.warn(
            '[tz-ingest] non-OK',
            res.status,
            payload.hypothesisId,
            body.slice(0, 200),
          );
        }
        stashLastTzIngest(payload.hypothesisId, payload, undefined, res.status, body);
        return;
      }

      let writtenTo: string | null = null;

      try {
        const j = (await res.json()) as { ok?: boolean; writtenTo?: string };
        writtenTo = j.writtenTo ?? null;

        if (isTzDebugClientHooksEnabled()) {
          console.info(
            '[tz-ingest]',
            String(payload.hypothesisId),
            writtenTo ?? '(missing writtenTo)',
          );
        }
      } catch {
        if (isTzDebugClientHooksEnabled()) {
          console.info(
            '[tz-ingest]',
            String(payload.hypothesisId),
            'ok (parse body skipped)',
          );
        }
      }

      stashLastTzIngest(
        payload.hypothesisId,
        payload,
        writtenTo ?? null,
        res.status,
      );
    })
    .catch((err: unknown) => {
      if (isTzDebugClientHooksEnabled()) {
        console.warn('[tz-ingest] fetch error', err, payload.hypothesisId);
      }
      const msg =
        err instanceof Error ? err.message.slice(0, 400)
        : String(err).slice(0, 400);
      stashLastTzIngest(payload.hypothesisId, payload, undefined, undefined, `fetch:${msg}`);
    });
}
