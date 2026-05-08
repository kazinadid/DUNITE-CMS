'use client';

import { Calendar, CheckCircle2, Clock } from 'lucide-react';

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

import { Avatar } from './Avatar';
import { MediaThumbnail } from './MediaThumbnail';
import { PlatformBadge } from './PlatformBadge';
import { PostStatusBadge } from './PostStatusBadge';
import { formatAbsolute, formatRelative } from '../lib/relativeTime';
import type { Post } from '../types';

interface PostPreviewDialogProps {
  post:         Post | null;
  open:         boolean;
  onOpenChange: (open: boolean) => void;
}

/**
 * Read-only preview of a post. Designed for "see the full thing without
 * leaving the feed" — shows full content, all media, platforms, schedule.
 */
export function PostPreviewDialog({
  post,
  open,
  onOpenChange,
}: PostPreviewDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="max-h-[85vh] max-w-[calc(100%-2rem)] gap-0 overflow-hidden rounded-2xl border border-gray-200 bg-white p-0 text-gray-900 shadow-2xl shadow-black/25 sm:max-w-2xl"
      >
        {post && (
          <>
            <DialogHeader className="flex flex-row items-center justify-between gap-4 border-b border-gray-100 px-6 py-4">
              <div className="flex items-center gap-3">
                <PostStatusBadge status={post.status} />
                <DialogTitle className="text-base font-semibold tracking-tight text-gray-900">
                  Post details
                </DialogTitle>
              </div>
              <DialogDescription className="sr-only">
                Read-only details of the selected post including content, media, platforms, and schedule.
              </DialogDescription>
            </DialogHeader>

            <div className="max-h-[calc(85vh-110px)] overflow-y-auto px-6 py-5">
              {/* Content */}
              <p className="whitespace-pre-wrap text-sm leading-relaxed text-gray-900">
                {post.content || (
                  <span className="italic text-gray-400">No content.</span>
                )}
              </p>

              {/* Media gallery */}
              {post.media.length > 0 && (
                <div className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-2">
                  {post.media.map((m) => (
                    <MediaThumbnail key={m.id} media={m} aspect="aspect-[4/3]" />
                  ))}
                </div>
              )}

              {/* Platforms */}
              {post.platforms.length > 0 && (
                <div className="mt-6">
                  <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">
                    Platforms
                  </p>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {post.platforms.map((p) => (
                      <PlatformBadge key={p} platform={p} />
                    ))}
                  </div>
                </div>
              )}

              {/* Meta */}
              <dl className="mt-6 grid grid-cols-1 gap-3 border-t border-gray-100 pt-5 text-xs text-gray-500 sm:grid-cols-2">
                <MetaItem
                  icon={
                    <Avatar
                      seed={post.author?.id ?? post.user_id}
                      name={post.author?.name}
                      email={post.author?.email}
                      size="sm"
                    />
                  }
                  label="Author"
                  value={
                    post.author?.name ??
                    post.author?.email.split('@')[0] ??
                    'Unknown'
                  }
                />
                <MetaItem
                  icon={<Calendar size={12} aria-hidden />}
                  label="Created"
                  value={`${formatRelative(post.created_at)} · ${formatAbsolute(post.created_at)}`}
                />
                {post.scheduled_at && (
                  <MetaItem
                    icon={<Clock size={12} aria-hidden />}
                    label="Scheduled for"
                    value={formatAbsolute(post.scheduled_at)}
                    accent="text-amber-700"
                  />
                )}
                {post.published_at && (
                  <MetaItem
                    icon={<CheckCircle2 size={12} aria-hidden />}
                    label="Published"
                    value={`${formatRelative(post.published_at)} · ${formatAbsolute(post.published_at)}`}
                    accent="text-emerald-700"
                  />
                )}
              </dl>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

function MetaItem({
  icon,
  label,
  value,
  accent,
}: {
  icon:   React.ReactNode;
  label:  string;
  value:  string;
  accent?: string;
}) {
  return (
    <div className="flex flex-col gap-1">
      <dt className="inline-flex items-center gap-1.5 font-medium text-gray-400">
        {icon}
        {label}
      </dt>
      <dd className={`text-gray-700 ${accent ?? ''}`}>{value}</dd>
    </div>
  );
}
