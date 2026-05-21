import { utcInstantMs } from '@/lib/date';
import { extractHashtags } from './hashtags';
import { PLATFORMS } from './platforms';
import { PLATFORM_BYTES_RULES, REEL_ASPECT_RATIO } from './platformRules';
import { splitIntoTweetThread } from './twitterThread';
import type {
  ComposerPostShape,
  ValidationIssue,
  ValidationReport,
} from '../types';

export interface ValidatePostOptions {
  action:        'publish' | 'schedule' | 'draft';
  scheduledIso?: string | null;
  minLeadMs?:    number;
}

const DEFAULT_LEAD_MS = 5 * 60 * 1000;

const ACCEPT_VIDEO_MIMES = new Set([
  'video/mp4',
  'video/webm',
  'video/quicktime',
]);

function push(
  bucket: ValidationIssue[],
  severity: ValidationIssue['severity'],
  platform: ValidationIssue['platform'],
  message: string,
  code?: string,
) {
  bucket.push({ severity, platform, message, code });
}

function hasVisual(post: ComposerPostShape) {
  return post.media.some((m) => m.fileType === 'image' || m.fileType === 'video');
}

function images(post: ComposerPostShape) {
  return post.media.filter((m) => m.fileType === 'image').length;
}

function videos(post: ComposerPostShape) {
  return post.media.filter((m) => m.fileType === 'video').length;
}

function aspect(m: ComposerPostShape['media'][number]): number | undefined {
  if (typeof m.width === 'number' && typeof m.height === 'number' && m.height)
    return m.width / m.height;
  return undefined;
}

export function longestMediaEdgePx(post: ComposerPostShape): number {
  let mx = 0;
  for (const x of post.media) {
    if (typeof x.width === 'number') mx = Math.max(mx, x.width);
    if (typeof x.height === 'number') mx = Math.max(mx, x.height);
  }
  return mx;
}

function sumVideoPayloadBytes(post: ComposerPostShape): number {
  return post.media.reduce((acc, mm) => {
    if (mm.fileType !== 'video') return acc;
    const size = typeof mm.size === 'number' ? mm.size : 0;
    return acc + size;
  }, 0);
}

function mediaAttachmentErrors(media: ComposerPostShape['media']): ValidationIssue[] {
  const out: ValidationIssue[] = [];
  for (const mm of media) {
    for (const note of mm.clientAttachmentMsgs ?? []) {
      if (note.level !== 'error') continue;
      push(out, 'error', null, note.message, 'media.client.block');
    }
  }
  return out;
}

export function validatePost(
  post: ComposerPostShape,
  opts: ValidatePostOptions,
): ValidationReport {
  const { action, scheduledIso, minLeadMs = DEFAULT_LEAD_MS } = opts;
  const issues: ValidationIssue[] = [...mediaAttachmentErrors(post.media)];

  const trimmed   = post.content.trim();
  const isDraft   = action === 'draft';
  const isPublish = action === 'publish' || action === 'schedule';
  const twLimit   = PLATFORMS.twitter.hardLimit;

  const twitterSplit =
    post.platforms.includes('twitter') && trimmed.length > 0
      ? splitIntoTweetThread(trimmed, twLimit)
      : null;

  let twitterSegments = twitterSplit?.segments ?? [];
  let twitterHasHardOverflow =
    twitterSplit !== null
    && (twitterSplit.hasHardOverflow
      || twitterSplit.segments.some((s) => s.length > twLimit));

  if (twitterSplit && twitterHasHardOverflow) {
    push(
      issues,
      'error',
      'twitter',
      'Fragments longer than 280 characters cannot publish—even as threads. Shorten long URLs/handles manually.',
      'twitter.overflow',
    );
  }

  if (twitterSplit && !twitterHasHardOverflow) {
    if (twitterSplit.segments.length >= 14) {
      push(
        issues,
        'recommendation',
        'twitter',
        `${twitterSplit.segments.length} threaded posts — keep tweet 1 ruthless for skim readers.`,
        'twitter.thread_deep',
      );
    } else if (twitterSplit.segments.length >= 8) {
      push(
        issues,
        'warning',
        'twitter',
        `Threads preview numbering will follow ${twitterSplit.segments.length} posts (≤${twLimit} chars each).`,
        'twitter.thread_wide',
      );
    }
    if (
      trimmed.length > twLimit
      && trimmed.length <= twLimit + 640
      && twitterSplit.segments.length <= 7
    ) {
      push(
        issues,
        'recommendation',
        'twitter',
        `Thread auto-split yielded ${twitterSplit.segments.length} parts — numbering appears in previews.`,
        'twitter.thread_numbers',
      );
    }
    if (trimmed.length <= twLimit && trimmed.length >= twLimit * 0.96) {
      push(
        issues,
        'warning',
        'twitter',
        'Nearly at the single-tweet ceiling — trimming avoids surprise threading.',
        'twitter.near_cap',
      );
    }
  }

  if (isPublish && trimmed === '' && post.media.length === 0)
    push(issues, 'error', null, 'Add content or attach at least one asset before publishing.', 'composer.empty');
  if (isPublish && post.platforms.length === 0)
    push(issues, 'error', null, 'Select at least one channel.', 'composer.no_platform');

  if (action === 'schedule') {
    if (!scheduledIso)
      push(issues, 'error', null, 'Pick a datetime to schedule.', 'schedule.missing');
    else {
      const tMs = utcInstantMs(scheduledIso);
      if (tMs == null)
        push(issues, 'error', null, 'That schedule value is invalid.', 'schedule.invalid');
      else if (tMs <= Date.now() + minLeadMs - 1)
        push(issues, 'error', null, 'Schedule at least five minutes ahead.', 'schedule.window');
    }
  }

  for (const id of post.platforms) {
    const cfg = PLATFORMS[id];

    if (id !== 'twitter') {
      const len = trimmed.length;
      if (len > cfg.hardLimit)
        push(
          issues,
          'error',
          id,
          `${cfg.label} allows ${cfg.hardLimit.toLocaleString()} chars (currently ${len.toLocaleString()}).`,
          `${id}.limit.hard`,
        );
      else if (len > cfg.softLimit && isPublish)
        push(
          issues,
          'warning',
          id,
          `Audience sweet spot for ${cfg.shortLabel} tends to sit under ~${cfg.softLimit.toLocaleString()} chars.`,
          `${id}.limit.soft`,
        );
    }

    if (id === 'twitter') {
      const imgCount = images(post);
      const vidCount = videos(post);
      if (imgCount && vidCount)
        push(
          issues,
          'warning',
          'twitter',
          'X allows one video or up to four images — mixed decks may bounce during publish.',
          'twitter.media_conflict',
        );
      if (imgCount > 4)
        push(issues, 'error', 'twitter', 'More than four images attached for X previews.', 'twitter.images_hard');
      if (vidCount > 1)
        push(
          issues,
          'error',
          'twitter',
          'Composer allows one video attachment for unified X payloads.',
          'twitter.video_hard',
        );
    }

    if (id === 'instagram') {
      if (cfg.mediaRequired && !hasVisual(post)) {
        push(
          issues,
          isDraft ? 'warning' : 'error',
          'instagram',
          'Instagram rejects text-only feed posts — add at least one image or reel clip.',
          'instagram.media_must',
        );
      }
      if (isPublish && trimmed.length > 100 && trimmed.length < 460) {
        push(
          issues,
          'recommendation',
          'instagram',
          'Lead caption with empathy or tension before hashtags — previews clip early.',
          'instagram.caption',
        );
      }
      const tagList = extractHashtags(trimmed);
      if (tagList.length > 28)
        push(
          issues,
          'warning',
          'instagram',
          `${tagList.length} hashtags pushes discovery spam thresholds — tighten to purposeful tags.`,
          'instagram.tags.over',
        );
      else if (tagList.length === 0 && trimmed.length > 72) {
        push(
          issues,
          'recommendation',
          'instagram',
          'Sprinkle 3–8 crisp hashtags anchored to niche + campaign.',
          'instagram.tags_hint',
        );
      }
      for (const vv of post.media) {
        if (vv.fileType !== 'video') continue;
        const dur = vv.durationSeconds;
        const ra  = aspect(vv);
        if (
          typeof dur === 'number'
          && dur > 115
          && ra !== undefined
          && Math.abs(ra - REEL_ASPECT_RATIO) < 0.1
          && dur < 300
        ) {
          push(
            issues,
            'recommendation',
            'instagram',
            `Vertical ~${dur.toFixed(0)}s asset could behave like a reel — confirm safe zones.`,
            'instagram.reel_candidate',
          );
          break;
        }
      }

      const hero = post.media[0];
      if (hero && hero.fileType === 'image') {
        const ar = aspect(hero);
        if (ar !== undefined && (ar < 0.7 || ar > 1.95))
          push(
            issues,
            'warning',
            'instagram',
            `Cover framing ${ar.toFixed(2)}:1 differs from IG feed norms (~0.8–1.92). Drag a better crop first.`,
            'instagram.aspect_cover',
          );
      }
    }

    if (id === 'linkedin') {
      if (isPublish && trimmed.length > 10 && trimmed.length < 52) {
        push(
          issues,
          'warning',
          'linkedin',
          'LinkedIn skimmers crave a crisp POV early — lengthen slightly for authority.',
          'linkedin.short_tone',
        );
      }
      const pdfCount = post.media.filter(
        (mm) => (mm.mimeType || '').toLowerCase() === 'application/pdf',
      ).length;
      if (pdfCount > 1) {
        push(
          issues,
          'warning',
          'linkedin',
          'Multiple LinkedIn-native PDF uploads stack oddly — consolidate if possible.',
          'linkedin.multi_pdf',
        );
      }
      if (pdfCount > 0 && hasVisual(post)) {
        push(
          issues,
          'warning',
          'linkedin',
          'Mixing carousel imagery with downloadable PDF slides can scramble ordering — preview twice.',
          'linkedin.doc_mix',
        );
      }
      if (trimmed.length > 131_072) {
        push(
          issues,
          'error',
          'linkedin',
          `${cfg.label} still caps very long article-style copy — trim before publishing.`,
          'linkedin.long_overflow',
        );
      }
    }

    if (id === 'facebook') {
      if (
        carouselLikeCarousel(post)
        && sumVideoPayloadBytes(post) > PLATFORM_BYTES_RULES.facebook.maxVideoBytes
      )
        push(
          issues,
          'warning',
          'facebook',
          'Heavy carousel videos may trip upload guards — lighten bitrate if uploads stall.',
          'facebook.video_bulk',
        );
      if (hasVisual(post) && longestMediaEdgePx(post) > 8096 && isPublish) {
        push(
          issues,
          'warning',
          'facebook',
          'Ultra-wide creatives occasionally fail ingestion — consider ≤8k longest edge.',
          'facebook.pix_limit',
        );
      }
    }

    if (post.media.length > cfg.maxMedia) {
      push(
        issues,
        'error',
        id,
        `${cfg.label} accepts ≤${cfg.maxMedia} attachments in unified compose.`,
        `${id}.media.count`,
      );
    }
  }

  for (const vv of post.media) {
    if (vv.fileType !== 'video') continue;
    const mime = (vv.mimeType || '').toLowerCase();
    if (mime === '' || ACCEPT_VIDEO_MIMES.has(mime)) continue;
    push(
      issues,
      'error',
      null,
      `Unsupported codec (${mime}) — transcoding to MP4/H.264 is safest.`,
      'media.video.mime',
    );
    break;
  }

  if (post.media.some((mm) => mm.fileType === 'audio')) {
    push(
      issues,
      'warning',
      null,
      'Raw audio uploads rarely fan out cleanly — mux to MP4 or attach as link posts.',
      'media.audio_block',
    );
  }

  const errors = issues.filter((i) => i.severity === 'error');

  if (!post.platforms.includes('twitter')) {
    twitterSegments = [];
    twitterHasHardOverflow = false;
  }

  return {
    issues,
    errors,
    warnings:               issues.filter((i) => i.severity === 'warning'),
    recommendations:        issues.filter((i) => i.severity === 'recommendation'),
    canSubmit:              isDraft || errors.length === 0,
    twitterSegments,
    twitterHasHardOverflow,
  };
}

function carouselLikeCarousel(post: ComposerPostShape): boolean {
  return images(post) + videos(post) >= 2;
}
