'use client';

import { Loader2 } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';

import type { Role } from '@/features/auth/types';
import { listSocialAccountsAction } from '@/features/integrations/server/integrationsActions';
import type { SocialAccount } from '@/features/integrations/types';
import type { Post } from '@/features/posts';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { cn } from '@/lib/utils';

const LOCK_MS = 5 * 60 * 1000;

function isActivePublishLock(iso: string | null | undefined): boolean {
  if (!iso) return false;
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return false;
  const age = Date.now() - t;
  return age >= 0 && age < LOCK_MS;
}

interface FacebookComposerActionsProps {
  post: Post;
  userRole: Role;
}

type ConfirmMode = 'publish' | 'schedule';

export function FacebookComposerActions({
  post,
  userRole,
}: FacebookComposerActionsProps) {
  const router = useRouter();
  const postId = post.id;

  const [accounts, setAccounts] = useState<SocialAccount[]>([]);
  const [picked, setPicked] = useState<string>('');
  const [loadingAccounts, setLoadingAccounts] = useState(true);
  const [busy, setBusy] = useState<'publish' | 'retry' | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [confirmMode, setConfirmMode] = useState<ConfirmMode>('publish');
  const [confirmPending, setConfirmPending] = useState(false);

  const locked = isActivePublishLock(post.publish_locked_at);
  const onFacebook = Boolean(post.external_post_id);
  const selectedAccount = useMemo(
    () => accounts.find((a) => a.id === picked) ?? null,
    [accounts, picked],
  );
  const preview = post.content.trim().slice(0, 150) || '(No content)';
  const hasScheduleAt = Boolean(post.scheduled_at);
  const scheduleFor = post.scheduled_at
    ? new Date(post.scheduled_at).toLocaleString()
    : null;

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoadingAccounts(true);
      const res = await listSocialAccountsAction('facebook');
      if (cancelled) return;
      if (!res.ok) {
        toast.error(res.error);
        setAccounts([]);
      } else {
        const rows = res.data.filter(
          (a) => a.status === 'active' && a.health_status !== 'permission_error',
        );
        setAccounts(rows);
        setPicked((prev) => prev || post.social_account_id || rows[0]?.id || '');
      }
      setLoadingAccounts(false);
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [post.social_account_id]);

  const publishDisabledReason = useMemo(() => {
    if (loadingAccounts) return null;
    if (accounts.length === 0) return 'Connect a Facebook Page in Integrations first.';
    if (!picked) return 'Select a target Page.';
    if (locked) return 'A publish is already in progress. Please wait.';
    if (onFacebook) return 'This post was already sent to Facebook.';
    return null;
  }, [loadingAccounts, accounts.length, picked, locked, onFacebook]);

  const scheduleDisabledReason = useMemo(() => {
    if (loadingAccounts) return null;
    if (accounts.length === 0) return 'Connect a Facebook Page in Integrations first.';
    if (!picked) return 'Select a target Page.';
    if (locked) return 'A publish is already in progress. Please wait.';
    if (!hasScheduleAt) return 'Set a CMS schedule first, then confirm Facebook scheduling.';
    if (onFacebook) return 'This post was already sent to Facebook.';
    return null;
  }, [loadingAccounts, accounts.length, picked, locked, hasScheduleAt, onFacebook]);

  async function parseApiResponse(res: Response) {
    const raw = (await res.json().catch(() => null)) as {
      ok?: boolean;
      error?: string;
      code?: string;
      data?: unknown;
    } | null;
    return { raw, ok: res.ok && raw?.ok === true };
  }

  async function callPublish(
    path:
      | '/api/social/facebook/publish'
      | '/api/social/facebook/retry'
      | '/api/social/facebook/schedule',
  ) {
    const body =
      path === '/api/social/facebook/publish'
        ? { postId, socialAccountId: picked }
        : path === '/api/social/facebook/schedule'
        ? {
            postId,
            socialAccountId: picked,
            scheduledFor:
              post.scheduled_at ?? new Date(Date.now() + 5 * 60 * 1000).toISOString(),
          }
        : { postId };
    const res = await fetch(path, {
      method:      'POST',
      headers:     { 'Content-Type': 'application/json' },
      body:        JSON.stringify(body),
      credentials: 'include',
    });
    const { raw, ok } = await parseApiResponse(res);
    if (!ok || !raw) {
      const msg =
        raw && typeof raw.error === 'string' && raw.error.length > 0
          ? raw.error
          : 'Facebook request failed';
      toast.error(msg);
      return false;
    }
    return true;
  }

  function openConfirmation(mode: ConfirmMode) {
    setConfirmMode(mode);
    setConfirmOpen(true);
  }

  async function handleConfirmAction() {
    setConfirmPending(true);
    try {
      const ok = await callPublish(
        confirmMode === 'publish'
          ? '/api/social/facebook/publish'
          : '/api/social/facebook/schedule',
      );

      // Requirement: close dialog both on success and failure.
      setConfirmOpen(false);
      if (ok) {
        toast.success(
          confirmMode === 'publish'
            ? 'Successfully published to Facebook!'
            : 'Facebook publishing was scheduled successfully.',
        );
        router.refresh();
      }
    } finally {
      setConfirmPending(false);
    }
  }

  return (
    <div className="space-y-3 text-sm">
      <p className="text-xs text-muted-foreground">
        Sends this post to your connected Facebook Page (Meta Graph API). This is independent of
        &quot;Save &amp; publish&quot; above, which only updates CMS status.
      </p>

      {onFacebook && (
        <div
          className="flex items-center gap-2 rounded-lg border border-[#1877F2]/25 bg-[#1877F2]/5 px-3 py-2 text-xs font-medium text-[#1665D8]"
          role="status"
        >
          <svg
            className="h-4 w-4 shrink-0 text-[#1877F2]"
            viewBox="0 0 24 24"
            fill="currentColor"
            aria-hidden
          >
            <path d="M24 12.073C24 5.405 18.627 0 12 0S0 5.405 0 12.073c0 6.032 4.388 11.031 10.125 11.927v-8.437H7.078v-3.49h3.047V9.41c0-3.025 1.792-4.697 4.533-4.697 1.312 0 2.686.236 2.686.236v2.975h-1.513c-1.491 0-1.956.93-1.956 1.883v2.256h3.328l-.532 3.49h-2.796v8.437C19.612 23.104 24 18.105 24 12.073z" />
          </svg>
          <span className="inline-flex items-center gap-1.5">
            <span
              className="rounded-full bg-[#1877F2] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-white"
            >
              Posted to Facebook
            </span>
            {post.external_post_id && (
              <span className="text-[11px] font-normal text-gray-600">
                ID {post.external_post_id}
              </span>
            )}
          </span>
        </div>
      )}

      {locked && (
        <p className="inline-flex items-center gap-2 text-xs text-amber-800">
          <Loader2 size={14} className="animate-spin shrink-0" aria-hidden />
          Publishing to Facebook…
        </p>
      )}

      {loadingAccounts ? (
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Loader2 size={14} className="animate-spin" aria-hidden />
          Loading Pages…
        </div>
      ) : accounts.length === 0 ? (
        <p className="text-xs text-amber-700">
          Facebook Page not connected for this workspace.&nbsp;
          <a href="/dashboard/integrations" className="font-semibold underline">
            Connect a Page first
          </a>
          .
        </p>
      ) : (
        <label className="block space-y-1">
          <span className="text-[11px] font-medium uppercase tracking-wide text-gray-500">
            Target Page
          </span>
          <select
            value={picked}
            onChange={(e) => setPicked(e.target.value)}
            disabled={busy !== null || locked || onFacebook}
            className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm outline-none focus:border-gray-400 disabled:opacity-60"
          >
            {accounts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.external_name ?? a.page_name ?? a.external_id}
              </option>
            ))}
          </select>
        </label>
      )}

      {publishDisabledReason && !loadingAccounts && accounts.length > 0 && (
        <p className="text-[11px] text-muted-foreground">{publishDisabledReason}</p>
      )}

      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          size="sm"
          disabled={
            busy !== null ||
            !picked ||
            loadingAccounts ||
            accounts.length === 0 ||
            locked ||
            onFacebook
          }
          className={cn(locked && 'opacity-70')}
          onClick={() => openConfirmation('publish')}
        >
          Publish to Facebook
        </Button>

        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={
            busy !== null ||
            !picked ||
            loadingAccounts ||
            accounts.length === 0 ||
            locked ||
            !hasScheduleAt ||
            onFacebook
          }
          onClick={() => openConfirmation('schedule')}
        >
          Schedule on Facebook
        </Button>

        <Button
          type="button"
          size="sm"
          variant="secondary"
          disabled={busy !== null || loadingAccounts || locked}
          onClick={() => {
            void (async () => {
              setBusy('retry');
              try {
                const ok = await callPublish('/api/social/facebook/retry');
                if (ok) {
                  toast.success('Publishing job queued for retry.');
                  router.refresh();
                }
              } finally {
                setBusy(null);
              }
            })();
          }}
        >
          {busy === 'retry' ? (
            <Loader2 size={14} className="animate-spin" aria-hidden />
          ) : (
            'Retry failed job'
          )}
        </Button>
      </div>

      {scheduleDisabledReason && !loadingAccounts && accounts.length > 0 && (
        <p className="text-[11px] text-muted-foreground">{scheduleDisabledReason}</p>
      )}

      <p className="text-[11px] text-muted-foreground">
        Role: {userRole}. Org editors and admins can publish to Facebook; retry uses the publishing
        job queue.
      </p>

      <Dialog
        open={confirmOpen}
        onOpenChange={(next) => {
          if (confirmPending && !next) return;
          setConfirmOpen(next);
        }}
      >
        <DialogContent
          showCloseButton={!confirmPending}
          onEscapeKeyDown={(e) => {
            if (confirmPending) e.preventDefault();
          }}
          onPointerDownOutside={(e) => {
            if (confirmPending) e.preventDefault();
          }}
          className="max-w-[calc(100%-2rem)] gap-3 sm:max-w-lg"
        >
          <DialogHeader>
            <DialogTitle>
              {confirmMode === 'publish' ? 'Confirm Facebook publish' : 'Confirm Facebook schedule'}
            </DialogTitle>
            <DialogDescription>
              {confirmMode === 'publish'
                ? 'Review details before posting to your Facebook Page.'
                : 'Review details before scheduling this Facebook post.'}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3 rounded-lg border border-gray-200 bg-gray-50 p-3 text-xs">
            <div>
              <p className="font-semibold text-gray-700">Post preview</p>
              <p className="mt-1 whitespace-pre-wrap text-gray-600">
                {preview}
                {post.content.trim().length > 150 ? '…' : ''}
              </p>
            </div>
            <div>
              <p className="font-semibold text-gray-700">Target Facebook Page</p>
              <p className="mt-1 text-gray-600">
                {selectedAccount?.external_name ??
                  selectedAccount?.page_name ??
                  selectedAccount?.external_id ??
                  'Not selected'}
              </p>
            </div>
            <div>
              <p className="font-semibold text-gray-700">Publish type</p>
              <p className="mt-1 text-gray-600">
                {confirmMode === 'publish' ? 'Immediately · Public' : 'Scheduled · Public'}
              </p>
            </div>
            {confirmMode === 'schedule' && (
              <div>
                <p className="font-semibold text-gray-700">Scheduled for</p>
                <p className="mt-1 text-gray-600">{scheduleFor ?? 'Not set'}</p>
              </div>
            )}
            <p className="rounded-md border border-amber-200 bg-amber-50 px-2 py-1 text-amber-800">
              {confirmMode === 'publish'
                ? 'Once published, this cannot be undone from the CMS.'
                : 'Post will publish automatically at scheduled time.'}
            </p>
          </div>

          <DialogFooter className="sm:gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => setConfirmOpen(false)}
              disabled={confirmPending}
            >
              Cancel
            </Button>
            <Button
              type="button"
              onClick={() => {
                void handleConfirmAction();
              }}
              disabled={confirmPending}
            >
              {confirmPending && <Loader2 size={14} className="animate-spin" aria-hidden />}
              {confirmMode === 'publish' ? 'Confirm & Publish' : 'Confirm Schedule'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
