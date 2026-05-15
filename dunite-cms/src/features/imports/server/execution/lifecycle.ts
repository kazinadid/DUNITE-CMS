import type { ImportJobLifecycleStatus } from './types';

const TERMINAL = new Set<ImportJobLifecycleStatus>(['completed', 'partial_success', 'failed', 'cancelled']);

export function isTerminalStatus(status: ImportJobLifecycleStatus): boolean {
  return TERMINAL.has(status);
}

export function deriveTerminalStatus(params: {
  importedCount: number;
  failedCount: number;
}): 'completed' | 'partial_success' | 'failed' {
  const imported = Math.max(0, params.importedCount);
  const failed = Math.max(0, params.failedCount);
  if (failed <= 0) return 'completed';
  if (imported > 0) return 'partial_success';
  return 'failed';
}

const ALLOWED_TRANSITIONS: Record<ImportJobLifecycleStatus, ReadonlySet<ImportJobLifecycleStatus>> = {
  uploaded: new Set(['staging', 'cancelled']),
  validating: new Set(['validated', 'failed', 'cancelled']),
  validated: new Set(['staging', 'staged', 'queued', 'cancelled']),
  staging: new Set(['staged', 'failed', 'cancelled']),
  staged: new Set(['queued', 'cancelled']),
  queued: new Set(['processing', 'cancelled', 'retrying']),
  processing: new Set(['queued', 'retrying', 'completed', 'partial_success', 'failed', 'cancelled']),
  retrying: new Set(['queued', 'processing', 'cancelled']),
  completed: new Set(['queued', 'retrying']),
  partial_success: new Set(['queued', 'retrying']),
  failed: new Set(['queued', 'retrying']),
  cancelled: new Set(['queued', 'retrying']),
};

export function isAllowedLifecycleTransition(
  from: ImportJobLifecycleStatus,
  to: ImportJobLifecycleStatus,
): boolean {
  if (from === to) return true;
  return ALLOWED_TRANSITIONS[from]?.has(to) ?? false;
}
