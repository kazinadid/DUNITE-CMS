'use client';

import {
  AlertTriangle,
  CalendarClock,
  Copy,
  ExternalLink,
  Loader2,
  Pencil,
  RefreshCw,
  Rocket,
  Trash2,
} from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState, startTransition } from 'react';

import type { Role } from '@/features/auth';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  formatCalendarScheduledDetail,
  formatCalendarSlotTime,
  isoToDatetimeLocalInput,
} from '@/features/calendar/lib/formatTime';
import { useFeedback } from '@/features/feedback';
import { PostAuditSection } from '@/features/activity';
import { DeleteDialog } from './DeleteDialog';
import { MediaThumbnail } from './MediaThumbnail';
import { PlatformBadge } from './PlatformBadge';
import { PostStatusBadge } from './PostStatusBadge';
import { buildPostValidationWarnings } from '../lib/postValidation';
import {
  deletePost,
  duplicatePost,
  getPost,
  patchPostLifecycle,
  publishNow,
  resetToDraft,
  rescheduleCalendarPost,
} from '../services/postsService';
import type { Post } from '../types';
import {
  canDeletePost,
  canEditPost,
  canPublishPost,
} from '@/lib/rbac';
import { cn } from '@/lib/utils';
import { formatAbsolute } from '../lib/relativeTime';

const MIN_LEAD_MS = 5 * 60 * 1000;

export interface PostDetailModalProps {
  role:      Role;
  post:      Post;
  onClose:   () => void;
  /** After delete / successful mutation that should sync the feed. */
  onPostUpdated: (post: Post) => void;
  onPostRemoved: (id: string) => void;
}

export function PostDetailModal({
  role,
  post,
  onClose,
  onPostUpdated,
  onPostRemoved,
}: PostDetailModalProps) {
  const router = useRouter();
  const { success, error: toastError } = useFeedback();
  const [loaded, setLoaded]       = useState<Post | null>(null);
  const [busy, setBusy]           = useState<string | null>(null);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [scheduledInput, setScheduledInput] = useState('');
  const [scheduleMin, setScheduleMin] = useState('');

  const draft = loaded;

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const full = await getPost(post.id);
        if (!cancelled && full) {
          startTransition(() => {
            setLoaded(full);
            setScheduledInput(
              full.scheduled_at ? isoToDatetimeLocalInput(full.scheduled_at) : '',
            );
          });
        }
      } catch {
        if (!cancelled) {
          toastError({
            title:       'Could not load details',
            description: 'Showing cached card data.',
          });
          startTransition(() => {
            setLoaded(post);
            setScheduledInput(
              post.scheduled_at ? isoToDatetimeLocalInput(post.scheduled_at) : '',
            );
          });
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [post.id, post, toastError]);

  useEffect(() => {
    if (!loaded) return;
    function tick() {
      setScheduleMin(new Date(Date.now() + MIN_LEAD_MS).toISOString().slice(0, 16));
    }
    tick();
    const tid = window.setInterval(tick, 60_000);
    return () => window.clearInterval(tid);
  }, [loaded]);

  const editable       = draft !== null && canEditPost(role);
  const deletable      = draft !== null && canDeletePost(role);
  const publishable    = draft !== null && canPublishPost(role);
  const readPublishing = draft?.status === 'publishing';

  const warnings       = draft ? buildPostValidationWarnings(draft) : [];

  const handleRescheduleQuick = async () => {
    if (!draft || readPublishing) return;
    const isoRaw = scheduledInput
      ? new Date(scheduledInput).toISOString()
      : draft.scheduled_at;
    if (!isoRaw) {
      toastError({ title: 'Pick a datetime', description: 'Choose when to publish.' });
      return;
    }
    if (Date.parse(isoRaw) < Date.now() + MIN_LEAD_MS - 999) {
      toastError({
        title:       'Pick a later time',
        description: `Schedule at least ${MIN_LEAD_MS / 60000} minutes ahead.`,
      });
      return;
    }
    setBusy('schedule');
    try {
      let next = await rescheduleCalendarPost(draft.id, isoRaw);
      if (next.status !== 'scheduled') {
        next = await patchPostLifecycle(draft.id, {
          status:       'scheduled',
          scheduled_at: isoRaw,
        });
      }
      setLoaded(next);
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

  const handlePublishNow = async () => {
    if (!draft || !publishable) return;
    setBusy('publish');
    try {
      const updated = await publishNow(draft.id);
      setLoaded(updated);
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

  const handleMoveDraft = async () => {
    if (!draft || !editable) return;
    setBusy('draft');
    try {
      const updated =
        draft.status === 'failed'
          ? await resetToDraft(draft.id)
          : await patchPostLifecycle(draft.id, {
              status:       'draft',
              scheduled_at: null,
              published_at: null,
            });
      setLoaded(updated);
      onPostUpdated(updated);
      success({ title: 'Moved to draft', description: 'You can edit and schedule again.' });
    } catch (e: unknown) {
      toastError({
        title:       'Could not update',
        description: e instanceof Error ? e.message : 'Try again.',
      });
    } finally {
      setBusy(null);
    }
  };

  const handleRetryFailed = async () => {
    if (!draft || draft.status !== 'failed' || !editable) return;
    setBusy('retry');
    try {
      const updated = await resetToDraft(draft.id);
      setLoaded(updated);
      onPostUpdated(updated);
      success({
        title:       'Ready to retry',
        description: 'Open the editor to fix issues and publish again.',
      });
    } catch (e: unknown) {
      toastError({
        title:       'Retry failed',
        description: e instanceof Error ? e.message : 'Try again.',
      });
    } finally {
      setBusy(null);
    }
  };

  const handleDuplicate = async () => {
    if (!draft || !editable) return;
    setBusy('duplicate');
    try {
      const copy = await duplicatePost(draft);
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
    if (!draft) return;
    setBusy('delete');
    try {
      await deletePost(draft.id);
      onPostRemoved(draft.id);
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

  return (
    <>
      <Dialog open onOpenChange={(v) => !v && onClose()}>
        <DialogContent
          showCloseButton
          overlayClassName="bg-black/45 backdrop-blur-[2px]"
          className="max-h-[min(94vh,calc(100vh-3rem))] gap-0 overflow-hidden rounded-2xl border border-gray-200/90 p-0 shadow-2xl sm:max-w-xl"
        >
          {!draft ? (
            <div className="flex items-center justify-center gap-2 px-6 py-16 text-sm text-gray-500">
              <Loader2 className="h-5 w-5 animate-spin" aria-hidden />
              Loading details…
            </div>
          ) : (
            <>
              <div className="border-b border-gray-100 bg-gradient-to-br from-gray-50/90 via-white to-white px-5 py-5 sm:px-6">
                <DialogHeader className="gap-2 pr-8 text-left">
                  <div className="flex flex-wrap items-center gap-2">
                    <PostStatusBadge status={draft.status} />
                    <DialogTitle className="text-lg font-semibold tracking-tight text-gray-900">
                      Post details
                    </DialogTitle>
                  </div>
                  <DialogDescription className="sr-only">
                    Full post content, media, workflow, and management actions.
                  </DialogDescription>

                  <div className="mt-1 flex flex-wrap items-center gap-2 text-sm text-gray-500">
                    <span className="font-mono font-semibold tabular-nums text-gray-900">
                      {formatCalendarSlotTime(draft.scheduled_at)}
                    </span>
                    <span aria-hidden>·</span>
                    <span>{formatCalendarScheduledDetail(draft.scheduled_at)}</span>
                  </div>

                  {draft.status === 'failed' && (
                    <div className="mt-3 space-y-2 rounded-xl border border-red-200/80 bg-red-50/60 px-3 py-2.5 text-sm text-red-900">
                      <div className="flex flex-wrap items-center gap-2 font-semibold">
                        <AlertTriangle className="h-4 w-4 shrink-0" aria-hidden />
                        Publishing failed
                      </div>
                      {draft.last_publish_error ? (
                        <p className="text-[13px] leading-relaxed">{draft.last_publish_error}</p>
                      ) : (
                        <p className="text-[13px] text-red-800/90">
                          No error message was recorded. Check your integrations or try again.
                        </p>
                      )}
                      <p className="text-xs font-medium text-red-800/80">
                        Attempts recorded: {draft.publish_attempt_count}
                      </p>
                      {editable && (
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          className="mt-1 gap-1.5 border-red-200 bg-white"
                          disabled={busy !== null}
                          onClick={() => void handleRetryFailed()}
                        >
                          <RefreshCw className="h-3.5 w-3.5" aria-hidden />
                          Reset to draft & retry
                          {busy === 'retry' && (
                            <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
                          )}
                        </Button>
                      )}
                    </div>
                  )}

                  <div className="flex flex-wrap gap-2 pt-2">
                    <Button variant="outline" size="sm" className="gap-1.5" asChild>
                      <Link href={`/dashboard/posts/${draft.id}/edit`}>
                        <Pencil className="h-3.5 w-3.5" aria-hidden />
                        Edit
                      </Link>
                    </Button>
                    {editable && !readPublishing && (
                      <>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="gap-1.5"
                          disabled={busy !== null}
                          onClick={() => void handleMoveDraft()}
                        >
                          Move to draft
                          {busy === 'draft' && (
                            <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
                          )}
                        </Button>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="gap-1.5"
                          disabled={busy !== null}
                          onClick={() => void handleDuplicate()}
                        >
                          <Copy className="h-3.5 w-3.5" aria-hidden />
                          Duplicate
                          {busy === 'duplicate' && (
                            <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
                          )}
                        </Button>
                      </>
                    )}
                    {publishable &&
                      draft.status !== 'published' &&
                      draft.status !== 'publishing' &&
                      draft.status !== 'failed' && (
                        <Button
                          type="button"
                          size="sm"
                          disabled={busy !== null}
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
                        className="gap-1.5"
                        disabled={busy !== null || readPublishing}
                        onClick={() => setDeleteOpen(true)}
                      >
                        <Trash2 className="h-3.5 w-3.5" aria-hidden />
                        Delete
                      </Button>
                    )}
                  </div>
                </DialogHeader>
              </div>

              <div className="max-h-[min(62vh,calc(100vh-12rem))] space-y-5 overflow-y-auto overscroll-contain px-5 py-5 sm:px-6">
                {warnings.length > 0 && (
                  <section className="rounded-xl border border-amber-200/80 bg-amber-50/50 px-4 py-3">
                    <p className="text-xs font-semibold uppercase tracking-wide text-amber-900/80">
                      Validation notes
                    </p>
                    <ul className="mt-2 list-inside list-disc text-sm text-amber-950">
                      {warnings.map((w) => (
                        <li key={w}>{w}</li>
                      ))}
                    </ul>
                  </section>
                )}

                <section>
                  <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">
                    Content
                  </p>
                  <div className="mt-2 whitespace-pre-wrap rounded-xl border border-gray-100 bg-gray-50/50 p-4 text-[15px] leading-relaxed text-gray-900">
                    {draft.content || '—'}
                  </div>
                </section>

                <dl className="grid gap-3 text-sm">
                  <div className="flex flex-wrap rounded-xl bg-gray-50/80 px-4 py-3 ring-1 ring-gray-100">
                    <dt className="w-full shrink-0 text-xs font-semibold uppercase tracking-wide text-gray-400 sm:w-28">
                      Author
                    </dt>
                    <dd className="min-w-0 font-medium text-gray-800">
                      {draft.author?.name?.trim() ||
                        draft.author?.email?.split('@')[0] ||
                        '—'}
                    </dd>
                  </div>
                  <div className="flex flex-wrap rounded-xl bg-gray-50/80 px-4 py-3 ring-1 ring-gray-100">
                    <dt className="w-full shrink-0 text-xs font-semibold uppercase tracking-wide text-gray-400 sm:w-28">
                      Created
                    </dt>
                    <dd className="font-mono font-semibold tabular-nums text-gray-800">
                      {formatAbsolute(draft.created_at)}
                    </dd>
                  </div>
                  <div className="flex flex-wrap rounded-xl bg-gray-50/80 px-4 py-3 ring-1 ring-gray-100">
                    <dt className="w-full shrink-0 text-xs font-semibold uppercase tracking-wide text-gray-400 sm:w-28">
                      Published
                    </dt>
                    <dd className="font-mono font-semibold tabular-nums text-gray-800">
                      {draft.published_at ? formatAbsolute(draft.published_at) : '—'}
                    </dd>
                  </div>
                </dl>

                {draft.platforms.length > 0 && (
                  <section>
                    <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">
                      Platforms
                    </p>
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {draft.platforms.map((p) => (
                        <PlatformBadge key={p} platform={p} />
                      ))}
                    </div>
                  </section>
                )}

                {draft.media.length > 0 && (
                  <section>
                    <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">
                      Media · {draft.media.length}
                    </p>
                    <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-3">
                      {draft.media.map((m) => (
                        <MediaThumbnail key={m.id} media={m} />
                      ))}
                    </div>
                  </section>
                )}

                <section>
                  <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">
                    Activity &amp; audit
                  </p>
                  <p className="mt-1 text-[11px] leading-relaxed text-gray-500">
                    Append-only history for this post — scheduling, edits, media, and publishing
                    infrastructure events.
                  </p>
                  <div className="mt-2">
                    <PostAuditSection postId={draft.id} />
                  </div>
                </section>

                <section>
                  <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">
                    Publishing log
                  </p>
                  {draft.publish_events.length === 0 ? (
                    <p className="mt-2 rounded-lg border border-dashed border-gray-200 bg-gray-50/50 px-3 py-2 text-sm text-gray-500">
                      No events yet. Log entries appear here when the publish worker records
                      them.
                    </p>
                  ) : (
                    <ul className="mt-2 max-h-48 space-y-2 overflow-y-auto rounded-xl border border-gray-100 bg-white p-2">
                      {draft.publish_events.map((ev) => (
                        <li
                          key={ev.id}
                          className="rounded-lg px-2 py-1.5 text-[13px] leading-snug"
                        >
                          <span className="font-mono text-[11px] text-gray-400">
                            {formatAbsolute(ev.created_at)}
                          </span>
                          <span
                            className={cn(
                              'ml-2 inline-block rounded px-1.5 py-0.5 text-[10px] font-bold uppercase',
                              ev.kind === 'error' && 'bg-red-100 text-red-800',
                              ev.kind === 'warn' && 'bg-amber-100 text-amber-900',
                              ev.kind === 'success' && 'bg-emerald-100 text-emerald-800',
                              ev.kind === 'info' && 'bg-gray-100 text-gray-700',
                            )}
                          >
                            {ev.kind}
                          </span>
                          <p className="mt-1 text-gray-800">{ev.message}</p>
                        </li>
                      ))}
                    </ul>
                  )}
                </section>

                {editable && !readPublishing && (
                  <section className="rounded-xl border border-dashed border-gray-200 bg-gray-50/30 p-4">
                    <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-gray-400">
                      Reschedule
                    </p>
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-stretch">
                      <input
                        type="datetime-local"
                        aria-label="Reschedule datetime"
                        className="h-10 w-full rounded-lg border border-gray-200 bg-white px-3 text-sm outline-none focus:border-gray-400 focus:ring-2 focus:ring-gray-100"
                        value={scheduledInput}
                        min={scheduleMin || undefined}
                        onChange={(e) => setScheduledInput(e.target.value)}
                      />
                      <Button
                        type="button"
                        variant="outline"
                        className="h-10 shrink-0 gap-2 sm:min-w-[7rem]"
                        disabled={busy !== null}
                        onClick={() => void handleRescheduleQuick()}
                      >
                        <CalendarClock className="h-4 w-4" aria-hidden />
                        Apply
                        {busy === 'schedule' && (
                          <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                        )}
                      </Button>
                    </div>
                    <p className="mt-2 text-[11px] text-gray-500">
                      Same lead-time buffer as the calendar ({MIN_LEAD_MS / 60000} min ahead).
                    </p>
                  </section>
                )}

                {!editable && (
                  <p className="rounded-lg bg-gray-50 px-3 py-2 text-center text-xs text-gray-500">
                    Read-only — you can view this post but not change it.
                  </p>
                )}

                <Button variant="ghost" size="sm" className="w-full gap-2 text-gray-500" asChild>
                  <Link href={`/dashboard/posts/${draft.id}/edit`}>
                    Open full composer
                    <ExternalLink className="h-3.5 w-3.5" aria-hidden />
                  </Link>
                </Button>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>

      <DeleteDialog
        open={deleteOpen}
        itemLabel={draft?.content}
        isPending={busy === 'delete'}
        onOpenChange={setDeleteOpen}
        onConfirm={() => void handleConfirmDelete()}
      />
    </>
  );
}
