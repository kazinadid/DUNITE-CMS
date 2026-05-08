import { INSTAGRAM_FEED_ASPECT } from './platformRules';
import { tightestMediaByteCaps } from './platformRules';
import type { ClientAttachmentMsg, FileKind, PlatformId } from '../types';

const SUPPORTED_IMAGE_MIMES = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
]);

const SUPPORTED_VIDEO_MIMES = new Set([
  'video/mp4',
  'video/webm',
  'video/quicktime',
]);

const LINKEDIN_DOC_MIME = 'application/pdf';

function mb(n: number): string {
  return `${Math.round(n / (1024 * 1024))} MB`;
}

/** Blocking + advisory checks before uploading a local file */
export function classifyAttachmentMessages(
  file: File,
  kind: FileKind,
  platforms: PlatformId[],
): ClientAttachmentMsg[] {
  const out: ClientAttachmentMsg[] = [];
  const mime = (file.type || 'application/octet-stream').toLowerCase();

  if (kind === 'other') {
    if (mime !== LINKEDIN_DOC_MIME) {
      out.push({
        level:   'error',
        message:
          'Unsupported attachment type for social previews. Use JPEG, PNG, WEBP, GIF, MP4, MOV, WEBM—or a PDF when LinkedIn is the only destination.',
      });
      return out;
    }
    // PDF supported on LinkedIn only in this unified composer workflow.
    if (!platforms.includes('linkedin')) {
      out.push({
        level:   'error',
        message:
          'PDF uploads need LinkedIn selected. Remove the PDF or add LinkedIn as a destination.',
      });
      return out;
    }
    const extras = platforms.filter((p) => p !== 'linkedin');
    if (extras.length > 0) {
      out.push({
        level: 'error',
        message:
          'PDF attachments cannot travel with Instagram, Facebook, or X in one shot. Duplicate the post without the PDF when publishing elsewhere.',
      });
      return out;
    }
    out.push({
      level: 'warning',
      message:
        'LinkedIn renders PDF uploads as downloadable documents—not as inline carousel cards.',
    });
    return out;
  }

  if (kind === 'image') {
    if (mime && !SUPPORTED_IMAGE_MIMES.has(mime)) {
      out.push({
        level:   'error',
        message: `Unsupported image MIME (${mime || 'unknown'}). Use JPEG, PNG, GIF, or WebP.`,
      });
    }
  }

  if (kind === 'video') {
    if (mime && !SUPPORTED_VIDEO_MIMES.has(mime)) {
      out.push({
        level:   'error',
        message: `Unsupported video MIME (${mime || 'unknown'}). Use MP4, MOV, or WebM.`,
      });
    }
  }

  if (platforms.length > 0 && (kind === 'image' || kind === 'video')) {
    const caps = tightestMediaByteCaps(platforms);
    if (kind === 'image' && file.size > caps.maxImageBytes) {
      out.push({
        level:   'error',
        message: `Too large (${mb(file.size)}). Selected channels expect images under ~${mb(caps.maxImageBytes)} each.`,
      });
    }
    if (kind === 'video' && file.size > caps.maxVideoBytes) {
      out.push({
        level:   'warning',
        message:
          `This video weighs ${mb(file.size)} — some networks cap video payload; previews may distort during upload.`,
      });
    }
  }

  return out;
}

/** Dimension guardrails surfaced after probing metadata from the file blob. */
export function dimensionProbeMessages(opts: {
  platforms: PlatformId[];
  fileType:  FileKind;
  width:     number;
  height:    number;
  durationSeconds?: number;
}): ClientAttachmentMsg[] {
  const { platforms, fileType, width, height, durationSeconds = 0 } = opts;
  const out: ClientAttachmentMsg[] = [];
  const ar                          = height > 0 ? width / height : 1;

  if (fileType === 'image' && platforms.includes('instagram')) {
    if (
      ar + Number.EPSILON < INSTAGRAM_FEED_ASPECT.min
      || ar - Number.EPSILON > INSTAGRAM_FEED_ASPECT.max
    ) {
      out.push({
        level:   'warning',
        message: `Instagram feed framing looks best roughly 4:5–1.91:1. Current crop ≈ ${ar.toFixed(2)}.`,
      });
    }
  }

  const maxDim = Math.max(width, height);
  if (fileType === 'image' && maxDim && maxDim < 320) {
    out.push({
      level:   'warning',
      message: 'Some networks down-rank razor-thin thumbnails. Aim for ≥600px on the long edge.',
    });
  }

  if (
    fileType === 'video' &&
    platforms.includes('instagram') &&
    durationSeconds > 0 &&
    durationSeconds > 90
  ) {
    out.push({
      level:   'warning',
      message:
        `Video is ${Math.round(durationSeconds)}s — feed clips stronger under ~90s unless you intentionally publish longer-form.`,
    });
  }

  return out;
}
