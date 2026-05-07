'use client';

import {
  Calendar,
  Clock,
  Copy,
  Pencil,
  Send,
  Trash2,
  User,
} from 'lucide-react';

import { PostActionsMenu, type PostAction } from './PostActionsMenu';
import { PostStatusBadge } from './PostStatusBadge';
import type { Post } from '../types';

interface PostCardProps {
  post: Post;
  /** Can the current user edit/delete this specific post? */
  canManage: boolean;
  onEdit?:        () => void;
  onDelete?:      () => void;
  onDuplicate?:   () => void;
  onPublishNow?:  () => void;
}

const PLATFORM_DOT: Record<string, string> = {
  facebook: '#1877F2',
  twitter:  '#000000',
  linkedin: '#0A66C2',
};

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString(undefined, {
    month: 'short',
    day:   'numeric',
    year:  'numeric',
  });
}

function formatDateTime(iso: string) {
  return new Date(iso).toLocaleString(undefined, {
    month:  'short',
    day:    'numeric',
    hour:   '2-digit',
    minute: '2-digit',
  });
}

export function PostCard({
  post,
  canManage,
  onEdit,
  onDelete,
  onDuplicate,
  onPublishNow,
}: PostCardProps) {
  const authorLabel =
    post.author?.name ?? post.author?.email.split('@')[0] ?? 'Unknown';

  const created   = formatDate(post.created_at);
  const scheduled = post.scheduled_at ? formatDateTime(post.scheduled_at) : null;

  const actions: PostAction[] = canManage
    ? [
        ...(onEdit         ? [{ icon: Pencil, label: 'Edit',         onClick: onEdit }]                       : []),
        ...(onPublishNow   ? [{ icon: Send,   label: 'Publish now',  onClick: onPublishNow }]                 : []),
        ...(onDuplicate    ? [{ icon: Copy,   label: 'Duplicate',    onClick: onDuplicate }]                  : []),
        ...(onDelete       ? [{ icon: Trash2, label: 'Delete',       onClick: onDelete, destructive: true }]  : []),
      ]
    : [];

  return (
    <article className="group flex flex-col rounded-xl border border-gray-200 bg-white p-5 shadow-sm transition hover:border-gray-300 hover:shadow-md">
      {/* Header */}
      <header className="mb-3 flex items-start justify-between gap-3">
        <PostStatusBadge status={post.status} />
        <PostActionsMenu actions={actions} />
      </header>

      {/* Content */}
      <p className="whitespace-pre-wrap text-sm leading-relaxed text-gray-900 line-clamp-5">
        {post.content}
      </p>

      {/* Platforms */}
      {post.platforms.length > 0 && (
        <div className="mt-4 flex flex-wrap gap-1.5">
          {post.platforms.map((p) => (
            <span
              key={p}
              className="inline-flex items-center gap-1 rounded-md bg-gray-50 px-2 py-0.5 text-xs font-medium capitalize text-gray-600 ring-1 ring-inset ring-gray-200"
            >
              <span
                aria-hidden
                className="h-1.5 w-1.5 rounded-full"
                style={{ backgroundColor: PLATFORM_DOT[p] ?? '#9CA3AF' }}
              />
              {p}
            </span>
          ))}
        </div>
      )}

      {/* Footer */}
      <footer className="mt-auto flex flex-wrap items-center justify-between gap-x-3 gap-y-1.5 border-t border-gray-100 pt-4 text-xs text-gray-500">
        <span className="inline-flex items-center gap-1.5">
          <User size={12} aria-hidden />
          {authorLabel}
        </span>
        <div className="inline-flex flex-wrap items-center gap-3">
          {scheduled && (
            <span
              className="inline-flex items-center gap-1.5 text-amber-700"
              title="Scheduled for"
            >
              <Clock size={12} aria-hidden />
              {scheduled}
            </span>
          )}
          <span className="inline-flex items-center gap-1.5" title="Created">
            <Calendar size={12} aria-hidden />
            {created}
          </span>
        </div>
      </footer>
    </article>
  );
}
