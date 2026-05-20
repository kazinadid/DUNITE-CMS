import { existsSync } from 'fs';
import { appendFile, mkdir, writeFile } from 'fs/promises';
import path from 'path';
import { NextResponse } from 'next/server';

import { isTzDebugRouteEnabled } from '@/lib/debug/tzIngestGate';

/** In-memory FIFO (dev only) — disk log often missing from Cursor workspace; GET returns this for copy/paste. */
const INGEST_RING_MAX = 48;
/** Wall time when THIS route module initialized — use `GET …/tz-ingest` to verify you hit the same dev process as your browser traffic. */
const TZ_INGEST_SERVER_BOOT_MS = Date.now();
const recentIngests: Array<Record<string, unknown> & { _receivedAtMs?: number }> = [];

function pushRecentIngest(payload: Record<string, unknown>) {
  recentIngests.push({ ...payload, _receivedAtMs: Date.now() });
  while (recentIngests.length > INGEST_RING_MAX) recentIngests.shift();
}

/** Mirrors Cursor ingest NDJSON inside the Cursor workspace regardless of shell cwd / Next root. */
const LOG_BASENAME = 'debug-e436a7.log';

/** JSON snapshot beside any attempted log candidate — repo root AND nested cwd (`.git`-less sandboxes). */
const RING_SNAPSHOT_BASENAME = 'debug-tz-ingest-ring.json';

/** Evidence bundle beside repo root when POST `hypothesisId === 'EXPORT-BUNDLE'`. */
const EXPORT_LATEST_BASENAME = 'dunite-tz-export.latest.json';

/** Dev mirror in `public/` — always under `{cwd}/public/` for Cursor filesystem reads (`dunite-cms/public/...`). Do not expose in production (POST gated). */
const PUBLIC_EXPORT_BUNDLE = 'dunite-tz-debug-bundle.json';

/** Set after last successful POST snapshot write (survives probe via GET). */
let lastRingSnapshotWrittenPath: string | null = null;

/** Latest `EXPORT-BUNDLE` mirrored for GET (disk + Cursor HTTP tooling can flake). Serialized cap ~490k in `rememberTzExportBundleForGet`. */
let lastTzExportBundleForGet: Record<string, unknown> | null = null;

/** Prefer git-root NDJSON dirname first ({@link orderedCandidates}), then cwd ancestry; always include `process.cwd()` root attempt. */
function ingestRingSnapshotPaths(): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  function pushFromLogCandidate(candidateLogPath: string) {
    const snap = path.resolve(path.dirname(candidateLogPath), RING_SNAPSHOT_BASENAME);
    if (!seen.has(snap)) {
      seen.add(snap);
      out.push(snap);
    }
  }
  for (const logPath of orderedCandidates()) {
    pushFromLogCandidate(logPath);
  }
  pushFromLogCandidate(path.resolve(process.cwd(), LOG_BASENAME));
  return out;
}

async function persistIngestRingSnapshot(): Promise<string | null> {
  const snapshot = `${JSON.stringify(
    {
      updatedAt: new Date().toISOString(),
      cwd: process.cwd(),
      count: recentIngests.length,
      items: recentIngests,
    },
    null,
    2,
  )}\n`;

  const paths = ingestRingSnapshotPaths();
  let lastErr: unknown;
  for (const p of paths) {
    try {
      await writeFile(p, snapshot, 'utf8');
      lastRingSnapshotWrittenPath = p;
      return p;
    } catch (e) {
      lastErr = e;
    }
  }
  console.warn('[tz-ingest] ring snapshot write failed (all paths)', { pathsTried: paths, lastErr });
  lastRingSnapshotWrittenPath = null;
  return null;
}

/**
 * Repo root `.git` anchors the canonical log (`F:\\...\\DUNITE-CMS\\debug-e436a7.log`) even when
 * `next dev` cwd is nested (`…\\dunite-cms`).
 */
function collectGitAdjacentLogPaths(): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  let dir = path.resolve(process.cwd());
  for (let i = 0; i < 20; i++) {
    if (existsSync(path.join(dir, '.git'))) {
      const p = path.resolve(dir, LOG_BASENAME);
      if (!seen.has(p)) {
        seen.add(p);
        out.push(p);
      }
    }
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return out;
}

function orderedCandidates(): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  function push(paths: string[]) {
    for (const p of paths) {
      const n = path.resolve(p);
      if (!seen.has(n)) {
        seen.add(n);
        out.push(n);
      }
    }
  }
  push(collectGitAdjacentLogPaths());
  push(collectLogCandidates());
  return out;
}

/** Walk `process.cwd()` → ancestors and try `debug-e436a7.log` beside each folder (handles monorepos & nested tooling roots). */
function collectLogCandidates(): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  let dir = path.resolve(process.cwd());
  for (let i = 0; i < 14; i++) {
    const p = path.resolve(dir, LOG_BASENAME);
    if (!seen.has(p)) {
      seen.add(p);
      out.push(p);
    }
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return out;
}

function collectExportLatestPaths(): string[] {
  const seen = new Set<string>();
  const out: string[] = [];

  /** Explicit workspace root when `.git` walk misses a writable anchor (symlinks, tooling sandboxes). */
  const forcedRoot = process.env.DUNITE_TZ_DEBUG_DIR?.trim();
  if (forcedRoot) {
    const forced = path.resolve(forcedRoot, EXPORT_LATEST_BASENAME);
    if (!seen.has(forced)) {
      seen.add(forced);
      out.push(forced);
    }
  }

  let dir = path.resolve(process.cwd());
  for (let i = 0; i < 22; i++) {
    if (existsSync(path.join(dir, '.git'))) {
      const p = path.resolve(dir, EXPORT_LATEST_BASENAME);
      if (!seen.has(p)) {
        seen.add(p);
        out.push(p);
      }
    }
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  const cwdP = path.resolve(process.cwd(), EXPORT_LATEST_BASENAME);
  if (!seen.has(cwdP)) {
    seen.add(cwdP);
    out.push(cwdP);
  }
  return out;
}

function rememberTzExportBundleForGet(payload: Record<string, unknown>): void {
  try {
    const s = JSON.stringify(payload);
    if (s.length <= 490_000) {
      lastTzExportBundleForGet = JSON.parse(s) as Record<string, unknown>;
      return;
    }

    const roll = payload.ingestRoll;
    const wt = payload.windowTrail;

    lastTzExportBundleForGet = {
      hypothesisId:     'EXPORT-BUNDLE',
      _truncatedLarge:  true,
      exportsAtMs:      payload.exportsAtMs,
      pageOrigin:       payload.pageOrigin,
      pagePath:         payload.pagePath,
      nodeEnvBundled:   payload.nodeEnvBundled,
      ingestJsonBytes: s.length,
      windowTrailTail:  Array.isArray(wt) ? wt.slice(-40) : [],
      ingestRollTail:
        Array.isArray(roll) ? roll.slice(-20)
        : roll != null ? [roll]
        : [],
      ingestLast: payload.ingestLast,
    };
  } catch {
    lastTzExportBundleForGet = { hypothesisId: 'EXPORT-BUNDLE', error: 'remember_failed' };
  }
}

async function persistTzExportLatest(
  bundle: Record<string, unknown>,
): Promise<string | null> {
  const prettified = `${JSON.stringify(bundle, null, 2)}\n`;
  let lastErr: unknown;

  const targets = collectExportLatestPaths();

  for (const p of targets) {
    try {
      await writeFile(p, prettified, 'utf8');
      console.info('[tz-ingest] EXPORT-BUNDLE wrote', p);
      return p;
    } catch (e) {
      lastErr = e;
    }
  }
  console.warn('[tz-ingest] EXPORT-BUNDLE write failed', { targetsTried: targets, lastErr });
  return null;
}

async function persistTzExportToPublic(bundle: Record<string, unknown>): Promise<string | null> {
  try {
    const pubDir = path.join(process.cwd(), 'public');
    await mkdir(pubDir, { recursive: true });
    const filePath = path.join(pubDir, PUBLIC_EXPORT_BUNDLE);
    await writeFile(
      filePath,
      `${JSON.stringify(bundle, null, 2)}\n`,
      'utf8',
    );
    console.info('[tz-ingest] EXPORT-BUNDLE public mirror wrote', filePath);
    return filePath;
  } catch (e) {
    console.warn('[tz-ingest] EXPORT-BUNDLE public mirror failed', e);
    return null;
  }
}

async function appendSessionLogLine(line: string): Promise<
  | { ok: true; writtenTo: string }
  | { ok: false; candidatesTried: string[]; lastErr: unknown }
> {
  const candidates = orderedCandidates();
  let last: unknown;
  for (const logPath of candidates) {
    try {
      await appendFile(logPath, line, 'utf8');
      return { ok: true, writtenTo: logPath };
    } catch (e) {
      last = e;
    }
  }
  console.warn('[tz-ingest] could not append', { candidatesTried: candidates, lastErr: last });
  return { ok: false, candidatesTried: candidates, lastErr: last };
}

export async function POST(req: Request) {
  if (!isTzDebugRouteEnabled()) {
    return NextResponse.json({ error: 'disabled' }, { status: 403 });
  }

  const raw = await req.text();
  /* Large JSON only for evidence bundles (`windowTrail` + localStorage). */
  if (raw.length > 524_288) {
    return NextResponse.json({ error: 'payload too large' }, { status: 413 });
  }

  let payload: Record<string, unknown>;
  try {
    payload = JSON.parse(raw.trim()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: 'body must be JSON' }, { status: 400 });
  }

  const isExportBundle = payload.hypothesisId === 'EXPORT-BUNDLE';

  if (!isExportBundle && raw.length > 16_384) {
    return NextResponse.json({ error: 'payload too large' }, { status: 413 });
  }

  if (isExportBundle) {
    const roll = payload.ingestRoll;
    pushRecentIngest({
      hypothesisId: 'EXPORT-BUNDLE',
      _exportsAtMs: payload.exportsAtMs,
      _trailLen:
        Array.isArray(payload.windowTrail) ? payload.windowTrail.length : null,
      _rollLen:
        Array.isArray(roll) ? roll.length
        : roll != null ? 1
        : 0,
    });
    rememberTzExportBundleForGet(payload);
  }
  else {
    pushRecentIngest(payload);
  }

  if (isTzDebugRouteEnabled()) {
    const referer = req.headers.get('referer');

    console.info(
      '[tz-ingest] POST',
      String(payload.hypothesisId ?? '(no-hypothesisId)'),
      'origin=',
      req.headers.get('origin') ?? '(none)',
      referer ? `referer=${referer.slice(0, 180)}${referer.length > 180 ? '…' : ''}` : 'referer=(none)',
    );
  }

  let exportLatestWritten: string | null = null;
  let exportPublicWritten: string | null = null;
  if (isExportBundle) {
    exportLatestWritten = await persistTzExportLatest(payload);
    exportPublicWritten = await persistTzExportToPublic(payload);
  }

  const ringSnapshotWrittenTo = await persistIngestRingSnapshot();

  let result:
    | { ok: true; writtenTo: string }
    | { ok: false; candidatesTried: string[]; lastErr: unknown };

  if (isExportBundle) {
    result = { ok: true, writtenTo: '(skipped NDJSON for EXPORT-BUNDLE)' };
  }
  else {
    const line = `${JSON.stringify(payload)}\n`;
    result = await appendSessionLogLine(line);
  }

  return result.ok
    ? NextResponse.json({
      ok: true,
      writtenTo:               result.writtenTo,
      ringSnapshotWrittenTo,
      ...(isExportBundle
        ? {
            exportLatestWritten: exportLatestWritten ?? null,
            exportPublicWritten: exportPublicWritten ?? null,
          }
        : {}),
    })
    : NextResponse.json(
      {
        error:                   'log append failed',
        candidatesTried:         result.candidatesTried,
        ringSnapshotWrittenTo,
        ...(isExportBundle
          ? {
              exportLatestWritten: exportLatestWritten ?? null,
              exportPublicWritten: exportPublicWritten ?? null,
            }
          : {}),
      },
      { status: 500 },
    );
}

function jsonSafeForResponse(source: Record<string, unknown> | null): unknown {
  if (source === null) return null;
  try {
    return JSON.parse(JSON.stringify(source)) as Record<string, unknown>;
  } catch {
    return { error: 'lastTzExportBundle_serialization_failed_on_get' };
  }
}

/** Dev probe: cwd + attempted log paths (no write). */
export async function GET() {
  if (!isTzDebugRouteEnabled()) {
    return NextResponse.json({ error: 'disabled' }, { status: 403 });
  }
  const gitAdjacent = collectGitAdjacentLogPaths();
  const ordered = orderedCandidates();
  return NextResponse.json({
    cwd:                      process.cwd(),
    duniteTzDebugDir:         process.env.DUNITE_TZ_DEBUG_DIR ?? null,
    /** Which env knobs apply (route only returns 200 when server gate passes). */
    tzDebugEnv: {
      nodeEnv:                 process.env.NODE_ENV ?? '(unset)',
      duniteTzDebug:           process.env.DUNITE_TZ_DEBUG ?? null,
      nextPublicDuniteTzDebug: process.env.NEXT_PUBLIC_DUNITE_TZ_DEBUG ?? null,
    },
    exportLatestCandidates: collectExportLatestPaths(),
    gitAdjacent,
    orderedCandidates:        ordered,
    ringSnapshotPaths:        ingestRingSnapshotPaths(),
    lastRingSnapshotWritten:  lastRingSnapshotWrittenPath,
    tzIngestServerBootMs:     TZ_INGEST_SERVER_BOOT_MS,
    processPid:               process.pid,
    nodeEnv:                  process.env.NODE_ENV ?? '(unset)',
    recentCount:              recentIngests.length,
    recentIngests,
    /** Full or tail-truncated `EXPORT-BUNDLE` body after last browser ingest. */
    lastTzExportBundle: jsonSafeForResponse(lastTzExportBundleForGet),
  });
}
