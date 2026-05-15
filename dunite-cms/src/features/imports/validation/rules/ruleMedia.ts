import { PLATFORMS } from '@/features/composer/lib/platforms';
import type { PlatformId } from '@/features/composer/types';

import { ImportIssueCode } from '../issueCodes';
import { pushIssue } from '../issueHelpers';
import type { NormalizedImportRow } from '../../types';

const IMAGE_EXT = /\.(jpe?g|png|gif|webp|heic|avif|bmp|svg)(\?|#|$)/i;
const VIDEO_EXT = /\.(mp4|webm|mov|m4v|mkv|ogv)(\?|#|$)/i;
/** Extensions we explicitly reject as unsafe / unsupported for social attachments */
const BAD_EXT = /\.(exe|msi|bat|cmd|sh|dll|zip|rar|7z)(\?|#|$)/i;

export function applyMediaRules(row: NormalizedImportRow): void {
  const { issues } = row;

  for (const url of row.mediaUrls) {
    let parsed: URL;
    try {
      parsed = new URL(url);
    } catch {
      pushIssue(issues, ImportIssueCode.MALFORMED_URL, 'error', `Media URL is not valid: ${truncate(url)}`, {
        url,
      });
      continue;
    }

    if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
      pushIssue(issues, ImportIssueCode.MALFORMED_URL, 'error', `Use http(s) URLs for media: ${truncate(url)}`, {
        url,
      });
      continue;
    }

    if (parsed.protocol === 'http:') {
      pushIssue(
        issues,
        ImportIssueCode.MEDIA_URL_NOT_HTTPS,
        'warning',
        'Prefer HTTPS for media URLs (HTTP may be blocked on some networks).',
        { url },
      );
    }

    const path = parsed.pathname.toLowerCase();
    if (BAD_EXT.test(path)) {
      pushIssue(issues, ImportIssueCode.UNSUPPORTED_MEDIA_TYPE, 'error', 'This file type cannot be used as post media.', {
        url,
      });
    } else if (!IMAGE_EXT.test(path) && !VIDEO_EXT.test(path) && path.length > 1) {
      pushIssue(
        issues,
        ImportIssueCode.INVALID_MEDIA_EXTENSION,
        'warning',
        `Could not infer image/video type from URL path (${truncate(url)}). Verify compatibility after upload.`,
        { url },
      );
    }
  }

  for (const p of row.platforms) {
    const cfg = PLATFORMS[p as PlatformId];
    if (!cfg) continue;
    if (cfg.mediaRequired && row.mediaUrls.length === 0) {
      pushIssue(
        issues,
        ImportIssueCode.MEDIA_REQUIRED_SOFT,
        'warning',
        `${cfg.label} posts usually require at least one image or video.`,
        { platform: p },
      );
    }
    if (row.mediaUrls.length > cfg.maxMedia) {
      pushIssue(
        issues,
        ImportIssueCode.TOO_MANY_MEDIA,
        'warning',
        `${cfg.label} accepts at most ${cfg.maxMedia} media attachment(s).`,
        { platform: p, max: cfg.maxMedia },
      );
    }
  }
}

function truncate(s: string, n = 80): string {
  return s.length <= n ? s : `${s.slice(0, n)}…`;
}
