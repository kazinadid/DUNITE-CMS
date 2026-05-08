// ============================================================================
//  Platform registry
// ----------------------------------------------------------------------------
//  Single source of truth for everything Dunite knows about a platform:
//  display name, brand color, character limits, media rules, icon glyph
//  used in selectors / previews / validation messages.
// ============================================================================

import type { PlatformId } from '../types';

export interface PlatformConfig {
  id:           PlatformId;
  label:        string;
  /** Short label used in dense UI (preview chips, validation messages). */
  shortLabel:   string;
  brandColor:   string;
  /** Soft tint for selector cards / preview chrome. */
  tintClass:    string;
  /** Hard character cap. Anything over this is a publish blocker. */
  hardLimit:    number;
  /** Soft cap. Anything between soft and hard is "near limit" UX. */
  softLimit:    number;
  /** Some platforms (Instagram) require at least one image-or-video. */
  mediaRequired: boolean;
  /** Maximum number of media items the platform accepts in one post. */
  maxMedia:     number;
  /** Per-platform copy used in validation/help text. */
  mediaHint?:   string;
}

export const PLATFORMS: Record<PlatformId, PlatformConfig> = {
  twitter: {
    id:            'twitter',
    label:         'Twitter / X',
    shortLabel:    'X',
    brandColor:    '#0F1419',
    tintClass:     'bg-gray-50',
    hardLimit:     280,
    softLimit:     260,
    mediaRequired: false,
    maxMedia:      4,
    mediaHint:     'Up to 4 images, or one video.',
  },
  instagram: {
    id:            'instagram',
    label:         'Instagram',
    shortLabel:    'Instagram',
    brandColor:    '#E1306C',
    tintClass:     'bg-pink-50',
    hardLimit:     2200,
    softLimit:     2000,
    mediaRequired: true,
    maxMedia:      10,
    mediaHint:     'At least one photo or video required. Up to 10 in a carousel.',
  },
  linkedin: {
    id:            'linkedin',
    label:         'LinkedIn',
    shortLabel:    'LinkedIn',
    brandColor:    '#0A66C2',
    tintClass:     'bg-sky-50',
    hardLimit:     3000,
    softLimit:     2500,
    mediaRequired: false,
    maxMedia:      9,
    mediaHint:     'Long-form posts welcome. Photos look great in 1:1 or 4:5.',
  },
  facebook: {
    id:            'facebook',
    label:         'Facebook',
    shortLabel:    'Facebook',
    brandColor:    '#1877F2',
    tintClass:     'bg-blue-50',
    hardLimit:     63206,
    softLimit:     5000,
    mediaRequired: false,
    maxMedia:      10,
    mediaHint:     'Long captions are fine. Carousels accept up to 10 photos.',
  },
};

export const PLATFORM_ORDER: PlatformId[] = [
  'twitter',
  'instagram',
  'linkedin',
  'facebook',
];

export const PLATFORM_LIST: PlatformConfig[] =
  PLATFORM_ORDER.map((id) => PLATFORMS[id]);

export function getPlatform(id: string): PlatformConfig | null {
  return (PLATFORMS as Record<string, PlatformConfig | undefined>)[id] ?? null;
}

/** Tightest hard limit across the selected platforms. Used by the counter. */
export function tightestLimit(platforms: PlatformId[]): number | null {
  if (platforms.length === 0) return null;
  return platforms.reduce(
    (min, p) => Math.min(min, PLATFORMS[p].hardLimit),
    Number.POSITIVE_INFINITY,
  );
}
