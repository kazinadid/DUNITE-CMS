'use client';

import {
  CalendarClock,
  Copy,
  ExternalLink,
  Loader2,
  Pencil,
  Rocket,
  Trash2,
} from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';

import type { Role } from '@/features/auth';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { CalendarStatusPill } from '@/features/calendar/components/CalendarStatusPill';
import {
  formatCalendarScheduledDetail,
  formatCalendarSlotTime,
  isoToDatetimeLocalInput,
} from '@/features/calendar/lib/formatTime';
import { CALENDAR_PLATFORM_CHROME } from '@/features/calendar/lib/platformAccent';
import { PlatformIcon as PlatformGlyph, getPlatform } from '@/features/composer';
import type { PlatformId } from '@/features/composer/types';
import { useFeedback } from '@/features/feedback';
import {
  MediaThumbnail,
  DeleteDialog,
  formatAbsolute,
  deletePost,
  duplicatePost,
  patchPostLifecycle,
  publishNow,
  rescheduleCalendarPost,
  resetToDraft,
  UnifiedPublishConfirmDialog,
  publishToFacebook,
} from '@/features/posts';
import type { Post } from '@/features/posts';
import { getPost } from '@/features/posts/services/postsService';
import type { SocialAccount } from '@/features/integrations/types';
import {
  canDeletePost,
  canEditPost,
  canPublishPost,
} from '@/lib/rbac';

const MIN_LEAD_MS = 5 * 60 * 1000;

function parsePlatform(raw: string): PlatformId | null {
  const p = raw.toLowerCase().trim();
  if (p === 'facebook' || p === 'instagram' || p === 'linkedin' || p === 'twitter') {
    return p;
  }
  return null;
}

interface CalendarEventDetailsModalProps {
  post:         Post | null;
  role:         Role;
  onClose:       () => void;
  onPostUpdated: (post: Post) => void;
  onPostRemoved: (id: string) => void;
}

export function CalendarEventDetailsModal({
  post,
  role,
  onClose,
  onPostUpdated,
  onPostRemoved,
}: CalendarEventDetailsModalProps) {
  const router = useRouter();
  const { success, error: toastError } = useFeedback();

  const [busy,           setBusy]           = useState<string | null>(null);
  const [deleteOpen,     setDeleteOpen]     = useState(false);
  const [fbConfirmOpen,    setFbConfirmOpen]    = useState(false);
  const [fbConfirmPending, setFbConfirmPending] = useState(false);
  const [scheduledInput, setScheduledInput] = useState(() =>
    post?.scheduled_at ? isoToDatetimeLocalInput(post.scheduled_at) : '',
  );
  const [scheduleMin,    setScheduleMin]    = useState('');

  useEffect(() => {
    if (!post) return;
    function tick() {
      setScheduleMin(new Date(Date.now() + MIN_LEAD_MS).toISOString().slice(0, 16));
    }
    tick();
    const id = window.setInterval(tick, 60_000);
    return () => window.clearInterval(id);
  }, [post]);

  const editable   = post !== null && canEditPost(role);
  const deletable  = post !== null && canDeletePost(role);
  const publishable = post !== null && canPublishPost(role);
  const readOnlyPublishing = post?.status === 'publishing';

  const platformsParsed =
    post?.platforms
      ?.map(parsePlatform)
      .filter((x): x is PlatformId => Boolean(x)) ?? [];

  const handleRescheduleQuick = async () => {
    if (!post) return;
    const isoRaw = scheduledInput
      ? new Date(scheduledInput).toISOString()
      : post.scheduled_at;
    if (!isoRaw) return;
    if (Date.parse(isoRaw) < Date.now() + MIN_LEAD_MS - 999) {
      toastError({
        title:       'Pick a later time',
        description: `Schedule at least ${MIN_LEAD_MS / 60000} minutes ahead.`,
      });
      return;
    }
    setBusy('schedule');
    try {
      let next = await rescheduleCalendarPost(post.id, isoRaw);
      if (next.status !== 'scheduled') {
        next = await patchPostLifecycle(post.id, {
          status:       'scheduled',
          scheduled_at: isoRaw,
        });
      }
      onPostUpdated(next);
      success({
        title:       'Rescheduled',
        description: formatCalendarSlotTime(next.scheduled_at ?? isoRaw),
      });
    } catch (e: unknown) {
      toastError({
        title:       'Could not reschedule',
        description: e instanceof Error ? e.message : 'Try again.',
      });
    } finally {
      setBusy(null);
    }
  };

  const handleStatusJump = async (val: string) => {
    if (!post || readOnlyPublishing) return;
    setBusy('status');
    try {
      let updated: Post;
      switch (val) {
        case 'draft':
          updated = await patchPostLifecycle(post.id, {
            status:       'draft',
            scheduled_at: null,
          });
          break;
        case 'scheduled': {
          const at =
            scheduledInput
              ? new Date(scheduledInput).toISOString()
              : post.scheduled_at;
          if (!at) throw new Error('Choose a datetime first.');
          if (Date.parse(at) < Date.now() + MIN_LEAD_MS - 999) {
            throw new Error(
              `Pick a time at least ${MIN_LEAD_MS / 60000} minutes ahead.`,
            );
          }
          updated = await patchPostLifecycle(post.id, {
            status:       'scheduled',
            scheduled_at: at,
          });
          break;
        }
        case 'reset-failed':
          updated = await resetToDraft(post.id);
          break;
        default:
          setBusy(null);
          return;
      }
      onPostUpdated(updated);
      success({ title: 'Updated', description: `Status · ${updated.status}` });
    } catch (e: unknown) {
      toastError({
        title:       'Could not update',
        description: e instanceof Error ? e.message : 'Try again.',
      });
    } finally {
      setBusy(null);
    }
  };

  const handlePublishNow = async () => {
    if (!post || !publishable) return;
    // When Facebook is one of the platforms, route through the unified
    // confirmation dialog so the operator picks a target Page first.
    if (post.platforms.includes('facebook')) {
      setFbConfirmOpen(true);
      return;
    }
    setBusy('publish');
    try {
      const updated = await publishNow(post.id);
      onPostUpdated(updated);
      success({ title: 'Published', description: 'This post is live.' });
    } catch (e: unknown) {
      toastError({
        title:       'Publish failed',
        description: e instanceof Error ? e.message : 'Insufficient permission?',
      });
    } finally {
      setBusy(null);
    }
  };

  const handleFbConfirmPublish = async (account: SocialAccount) => {
    if (!post) return;
    setFbConfirmPending(true);
    setBusy('publish');
    try {
      await publishToFacebook(post.id, account.id);
      // Re-fetch so calendar reflects the publishing→published transition.
      const refreshed = await getPost(post.id).catch(() => null);
      if (refreshed) onPostUpdated(refreshed);
      success({
        title:       'Published to Facebook',
        description: 'This post is live on Facebook.',
      });
      setFbConfirmOpen(false);
    } catch (e: unknown) {
      toastError({
        title:       'Publish failed',
        description: e instanceof Error ? e.message : 'Could not publish to Facebook.',
      });
    } finally {
      setFbConfirmPending(false);
      setBusy(null);
    }
  };

  const handleDuplicate = async () => {
    if (!post || !editable) return;
    setBusy('duplicate');
    try {
      const copy = await duplicatePost(post);
      success({
        title:       'Duplicate created',
        description: 'Opening the copy in the editor.',
      });
      onClose();
      router.push(`/dashboard/posts/${copy.id}/edit`);
    } catch (e: unknown) {
      toastError({
        title:       'Duplicate failed',
        description: e instanceof Error ? e.message : 'Try again.',
      });
    } finally {
      setBusy(null);
    }
  };

  const handleConfirmDelete = async () => {
    if (!post) return;
    setBusy('delete');
    try {
      await deletePost(post.id);
      onPostRemoved(post.id);
      success({ title: 'Deleted', description: 'Post removed.' });
      setDeleteOpen(false);
      onClose();
    } catch (e: unknown) {
      toastError({
        title:       'Delete failed',
        description: e instanceof Error ? e.message : 'Try again.',
      });
    } finally {
      setBusy(null);
    }
  };

  if (!post) return null;

  const defaultChrome = 'bg-muted text-muted-foreground ring-border ring-1';

  return (
    <>
      <Dialog open onOpenChange={(open) => !open && onClose()}>
        <DialogContent
          showCloseButton
          overlayClassName="bg-black/45 backdrop-blur-[2px] duration-300 data-[state=open]:fade-in data-[state=closed]:fade-out"
          className="max-h-[min(94vh,calc(100vh-3rem))] gap-0 overflow-hidden rounded-2xl border border-border/85 p-0 shadow-[0_32px_100px_-40px_rgba(15,23,42,0.55)] ring-1 ring-black/[0.1] duration-300 data-[state=open]:animate-in data-[state=closed]:animate-out sm:max-w-xl"
        >
          <div className="border-b border-border/75 bg-gradient-to-br from-muted/70 via-background to-muted/45 px-5 py-5 sm:px-6">
            <DialogHeader className="gap-1 pr-8 text-left">
              <DialogTitle className="text-lg font-semibold tracking-tight sm:text-xl">
                Post details
              </DialogTitle>
              <DialogDescription className="sr-only">
                Full post preview, scheduling time, workflow, and quick actions.
              </DialogDescription>

              <div className="mt-1 flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
                <span className="font-mono font-bold tracking-tight text-foreground tabular-nums">
                  {formatCalendarSlotTime(post.scheduled_at)}
                </span>
                <span aria-hidden>·</span>
                <span>{formatCalendarScheduledDetail(post.scheduled_at)}</span>
              </div>

              <div className="flex flex-wrap items-center gap-3 pt-3">
                <CalendarStatusPill status={post.status} emphasis="prominent" />
                {readOnlyPublishing && (
                  <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                    In progress
                  </span>
                )}
              </div>
            </DialogHeader>

            <div className="mt-4 flex flex-wrap gap-2">
              <Button variant="outline" size="sm" className="gap-1.5 shadow-xs" asChild>
                <Link href={`/dashboard/posts/${post.id}/edit`}>
                  <Pencil className="h-3.5 w-3.5" aria-hidden />
                  Full editor
                </Link>
              </Button>
              {publishable &&
                post.status !== 'published' &&
                post.status !== 'publishing' && (
                  <Button
                    size="sm"
                    type="button"
                    disabled={busy !== null || readOnlyPublishing}
                    className="gap-1.5 bg-emerald-600 text-white hover:bg-emerald-700"
                    onClick={() => void handlePublishNow()}
                  >
                    <Rocket className="h-3.5 w-3.5" aria-hidden />
                    Publish now
                    {busy === 'publish' && (
                      <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                    )}
                  </Button>
                )}
              {deletable && (
                <Button
                  type="button"
                  variant="destructive"
                  size="sm"
                  disabled={busy !== null || readOnlyPublishing}
                  className="gap-1.5"
                  onClick={() => setDeleteOpen(true)}
                >
                  <Trash2 className="h-3.5 w-3.5" aria-hidden />
                  Delete
                </Button>
              )}
            </div>
          </div>

          <div className="max-h-[min(62vh,calc(100vh-13rem))] space-y-5 overflow-y-auto overscroll-contain px-5 py-5 sm:px-6">
            <section>
              <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                Content
              </p>
              <div className="mt-2 whitespace-pre-wrap rounded-xl border border-border/80 bg-muted/35 p-4 text-[15px] leading-relaxed font-medium text-foreground ring-1 ring-black/[0.03]">
                {post.content || '—'}
              </div>
            </section>

            <dl className="grid gap-3">
              <div className="flex flex-wrap rounded-xl bg-muted/30 px-4 py-3 ring-1 ring-border/60">
                <dt className="w-full shrink-0 text-xs font-semibold uppercase tracking-wide text-muted-foreground sm:w-28">
                  Author
                </dt>
                <dd className="min-w-0 text-sm font-medium">
                  {post.author?.name?.trim() ||
                    post.author?.email?.split('@')[0] ||
                    '—'}
                </dd>
              </div>
              <div className="flex flex-wrap rounded-xl bg-muted/30 px-4 py-3 ring-1 ring-border/60">
                <dt className="w-full shrink-0 text-xs font-semibold uppercase tracking-wide text-muted-foreground sm:w-28">
                  Created
                </dt>
                <dd className="font-mono text-sm font-semibold tabular-nums">
                  {formatAbsolute(post.created_at)}
                </dd>
              </div>
            </dl>

            {platformsParsed.length > 0 && (
              <section className="space-y-2">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                  Platforms
                </p>
                <div className="flex flex-wrap gap-2">
                  {platformsParsed.map((pid) => {
                    const cfg = getPlatform(pid);
                    const chrome =
                      CALENDAR_PLATFORM_CHROME[pid] ?? defaultChrome;
                    return (
                      <span
                        key={pid}
                        className={`inline-flex items-center gap-2 rounded-xl border border-black/[0.06] px-3 py-2 shadow-[0_4px_16px_-8px_rgba(15,23,42,0.35)] ring-2 ring-transparent ${chrome}`}
                      >
                        <PlatformGlyph platform={pid} size={20} />
                        <span className="text-sm font-semibold">{cfg?.label ?? pid}</span>
                      </span>
                    );
                  })}
                </div>
              </section>
            )}

            {post.media.length > 0 && (
              <section className="space-y-2">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                  Media · {post.media.length}
                </p>
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                  {post.media.map((m) => (
                    <MediaThumbnail key={m.id} media={m} />
                  ))}
                </div>
              </section>
            )}

            {editable && !readOnlyPublishing && (
              <section className="rounded-xl border border-dashed border-border/90 bg-muted/20 p-4 ring-1 ring-black/[0.03]">
                <p className="mb-4 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                  Quick actions
                </p>

                <div className="space-y-2">
                  <label className="text-xs font-semibold">Reschedule</label>
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-stretch">
                    <input
                      type="datetime-local"
                      aria-label="Reschedule datetime"
                      className="h-10 w-full rounded-lg border border-input bg-background px-3 text-sm outline-none transition focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
                      value={scheduledInput}
                      min={scheduleMin || undefined}
                      onChange={(e) => setScheduledInput(e.target.value)}
                    />
                    <Button
                      type="button"
                      variant="outline"
                      className="h-10 shrink-0 gap-2 shadow-xs sm:min-w-[7.25rem]"
                      disabled={busy !== null}
                      onClick={() => void handleRescheduleQuick()}
                    >
                      <CalendarClock className="h-4 w-4 shrink-0" aria-hidden />
                      Apply
                      {busy === 'schedule' ? (
                        <Loader2 className="h-4 w-4 shrink-0 animate-spin" aria-hidden />
                      ) : null}
                    </Button>
                  </div>
                </div>

                <div className="mt-6 space-y-2">
                  <label className="text-xs font-semibold">Workflow</label>
                  <select
                    aria-label="Change workflow status"
                    disabled={busy !== null}
                    className="h-10 w-full max-w-xs rounded-lg border border-input bg-background px-3 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:opacity-50"
                    value=""
                    onChange={(e) => {
                      const v = e.target.value;
                      e.target.selectedIndex = 0;
                      if (v) void handleStatusJump(v);
                    }}
                  >
                    <option value="">Jump to status…</option>
                    {(post.status === 'scheduled' || post.scheduled_at) &&
                      post.status !== 'draft' && (
                        <option value="draft">Draft (remove schedule)</option>
                      )}
                    <option value="scheduled">
                      Scheduled (commits picker time)
                    </option>
                    {post.status === 'failed' && (
                      <option value="reset-failed">
                        Reset failed → draft
                      </option>
                    )}
                  </select>
                  <p className="text-[11px] text-muted-foreground">
                    Scheduled requires a datetime above and respects the same
                    lead-time buffer as the composer.
                  </p>
                </div>

                <div className="mt-6 flex flex-wrap gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={busy !== null}
                    className="gap-2"
                    onClick={() => void handleDuplicate()}
                  >
                    <Copy className="h-3.5 w-3.5 shrink-0" aria-hidden />
                    Duplicate
                    {busy === 'duplicate' ? (
                      <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin" aria-hidden />
                    ) : null}
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="gap-2 text-muted-foreground hover:text-foreground"
                    asChild
                  >
                    <Link href={`/dashboard/posts/${post.id}/edit`}>
                      Open composer
                      <ExternalLink className="h-3.5 w-3.5" aria-hidden />
                    </Link>
                  </Button>
                </div>
              </section>
            )}

            {!editable && (
              <p className="rounded-lg bg-muted/50 px-3 py-2 text-center text-xs text-muted-foreground">
                Read-only — you can view this post but not change it.
              </p>
            )}
          </div>
        </DialogContent>
      </Dialog>

      <DeleteDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        itemLabel={post.content}
        isPending={busy === 'delete'}
        onConfirm={() => void handleConfirmDelete()}
      />

      <UnifiedPublishConfirmDialog
        open={fbConfirmOpen}
        mode="publish"
        contentPreview={post.content}
        scheduledFor={null}
        initialAccountId={post.social_account_id ?? null}
        pending={fbConfirmPending}
        onCancel={() => {
          if (fbConfirmPending) return;
          setFbConfirmOpen(false);
        }}
        onConfirm={handleFbConfirmPublish}
      />
    </>
  );
}
