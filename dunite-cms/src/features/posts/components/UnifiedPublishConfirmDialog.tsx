'use client';

import { Loader2 } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import type { SocialAccount } from '@/features/integrations/types';

import {
  describeAccount,
  loadActiveFacebookAccounts,
} from '../lib/unifiedFacebookPublish';

export type ConfirmMode = 'publish' | 'schedule';

export interface UnifiedPublishConfirmDialogProps {
  open:           boolean;
  mode:           ConfirmMode;
  /** Post body for the preview block. */
  contentPreview: string;
  /** ISO string when mode === 'schedule'. */
  scheduledFor?:  string | null;
  /** Pre-selected account id from existing post (`post.social_account_id`). */
  initialAccountId?: string | null;
  pending:        boolean;
  onCancel:       () => void;
  /**
   * Confirm callback. The dialog forwards the picked Page id so callers can
   * forward it to the Facebook publish/schedule API.
   */
  onConfirm:      (account: SocialAccount) => void | Promise<void>;
}

/**
 * Reusable confirmation dialog for Facebook publish / schedule actions.
 *
 * Loads the org's active Facebook Pages on open, lets the user pick one,
 * shows a tight preview + meta block, and yields the chosen account back
 * to the caller via `onConfirm`. Handles its own loading/empty states so
 * every UI surface (composer, post card menu, post detail modal, calendar
 * modal) shows an identical confirmation UX.
 */
export function UnifiedPublishConfirmDialog({
  open,
  mode,
  contentPreview,
  scheduledFor,
  initialAccountId,
  pending,
  onCancel,
  onConfirm,
}: UnifiedPublishConfirmDialogProps) {
  const [accounts, setAccounts]     = useState<SocialAccount[]>([]);
  const [loading,  setLoading]      = useState(false);
  const [loadError, setLoadError]   = useState<string | null>(null);
  const [picked,   setPicked]       = useState<string>('');

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    void (async () => {
      // Defer the loading flag until after the effect commits, otherwise
      // React's set-state-in-effect lint rule (rightly) flags a synchronous
      // re-render. The microtask boundary makes this asynchronous.
      if (cancelled) return;
      setLoading(true);
      setLoadError(null);
      try {
        const rows = await loadActiveFacebookAccounts();
        if (cancelled) return;
        setAccounts(rows);
        setPicked((prev) => {
          if (prev && rows.some((r) => r.id === prev)) return prev;
          if (initialAccountId && rows.some((r) => r.id === initialAccountId)) {
            return initialAccountId;
          }
          return rows[0]?.id ?? '';
        });
      } catch (e) {
        if (!cancelled) {
          setLoadError(e instanceof Error ? e.message : 'Could not load Pages.');
          setAccounts([]);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, initialAccountId]);

  const selectedAccount = useMemo(
    () => accounts.find((a) => a.id === picked) ?? null,
    [accounts, picked],
  );

  const preview = contentPreview.trim().slice(0, 150) || '(No content)';
  const truncated = contentPreview.trim().length > 150;
  const scheduleLabel = scheduledFor
    ? new Date(scheduledFor).toLocaleString()
    : null;

  const canConfirm =
    !pending && !loading && accounts.length > 0 && Boolean(selectedAccount);

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (pending && !next) return;
        if (!next) onCancel();
      }}
    >
      <DialogContent
        showCloseButton={!pending}
        onEscapeKeyDown={(e) => {
          if (pending) e.preventDefault();
        }}
        onPointerDownOutside={(e) => {
          if (pending) e.preventDefault();
        }}
        className="max-w-[calc(100%-2rem)] gap-3 sm:max-w-lg"
      >
        <DialogHeader>
          <DialogTitle>
            {mode === 'publish' ? 'Confirm Facebook publish' : 'Confirm Facebook schedule'}
          </DialogTitle>
          <DialogDescription>
            {mode === 'publish'
              ? 'Review details before posting to your Facebook Page.'
              : 'Review details before scheduling this Facebook post.'}
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="flex items-center gap-2 rounded-lg bg-gray-50 px-3 py-4 text-sm text-gray-600">
            <Loader2 size={16} className="animate-spin" aria-hidden />
            Loading your connected Pages…
          </div>
        ) : loadError ? (
          <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
            {loadError}
          </p>
        ) : accounts.length === 0 ? (
          <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
            No Facebook Page is connected to this workspace.{' '}
            <a href="/dashboard/integrations" className="font-semibold underline">
              Connect a Page first
            </a>
            .
          </p>
        ) : (
          <label className="block space-y-1">
            <span className="text-[11px] font-medium uppercase tracking-wide text-gray-500">
              Target Facebook Page
            </span>
            <select
              value={picked}
              onChange={(e) => setPicked(e.target.value)}
              disabled={pending}
              className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm outline-none focus:border-gray-400 disabled:opacity-60"
            >
              {accounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {describeAccount(a)}
                </option>
              ))}
            </select>
          </label>
        )}

        <div className="space-y-3 rounded-lg border border-gray-200 bg-gray-50 p-3 text-xs">
          <div>
            <p className="font-semibold text-gray-700">Post preview</p>
            <p className="mt-1 whitespace-pre-wrap text-gray-600">
              {preview}
              {truncated ? '…' : ''}
            </p>
          </div>
          <div>
            <p className="font-semibold text-gray-700">Target Facebook Page</p>
            <p className="mt-1 text-gray-600">{describeAccount(selectedAccount)}</p>
          </div>
          <div>
            <p className="font-semibold text-gray-700">Publish type</p>
            <p className="mt-1 text-gray-600">
              {mode === 'publish' ? 'Immediately · Public' : 'Scheduled · Public'}
            </p>
          </div>
          {mode === 'schedule' && (
            <div>
              <p className="font-semibold text-gray-700">Scheduled for</p>
              <p className="mt-1 text-gray-600">{scheduleLabel ?? 'Not set'}</p>
            </div>
          )}
          <p className="rounded-md border border-amber-200 bg-amber-50 px-2 py-1 text-amber-800">
            {mode === 'publish'
              ? 'Once published, this cannot be undone from the CMS.'
              : 'Post will publish automatically at the scheduled time.'}
          </p>
        </div>

        <DialogFooter className="sm:gap-2">
          <Button type="button" variant="outline" onClick={onCancel} disabled={pending}>
            Cancel
          </Button>
          <Button
            type="button"
            disabled={!canConfirm}
            onClick={() => {
              if (selectedAccount) void onConfirm(selectedAccount);
            }}
          >
            {pending && <Loader2 size={14} className="animate-spin" aria-hidden />}
            {mode === 'publish' ? 'Confirm & Publish' : 'Confirm Schedule'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
