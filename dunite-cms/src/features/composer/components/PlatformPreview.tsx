'use client';

import { Heart, MessageCircle, MoreHorizontal, Repeat2, Send, Share2, ThumbsUp } from 'lucide-react';
import { useMemo } from 'react';

import { Avatar } from '@/features/posts';

import { PlatformIcon } from './PlatformIcon';
import { tokenize } from '../lib/hashtags';
import { PLATFORMS } from '../lib/platforms';
import type { ComposerMedia, PlatformId } from '../types';

interface PreviewAuthor {
  name?:  string | null;
  email?: string | null;
  /** Used to colour the avatar circle. */
  seed?:  string;
}

interface PlatformPreviewProps {
  platforms: PlatformId[];
  content:   string;
  media:     ComposerMedia[];
  author:    PreviewAuthor;
  className?: string;
}

/**
 * Renders one preview card per selected platform. Live-updates as the user
 * types — content, hashtags, emojis and media all reflect immediately.
 */
export function PlatformPreview({
  platforms,
  content,
  media,
  author,
  className = '',
}: PlatformPreviewProps) {
  if (platforms.length === 0) {
    return (
      <div
        className={`flex flex-col items-center justify-center rounded-xl border border-dashed border-gray-200 bg-white px-6 py-10 text-center ${className}`}
      >
        <p className="text-sm font-medium text-gray-700">Live preview</p>
        <p className="mt-1 max-w-xs text-xs text-gray-400">
          Pick at least one platform to see exactly how your post will look.
        </p>
      </div>
    );
  }

  return (
    <div className={`space-y-4 ${className}`}>
      {platforms.map((id) => (
        <PreviewCard
          key={id}
          platform={id}
          content={content}
          media={media}
          author={author}
        />
      ))}
    </div>
  );
}

interface PreviewCardProps {
  platform: PlatformId;
  content:  string;
  media:    ComposerMedia[];
  author:   PreviewAuthor;
}

function PreviewCard({ platform, content, media, author }: PreviewCardProps) {
  const cfg = PLATFORMS[platform];
  const handle = useMemo(() => deriveHandle(author), [author]);
  const displayName = author.name?.trim() || author.email?.split('@')[0] || 'Your name';

  return (
    <article
      aria-label={`${cfg.label} preview`}
      className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm"
    >
      {/* Platform chrome header */}
      <div className="flex items-center justify-between border-b border-gray-100 bg-gray-50/60 px-4 py-2">
        <span
          className="inline-flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide"
          style={{ color: cfg.brandColor }}
        >
          <PlatformIcon platform={platform} size={12} />
          {cfg.shortLabel} preview
        </span>
        <span className="text-[10px] font-medium uppercase tracking-wide text-gray-400">
          Live
        </span>
      </div>

      {/* Body — platform-specific layouts */}
      {platform === 'twitter'   && <TwitterBody   content={content} media={media} author={author} displayName={displayName} handle={handle} />}
      {platform === 'instagram' && <InstagramBody content={content} media={media} author={author} displayName={displayName} />}
      {platform === 'linkedin'  && <LinkedInBody  content={content} media={media} author={author} displayName={displayName} />}
      {platform === 'facebook'  && <FacebookBody  content={content} media={media} author={author} displayName={displayName} />}
    </article>
  );
}

// ── Helpers ─────────────────────────────────────────────────────────────────

function deriveHandle({ name, email }: PreviewAuthor) {
  const base = (name?.trim() || email?.split('@')[0] || 'you')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '');
  return `@${base || 'you'}`;
}

function FormattedContent({
  content,
  fallback,
}: {
  content:  string;
  fallback: string;
}) {
  if (!content.trim()) {
    return <span className="text-gray-400">{fallback}</span>;
  }
  const tokens = tokenize(content);
  return (
    <>
      {tokens.map((t, i) =>
        t.kind === 'tag' ? (
          <span key={i} className="font-medium text-blue-600">
            {t.value}
          </span>
        ) : (
          <span key={i}>{t.value}</span>
        ),
      )}
    </>
  );
}

function MediaGallery({
  media,
  className = '',
  rounded = 'rounded-lg',
}: {
  media:     ComposerMedia[];
  className?: string;
  rounded?:   string;
}) {
  if (media.length === 0) return null;

  const visible = media.slice(0, 4);
  const overflow = Math.max(0, media.length - 4);
  const cls =
    visible.length === 1 ? 'grid-cols-1' :
    visible.length === 2 ? 'grid-cols-2' :
    'grid-cols-2';

  return (
    <div className={`grid gap-1 overflow-hidden ${cls} ${className}`}>
      {visible.map((m, i) => {
        const url = m.kind === 'pending' ? m.previewUrl : m.fileUrl;
        const isVideo = m.fileType === 'video';
        const isImage = m.fileType === 'image';
        const isLast  = i === visible.length - 1 && overflow > 0;
        return (
          <div
            key={m.uid}
            className={`relative overflow-hidden bg-gray-100 ${rounded} ${
              visible.length === 3 && i === 0 ? 'row-span-2' : ''
            } aspect-square`}
          >
            {isImage && url && (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={url}
                alt=""
                loading="lazy"
                className="absolute inset-0 h-full w-full object-cover"
              />
            )}
            {isVideo && url && (
              <video
                src={url}
                muted
                playsInline
                className="absolute inset-0 h-full w-full object-cover"
              />
            )}
            {!isImage && !isVideo && (
              <div className="flex h-full w-full items-center justify-center text-xs text-gray-400">
                Attachment
              </div>
            )}
            {isLast && (
              <div className="absolute inset-0 flex items-center justify-center bg-black/55 text-sm font-semibold text-white">
                +{overflow}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ── Twitter / X ─────────────────────────────────────────────────────────────

function TwitterBody({
  content,
  media,
  author,
  displayName,
  handle,
}: {
  content:     string;
  media:       ComposerMedia[];
  author:      PreviewAuthor;
  displayName: string;
  handle:      string;
}) {
  const len   = content.length;
  const limit = PLATFORMS.twitter.hardLimit;
  const over  = len > limit;
  const near  = len > PLATFORMS.twitter.softLimit && !over;

  return (
    <div className="px-4 py-3">
      <div className="flex gap-3">
        <Avatar
          seed={author.seed ?? author.email ?? displayName}
          name={author.name}
          email={author.email}
          size="md"
        />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5 gap-y-0 text-[13px]">
            <span className="font-semibold text-gray-900">{displayName}</span>
            <span className="text-gray-500">{handle}</span>
            <span className="text-gray-300">·</span>
            <span className="text-gray-500">now</span>
            <span
              aria-hidden
              title="Character count for X"
              className={`ml-auto rounded-full px-2 py-0.5 text-[11px] font-semibold tabular-nums ${
                over
                  ? 'bg-red-100 text-red-700'
                  : near
                  ? 'bg-amber-50 text-amber-800'
                  : 'bg-gray-100 text-gray-600'
              }`}
            >
              {len}/{limit}
            </span>
            <button
              type="button"
              aria-hidden
              tabIndex={-1}
              className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-gray-400 sm:ml-0"
            >
              <MoreHorizontal size={14} />
            </button>
          </div>
          <div className="mt-1 whitespace-pre-wrap text-[15px] leading-snug text-gray-900">
            <FormattedContent content={content} fallback="Your tweet appears here." />
          </div>
          {media.length > 0 && (
            <div className="mt-3">
              <MediaGallery media={media} rounded="rounded-2xl" />
            </div>
          )}
          <div className="mt-3 flex items-center justify-between text-gray-500">
            <PreviewAction icon={MessageCircle} />
            <PreviewAction icon={Repeat2} />
            <PreviewAction icon={Heart} />
            <PreviewAction icon={Share2} />
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Instagram ───────────────────────────────────────────────────────────────

function InstagramBody({
  content,
  media,
  author,
  displayName,
}: {
  content:     string;
  media:       ComposerMedia[];
  author:      PreviewAuthor;
  displayName: string;
}) {
  return (
    <div>
      <div className="flex items-center gap-2 px-3 py-2.5">
        <Avatar
          seed={author.seed ?? author.email ?? displayName}
          name={author.name}
          email={author.email}
          size="sm"
        />
        <span className="text-sm font-semibold text-gray-900">{displayName.toLowerCase().replace(/\s+/g, '_')}</span>
        <button
          type="button"
          aria-hidden
          tabIndex={-1}
          className="ml-auto inline-flex h-6 w-6 items-center justify-center rounded-full text-gray-400"
        >
          <MoreHorizontal size={14} />
        </button>
      </div>

      {media.length > 0 ? (
        <>
          <MediaGallery media={media} rounded="rounded-none" />
          {media.length > 1 && (
            <div
              className="flex justify-center gap-1 bg-black py-2"
              aria-label="Carousel preview order"
            >
              {media.map((m, i) => (
                <span
                  key={m.uid}
                  className={`h-1.5 w-1.5 rounded-full transition ${
                    i === 0 ? 'bg-white shadow' : 'bg-white/35'
                  }`}
                />
              ))}
            </div>
          )}
        </>
      ) : (
        <div className="flex aspect-square items-center justify-center bg-gradient-to-br from-pink-50 via-amber-50 to-rose-50 text-xs font-medium text-gray-400">
          Add a photo or video — required for Instagram
        </div>
      )}

      <div className="flex items-center gap-3 px-3 pt-2.5 text-gray-700">
        <Heart size={20} aria-hidden />
        <MessageCircle size={20} aria-hidden />
        <Send size={20} aria-hidden />
      </div>

      <div className="px-3 pb-3 pt-2 text-[13px] leading-snug text-gray-900">
        <span className="font-semibold">{displayName.toLowerCase().replace(/\s+/g, '_')}</span>{' '}
        <span>
          <FormattedContent content={content} fallback="Caption goes here. Tag friends, add hashtags, etc." />
        </span>
      </div>
    </div>
  );
}

// ── LinkedIn ────────────────────────────────────────────────────────────────

function LinkedInBody({
  content,
  media,
  author,
  displayName,
}: {
  content:     string;
  media:       ComposerMedia[];
  author:      PreviewAuthor;
  displayName: string;
}) {
  return (
    <div className="px-4 py-3.5">
      <div className="flex items-center gap-2.5">
        <Avatar
          seed={author.seed ?? author.email ?? displayName}
          name={author.name}
          email={author.email}
          size="md"
        />
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-gray-900">{displayName}</p>
          <p className="text-[11px] text-gray-500">Posting as · just now</p>
        </div>
        <button
          type="button"
          aria-hidden
          tabIndex={-1}
          className="ml-auto inline-flex h-6 w-6 items-center justify-center rounded-full text-gray-400"
        >
          <MoreHorizontal size={14} />
        </button>
      </div>

      <div className="mt-3 whitespace-pre-wrap text-[14px] leading-relaxed text-gray-900">
        <FormattedContent content={content} fallback="Share an update, an article, or a takeaway from your week…" />
      </div>

      {media.length > 0 && (
        <div className="mt-3">
          <MediaGallery media={media} rounded="rounded-md" />
        </div>
      )}

      <div className="mt-3 flex items-center justify-between border-t border-gray-100 pt-2.5 text-gray-600">
        <PreviewAction icon={ThumbsUp} label="Like" />
        <PreviewAction icon={MessageCircle} label="Comment" />
        <PreviewAction icon={Repeat2} label="Repost" />
        <PreviewAction icon={Send} label="Send" />
      </div>
    </div>
  );
}

// ── Facebook ────────────────────────────────────────────────────────────────

function FacebookBody({
  content,
  media,
  author,
  displayName,
}: {
  content:     string;
  media:       ComposerMedia[];
  author:      PreviewAuthor;
  displayName: string;
}) {
  return (
    <div className="px-4 py-3.5">
      <div className="flex items-center gap-2.5">
        <Avatar
          seed={author.seed ?? author.email ?? displayName}
          name={author.name}
          email={author.email}
          size="md"
        />
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-gray-900">{displayName}</p>
          <p className="text-[11px] text-gray-500">Just now · Public</p>
        </div>
        <button
          type="button"
          aria-hidden
          tabIndex={-1}
          className="ml-auto inline-flex h-6 w-6 items-center justify-center rounded-full text-gray-400"
        >
          <MoreHorizontal size={14} />
        </button>
      </div>

      <div className="mt-3 whitespace-pre-wrap text-[14px] leading-relaxed text-gray-900">
        <FormattedContent content={content} fallback="Tell your friends what's on your mind…" />
      </div>

      {media.length > 0 && (
        <div className="mt-3">
          <MediaGallery media={media} rounded="rounded-lg" />
        </div>
      )}

      <div className="mt-3 flex items-center justify-around border-t border-gray-100 pt-2.5 text-gray-600">
        <PreviewAction icon={ThumbsUp} label="Like" />
        <PreviewAction icon={MessageCircle} label="Comment" />
        <PreviewAction icon={Share2} label="Share" />
      </div>
    </div>
  );
}

// ── Tiny shared ─────────────────────────────────────────────────────────────

function PreviewAction({
  icon: Icon,
  label,
}: {
  icon:  React.ComponentType<{ size?: number; 'aria-hidden'?: boolean }>;
  label?: string;
}) {
  return (
    <span className="inline-flex items-center gap-1.5 text-[12px] text-gray-500">
      <Icon size={14} aria-hidden />
      {label && <span>{label}</span>}
    </span>
  );
}
