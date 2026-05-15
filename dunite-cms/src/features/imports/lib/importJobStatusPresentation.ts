import {
  CheckCircle2,
  CircleDashed,
  Clock,
  Loader2,
  PlayCircle,
  RefreshCw,
  UploadCloud,
  XCircle,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

/** Job is done or stopped — no execution polling needed. */
export const IMPORT_JOB_TERMINAL_STATUSES = new Set([
  'completed',
  'failed',
  'partial_success',
  'cancelled',
]);

export function isImportJobTerminalStatus(status: string | null | undefined): boolean {
  if (!status) return false;
  return IMPORT_JOB_TERMINAL_STATUSES.has(status.toLowerCase());
}

export function shouldPollImportJobProgress(status: string | null | undefined): boolean {
  if (!status) return true;
  if (isImportJobTerminalStatus(status)) return false;
  const s = status.toLowerCase();
  return s === 'queued' || s === 'processing' || s === 'staged';
}

export type ImportQueueVisualState =
  | 'uploaded'
  | 'staged'
  | 'queued'
  | 'processing'
  | 'completed'
  | 'failed'
  | 'retrying'
  | 'inactive';

export function resolveImportQueueVisualState(status: string): ImportQueueVisualState {
  const s = status.toLowerCase();
  if (IMPORT_JOB_TERMINAL_STATUSES.has(s)) {
    if (s === 'failed' || s === 'partial_success') return s === 'failed' ? 'failed' : 'completed';
    if (s === 'cancelled') return 'failed';
    return 'completed';
  }
  if (s === 'processing') return 'processing';
  if (s === 'queued') return 'queued';
  if (s === 'staged' || s === 'staging' || s === 'validated') return 'staged';
  if (s === 'uploaded') return 'uploaded';
  if (s.includes('retry')) return 'retrying';
  return 'inactive';
}

export interface ImportStatusPresentation {
  label: string;
  icon: LucideIcon;
  badgeClass: string;
}

export function getImportStatusPresentation(status: string): ImportStatusPresentation {
  const visual = resolveImportQueueVisualState(status);
  switch (visual) {
    case 'completed':
      return {
        label: 'Completed',
        icon: CheckCircle2,
        badgeClass: 'bg-emerald-500/12 text-emerald-900 ring-emerald-500/25',
      };
    case 'failed':
      return {
        label: 'Failed',
        icon: XCircle,
        badgeClass: 'bg-destructive/10 text-destructive ring-destructive/20',
      };
    case 'processing':
      return {
        label: 'Processing',
        icon: Loader2,
        badgeClass: 'bg-primary/12 text-primary ring-primary/25',
      };
    case 'queued':
      return {
        label: 'Queued',
        icon: Clock,
        badgeClass: 'bg-amber-500/12 text-amber-950 ring-amber-500/25',
      };
    case 'staged':
      return {
        label: 'Staged',
        icon: CircleDashed,
        badgeClass: 'bg-sky-500/10 text-sky-950 ring-sky-500/20',
      };
    case 'uploaded':
      return {
        label: 'Uploaded',
        icon: UploadCloud,
        badgeClass: 'bg-muted text-muted-foreground ring-foreground/10',
      };
    case 'retrying':
      return {
        label: 'Retrying',
        icon: RefreshCw,
        badgeClass: 'bg-violet-500/10 text-violet-950 ring-violet-500/20',
      };
    default:
      return {
        label: status.replace(/_/g, ' '),
        icon: PlayCircle,
        badgeClass: 'bg-muted text-foreground ring-foreground/10',
      };
  }
}
