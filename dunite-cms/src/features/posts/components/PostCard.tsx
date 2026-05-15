'use client';

import {
  Calendar,
  CalendarClock,
  CheckCircle2,
  Copy,
  ExternalLink,
  FileEdit,
  Loader2,
  Pencil,
  RefreshCw,
  Rocket,
  Trash2,
} from 'lucide-react';
import Link from 'next/link';
import { memo, useMemo } from 'react';

import { Avatar } from './Avatar';
import { MediaThumbnail } from './MediaThumbnail';
import { PlatformBadge } from './PlatformBadge';
import { PostActionsMenu, type PostAction } from './PostActionsMenu';
import { PostStatusBadge } from './PostStatusBadge';
import { formatAbsolute, formatRelative } from '../lib/relativeTime';
import type { Post, PostStatus } from '../types';
import { cn } from '@/lib/utils';

export type PostCardAction =
  | 'open'
  | 'edit'
  | 'delete'
  | 'duplicate'
  | 'schedule'
  | 'publishNow'
  | 'moveDraft';

export interface PostCardCapabilities {
  canEdit?:      boolean;
  canDelete?:    boolean;
  canDuplicate?: boolean;
  canPublish?:   boolean;
  canPreview?:   boolean;
  /** Bulk / row selection UX */
  selectable?: boolean;
  selected?:   boolean;
  onSelectToggle?: () => void;
  /** Per-platform job retry (failed jobs). */
  onRetryPublishingJob?: (jobId: string) => void;
  retryingJobId?:       string | null;
}

interface PostCardProps extends PostCardCapabilities {
  post:    Post;
  pending?: 'delete' | 'duplicate' | null;
  onAction: (action: PostCardAction, post: Post) => void;
}

const STATUS_ACCENT: Record<PostStatus, string> = {
  draft:      'border-gray-200',
  scheduled:  'border-amber-200/70',
  queued:     'border-violet-200/75',
  publishing: 'border-blue-200/70',
  published:  'border-emerald-200/70',
  failed:     'border-red-200/85',
  retrying:   'border-orange-200/80',
  cancelled:  'border-zinc-200/80',
};

function PostCardImpl({
  post,
  canEdit       = false,
  canDelete     = false,
  canDuplicate  = false,
  canPublish    = false,
  canPreview    = true,
  selectable    = false,
  selected      = false,
  onSelectToggle,
  onRetryPublishingJob,
  retryingJobId = null,
  pending       = null,
  onAction,
}: PostCardProps) {
  const authorName =
    post.author?.name ??
    post.author?.email.split('@')[0] ??
    'Unknown';

  const cover           = post.media[0];
  const extraMediaCount = Math.max(0, post.media.length - 1);
  const isFailed        = post.status === 'failed';
  const isRetrying      = post.status === 'retrying';
  const isPublished     = post.status === 'published';
  const isScheduled     = post.status === 'scheduled';

  const jobs = post.publishing_jobs ?? [];
  const hasJobAttention =
    jobs.some((j) => j.status === 'failed' || j.status === 'retrying') ||
    isFailed ||
    isRetrying;

  const actions: PostAction[] = useMemo(() => {
    const list: PostAction[] = [];
    if (canPreview) {
      list.push({
        icon: ExternalLink,
        label: 'View details',
        onClick: () => onAction('open', post),
      });
    }
    if (canEdit) {
      list.push({
        icon: Pencil,
        label: 'Edit',
        onClick: () => onAction('edit', post),
      });
      list.push({
        icon: CalendarClock,
        label: 'Schedule…',
        onClick: () => onAction('schedule', post),
      });
      list.push({
        icon: FileEdit,
        label: 'Move to draft',
        onClick: () => onAction('moveDraft', post),
      });
    }
    if (canPublish && post.status !== 'published' && post.status !== 'publishing' && post.status !== 'failed') {
      list.push({
        icon: Rocket,
        label: 'Publish now',
        onClick: () => onAction('publishNow', post),
      });
    }
    if (canDuplicate) {
      list.push({
        icon: Copy,
        label: 'Duplicate',
        onClick: () => onAction('duplicate', post),
      });
    }
    if (canDelete) {
      list.push({
        icon: Trash2,
        label: 'Delete',
        onClick: () => onAction('delete', post),
        destructive: true,
      });
    }
    return list;
  }, [canPreview, canEdit, canDelete, canDuplicate, canPublish, post, onAction]);

  const isBusy = pending !== null;

  return (
    <article
      aria-busy={isBusy}
      aria-selected={selectable ? selected : undefined}
      className={cn(
        'group/post relative flex flex-col rounded-xl border bg-white p-5 shadow-sm',
        'transition-all duration-300 ease-out will-change-transform',
        'hover:-translate-y-0.5 hover:shadow-[0_20px_40px_-28px_rgba(15,23,42,0.35)]',
        STATUS_ACCENT[post.status],
        isFailed ? 'hover:border-red-300' : 'hover:border-gray-300/90',
        (isFailed || isRetrying || hasJobAttention) && 'ring-1 ring-[#7A0000]/15',
        isBusy && 'pointer-events-none',
        selected && selectable && 'ring-[3px] ring-[#7A0000]/38 ring-offset-2 ring-offset-white',
      )}
      onClick={(e) => {
        const t = e.target as HTMLElement;
        if (
          selectable &&
          (t.closest('input[type="checkbox"]') ||
            t.closest('[data-card-interactive]') ||
            t.closest('a'))
        ) {
          return;
        }
        if (
          !selectable &&
          (t.closest('[data-card-interactive]') || t.closest('a'))
        ) {
          return;
        }
        if (selectable) {
          onSelectToggle?.();
          return;
        }
        if (canPreview) onAction('open', post);
      }}
      onKeyDown={(e) => {
        if (!selectable || (e.key !== ' ' && e.key !== 'Enter')) return;
        e.preventDefault();
        onSelectToggle?.();
      }}
      role={selectable ? 'button' : undefined}
      tabIndex={selectable ? 0 : undefined}
    >
      {selectable && (
        <div className="absolute left-3 top-3 z-20 flex items-center" data-card-interactive>
          <input
            type="checkbox"
            className="h-4 w-4 rounded border-gray-300 text-[#7A0000] focus:ring-[#7A0000]"
            checked={selected}
            onChange={() => onSelectToggle?.()}
            onClick={(e) => e.stopPropagation()}
            aria-label={`Select post ${post.id.slice(0, 8)}`}
          />
        </div>
      )}

      <header className="mb-3 flex items-start justify-between gap-3 pl-8 sm:pl-0">
        <div className="min-w-0 space-y-1 pr-10 sm:pr-2">
          <PostStatusBadge status={post.status} />
          {isFailed && post.last_publish_error && (
            <p className="line-clamp-2 text-[11px] leading-snug text-red-700" title={post.last_publish_error}>
              {post.last_publish_error}
            </p>
          )}
          {!isFailed && isRetrying && post.last_publish_error && (
            <p className="line-clamp-2 text-[11px] leading-snug text-orange-800" title={post.last_publish_error}>
              {post.last_publish_error}
            </p>
          )}
        </div>
        {actions.length > 0 ? (
          <div className="absolute right-4 top-4 sm:relative sm:right-auto sm:top-auto">
            <PostActionsMenu actions={actions} />
          </div>
        ) : (
          <span className="h-8 w-8" aria-hidden />
        )}
      </header>

      {/* Quick edit shortcut — avoids mis-clicks when selecting */}
      {!selectable && canEdit && (
        <Link
          href={`/dashboard/posts/${post.id}/edit`}
          data-card-interactive
          className="absolute bottom-14 right-4 z-10 inline-flex items-center rounded-lg bg-white/90 px-2 py-1 text-[11px] font-semibold text-[#7A0000] opacity-0 shadow-sm ring-1 ring-gray-200/80 transition-opacity duration-300 group-hover/post:opacity-100"
          onClick={(e) => e.stopPropagation()}
        >
          Composer
        </Link>
      )}

      {cover && (
        <button
          type="button"
          data-card-interactive
          onClick={(e) => {
            e.stopPropagation();
            if (canPreview) onAction('open', post);
          }}
          aria-label="View post details"
          className="relative mb-4 block w-full overflow-hidden rounded-lg ring-0 transition duration-300 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#7A0000]/40 group-hover/post:brightness-[1.02]"
        >
          <MediaThumbnail media={cover} />
          {extraMediaCount > 0 && (
            <span className="absolute right-2 top-2 inline-flex items-center rounded-md bg-black/60 px-1.5 py-0.5 text-[10px] font-medium text-white backdrop-blur-sm">
              +{extraMediaCount}
            </span>
          )}
        </button>
      )}

      <p className="whitespace-pre-wrap text-sm leading-relaxed text-gray-900 line-clamp-5">
        {post.content || (
          <span className="italic text-gray-400">No content.</span>
        )}
      </p>

      {post.platforms.length > 0 && (
        <div className="mt-4 flex flex-wrap gap-1.5">
          {post.platforms.map((p) => (
            <PlatformBadge key={p} platform={p} />
          ))}
        </div>
      )}

      {jobs.length > 0 && (
        <div className="mt-4 space-y-2 border-t border-gray-100 pt-3">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-gray-400">
            Publishing pipeline
          </p>
          <ul className="space-y-1.5">
            {jobs.map((job) => {
              const canRetryThis =
                Boolean(canEdit && onRetryPublishingJob) &&
                job.status === 'failed' &&
                job.attempt_count < job.max_attempts;
              const busy = retryingJobId === job.id;
              return (
                <li
                  key={job.id}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-gray-50/90 px-2 py-1.5 text-[11px]"
                >
                  <span className="flex min-w-0 items-center gap-1.5">
                    <PlatformBadge platform={job.platform} size="sm" />
                    <span
                      className={cn(
                        'truncate font-medium capitalize',
                        job.status === 'failed' && 'text-red-700',
                        job.status === 'retrying' && 'text-orange-700',
                        job.status === 'queued' && 'text-slate-600',
                        job.status === 'processing' && 'text-blue-700',
                        job.status === 'succeeded' && 'text-emerald-700',
                        job.status === 'cancelled' && 'text-gray-500',
                      )}
                    >
                      {job.status.replace(/_/g, ' ')}
                    </span>
                  </span>
                  <span className="shrink-0 tabular-nums text-[10px] text-gray-400">
                    {job.attempt_count}/{job.max_attempts}
                  </span>
                  {canRetryThis && onRetryPublishingJob ? (
                    <button
                      type="button"
                      data-card-interactive
                      disabled={busy}
                      onClick={(e) => {
                        e.stopPropagation();
                        onRetryPublishingJob(job.id);
                      }}
                      className="inline-flex shrink-0 items-center gap-1 rounded-md bg-white px-2 py-0.5 text-[10px] font-semibold text-[#7A0000] ring-1 ring-[#7A0000]/20 transition hover:bg-[#7A0000]/5 disabled:opacity-50"
                    >
                      {busy ? (
                        <Loader2 size={10} className="animate-spin" aria-hidden />
                      ) : (
                        <RefreshCw size={10} aria-hidden />
                      )}
                      Retry
                    </button>
                  ) : null}
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {(isScheduled && post.scheduled_at) || (isPublished && post.published_at) ? (
        <div className="mt-4 flex flex-wrap items-center gap-2 text-xs">
          {isScheduled && post.scheduled_at && (
            <span
              title={formatAbsolute(post.scheduled_at)}
              className="inline-flex items-center gap-1.5 rounded-md bg-amber-50 px-2 py-1 font-medium text-amber-700 ring-1 ring-inset ring-amber-200/60"
            >
              <CalendarClock size={12} aria-hidden />
              Scheduled {formatRelative(post.scheduled_at)}
            </span>
          )}
          {isPublished && post.published_at && (
            <span
              title={formatAbsolute(post.published_at)}
              className="inline-flex items-center gap-1.5 rounded-md bg-emerald-50 px-2 py-1 font-medium text-emerald-700 ring-1 ring-inset ring-emerald-200/60"
            >
              <CheckCircle2 size={12} aria-hidden />
              Posted {formatRelative(post.published_at)}
            </span>
          )}
        </div>
      ) : null}

      <footer className="mt-auto flex items-center justify-between gap-3 border-t border-gray-100 pt-4 text-xs text-gray-500">
        <span className="flex min-w-0 items-center gap-2">
          <Avatar
            seed={post.author?.id ?? post.user_id}
            name={post.author?.name}
            email={post.author?.email}
            size="sm"
          />
          <span className="min-w-0 truncate font-medium text-gray-700">
            {authorName}
          </span>
        </span>
        <span
          title={formatAbsolute(post.created_at)}
          className="inline-flex shrink-0 items-center gap-1.5"
        >
          <Calendar size={12} aria-hidden />
          {formatRelative(post.created_at)}
        </span>
      </footer>

      {isBusy && (
        <div className="absolute inset-0 z-10 flex items-center justify-center rounded-xl bg-white/70 backdrop-blur-[1px]">
          <span className="inline-flex items-center gap-2 rounded-full bg-white px-3 py-1.5 text-xs font-medium text-gray-700 shadow ring-1 ring-gray-200">
            <Loader2 size={14} className="animate-spin" aria-hidden />
            {pending === 'delete' && 'Deleting…'}
            {pending === 'duplicate' && 'Duplicating…'}
          </span>
        </div>
      )}
    </article>
  );
}

export const PostCard = memo(PostCardImpl);
