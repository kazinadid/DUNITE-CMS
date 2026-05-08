'use client';

import {
  Calendar,
  CalendarClock,
  CheckCircle2,
  Copy,
  Eye,
  Loader2,
  Pencil,
  Trash2,
} from 'lucide-react';
import { memo, useMemo } from 'react';

import { Avatar } from './Avatar';
import { MediaThumbnail } from './MediaThumbnail';
import { PlatformBadge } from './PlatformBadge';
import { PostActionsMenu, type PostAction } from './PostActionsMenu';
import { PostStatusBadge } from './PostStatusBadge';
import { formatAbsolute, formatRelative } from '../lib/relativeTime';
import type { Post, PostStatus } from '../types';

export type PostCardAction = 'edit' | 'delete' | 'duplicate' | 'preview';

export interface PostCardCapabilities {
  canEdit?:       boolean;
  canDelete?:     boolean;
  canDuplicate?:  boolean;
  /** Preview is always allowed for any reader. Defaults to true. */
  canPreview?:    boolean;
}

interface PostCardProps extends PostCardCapabilities {
  post:    Post;
  /** When set, the card shows a subtle pending overlay (e.g. delete in flight). */
  pending?:'delete' | 'duplicate' | null;
  onAction: (action: PostCardAction, post: Post) => void;
}

const STATUS_ACCENT: Record<PostStatus, string> = {
  draft:      'border-gray-200',
  scheduled:  'border-amber-200/70',
  publishing: 'border-blue-200/70',
  published:  'border-emerald-200/70',
  failed:     'border-red-200/80',
};

function PostCardImpl({
  post,
  canEdit       = false,
  canDelete     = false,
  canDuplicate  = false,
  canPreview    = true,
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
  const isPublished     = post.status === 'published';
  const isScheduled     = post.status === 'scheduled';

  const actions: PostAction[] = useMemo(() => {
    const list: PostAction[] = [];
    if (canPreview)   list.push({ icon: Eye,    label: 'View details', onClick: () => onAction('preview',   post) });
    if (canEdit)      list.push({ icon: Pencil, label: 'Edit',         onClick: () => onAction('edit',      post) });
    if (canDuplicate) list.push({ icon: Copy,   label: 'Duplicate',    onClick: () => onAction('duplicate', post) });
    if (canDelete)    list.push({ icon: Trash2, label: 'Delete',       onClick: () => onAction('delete',    post), destructive: true });
    return list;
  }, [canPreview, canEdit, canDuplicate, canDelete, post, onAction]);

  // Block stray clicks while an action is processing.
  const isBusy = pending !== null;

  return (
    <article
      aria-busy={isBusy}
      className={`group relative flex flex-col rounded-xl border bg-white p-5 shadow-sm transition hover:shadow-md ${
        STATUS_ACCENT[post.status]
      } ${isFailed ? 'hover:border-red-300' : 'hover:border-gray-300'} ${
        isBusy ? 'pointer-events-none' : ''
      }`}
    >
      {/* Header */}
      <header className="mb-3 flex items-start justify-between gap-3">
        <PostStatusBadge status={post.status} />
        {actions.length > 0 ? (
          <PostActionsMenu actions={actions} />
        ) : (
          <span className="h-8 w-8" aria-hidden />
        )}
      </header>

      {/* Cover media (clickable to preview) */}
      {cover && (
        <button
          type="button"
          onClick={() => canPreview && onAction('preview', post)}
          aria-label="View post details"
          className="relative mb-4 block w-full overflow-hidden rounded-lg ring-0 transition focus:outline-none focus-visible:ring-2 focus-visible:ring-[#7A0000]/40"
        >
          <MediaThumbnail media={cover} />
          {extraMediaCount > 0 && (
            <span className="absolute right-2 top-2 inline-flex items-center rounded-md bg-black/60 px-1.5 py-0.5 text-[10px] font-medium text-white backdrop-blur-sm">
              +{extraMediaCount}
            </span>
          )}
        </button>
      )}

      {/* Content */}
      <p className="whitespace-pre-wrap text-sm leading-relaxed text-gray-900 line-clamp-5">
        {post.content || (
          <span className="italic text-gray-400">No content.</span>
        )}
      </p>

      {/* Platforms */}
      {post.platforms.length > 0 && (
        <div className="mt-4 flex flex-wrap gap-1.5">
          {post.platforms.map((p) => (
            <PlatformBadge key={p} platform={p} />
          ))}
        </div>
      )}

      {/* Schedule / publish strip — only shown when meaningful */}
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

      {/* Footer — author + created */}
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

      {/* Pending overlay */}
      {isBusy && (
        <div className="absolute inset-0 z-10 flex items-center justify-center rounded-xl bg-white/70 backdrop-blur-[1px]">
          <span className="inline-flex items-center gap-2 rounded-full bg-white px-3 py-1.5 text-xs font-medium text-gray-700 shadow ring-1 ring-gray-200">
            <Loader2 size={14} className="animate-spin" aria-hidden />
            {pending === 'delete'    && 'Deleting…'}
            {pending === 'duplicate' && 'Duplicating…'}
          </span>
        </div>
      )}
    </article>
  );
}

/**
 * Memoized so the feed only re-renders the cards whose data actually changed.
 * Required for snappy 100+ post feeds.
 */
export const PostCard = memo(PostCardImpl);
