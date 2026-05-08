// ============================================================================
//  Validation engine
// ----------------------------------------------------------------------------
//  Returns a flat list of issues for the current draft, grouped by severity.
//  Pure function — easy to unit-test, easy to feed into a banner component.
// ============================================================================

import { PLATFORMS } from './platforms';
import type {
  ComposerPostShape,
  PlatformId,
  ValidationIssue,
} from '../types';

export interface ValidatePostOptions {
  /** Action being attempted. Drafts skip most rules. */
  action:        'publish' | 'schedule' | 'draft';
  scheduledIso?: string | null;
  /** Minimum future-lead for scheduling (ms). */
  minLeadMs?:    number;
}

export interface ValidationReport {
  issues:    ValidationIssue[];
  errors:    ValidationIssue[];
  warnings:  ValidationIssue[];
  /** True when no `error`-severity issue blocks the requested action. */
  canSubmit: boolean;
}

const DEFAULT_LEAD_MS = 5 * 60 * 1000;

function hasImageOrVideo(post: ComposerPostShape) {
  return post.media.some((m) => m.fileType === 'image' || m.fileType === 'video');
}

/** Video types we know most channels accept (client-side guard). */
const SUPPORTED_VIDEO_MIMES = new Set([
  'video/mp4',
  'video/webm',
  'video/quicktime',
]);

export function validatePost(
  post: ComposerPostShape,
  opts: ValidatePostOptions,
): ValidationReport {
  const { action, scheduledIso, minLeadMs = DEFAULT_LEAD_MS } = opts;
  const issues: ValidationIssue[] = [];

  const trimmed   = post.content.trim();
  const isDraft   = action === 'draft';
  const isPublish = action === 'publish' || action === 'schedule';

  // ── Top-level shape ───────────────────────────────────────────────────
  if (isPublish && trimmed === '' && post.media.length === 0) {
    issues.push({
      severity: 'error',
      platform: null,
      message:  'Add some content or attach at least one media file before publishing.',
    });
  }

  if (isPublish && post.platforms.length === 0) {
    issues.push({
      severity: 'error',
      platform: null,
      message:  'Select at least one platform.',
    });
  }

  // ── Schedule-window check ─────────────────────────────────────────────
  if (action === 'schedule') {
    if (!scheduledIso) {
      issues.push({
        severity: 'error',
        platform: null,
        message:  'Pick a date and time to schedule.',
      });
    } else {
      const t = new Date(scheduledIso).getTime();
      if (Number.isNaN(t)) {
        issues.push({ severity: 'error', platform: null, message: 'Schedule date is invalid.' });
      } else if (t <= Date.now() + minLeadMs - 1) {
        issues.push({
          severity: 'error',
          platform: null,
          message:  'Scheduled time must be at least 5 minutes in the future.',
        });
      }
    }
  }

  // ── Per-platform rules ────────────────────────────────────────────────
  for (const id of post.platforms) {
    const cfg = PLATFORMS[id];
    const length = post.content.length;

    if (length > cfg.hardLimit) {
      issues.push({
        severity: 'error',
        platform: id,
        message:  `${cfg.label} caps posts at ${cfg.hardLimit.toLocaleString()} characters. You're at ${length.toLocaleString()}.`,
      });
    } else if (length > cfg.softLimit) {
      issues.push({
        severity: 'warning',
        platform: id,
        message:  `${cfg.label} performs best under ${cfg.softLimit.toLocaleString()} characters.`,
      });
    }

    if (cfg.mediaRequired && !hasImageOrVideo(post)) {
      issues.push({
        severity: isDraft ? 'warning' : 'error',
        platform: id,
        message:  `${cfg.label} posts need at least one photo or video.`,
      });
    }

    if (post.media.length > cfg.maxMedia) {
      issues.push({
        severity: 'error',
        platform: id,
        message:  `${cfg.label} accepts up to ${cfg.maxMedia} media items per post.`,
      });
    }

    if (id === 'linkedin' && isPublish && trimmed.length > 0 && trimmed.length < 42) {
      issues.push({
        severity: 'warning',
        platform: 'linkedin',
        message:
          'Short updates on LinkedIn can read abrupt. Add a line of context, a takeaway, or attach media for a more professional post.',
      });
    }

    // Twitter-specific: mixing video with extra images is ambiguous.
    if (id === 'twitter') {
      const hasVideo  = post.media.some((m) => m.fileType === 'video');
      const imageCount = post.media.filter((m) => m.fileType === 'image').length;
      if (hasVideo && imageCount > 0) {
        issues.push({
          severity: 'warning',
          platform: 'twitter',
          message:  'X attaches either one video or up to 4 images, not both.',
        });
      }
    }
  }

  // ── Unsupported file types & video formats ─────────────────────────────
  for (const m of post.media) {
    if (m.fileType === 'audio') {
      issues.push({
        severity: 'warning',
        platform: null,
        message: `Audio files are not natively supported by social platforms. Consider uploading a video instead.`,
      });
      break;
    }
    if (m.fileType === 'video') {
      const mime = m.mimeType?.toLowerCase() ?? '';
      if (mime && !SUPPORTED_VIDEO_MIMES.has(mime)) {
        issues.push({
          severity: 'error',
          platform: null,
          message: `Unsupported video format (${m.mimeType}). Use MP4, MOV (QuickTime), or WEBM.`,
        });
      }
    }
  }

  const errors   = issues.filter((i) => i.severity === 'error');
  const warnings = issues.filter((i) => i.severity === 'warning');

  return {
    issues,
    errors,
    warnings,
    // Drafts ignore errors entirely (the backend is forgiving).
    canSubmit: isDraft || errors.length === 0,
  };
}

export type { PlatformId };
