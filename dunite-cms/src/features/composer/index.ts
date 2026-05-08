// ── Components ──────────────────────────────────────────────────────────────
export { PlatformSelector }    from './components/PlatformSelector';
export { ComposerEditor }      from './components/ComposerEditor';
export type { ComposerEditorHandle } from './components/ComposerEditor';
export { ComposerToolbar }     from './components/ComposerToolbar';
export { CharacterCounter }    from './components/CharacterCounter';
export { EmojiPicker }         from './components/EmojiPicker';
export { MediaUploader }       from './components/MediaUploader';
export type { MediaUploaderHandle } from './components/MediaUploader';
export { fileKind }            from './components/MediaUploader';
export { MediaSorter }         from './components/MediaSorter';
export { PlatformIcon }        from './components/PlatformIcon';
export { PlatformPreview }     from './components/PlatformPreview';
export { ValidationWarnings }  from './components/ValidationWarnings';

// ── Lib / hooks ─────────────────────────────────────────────────────────────
export {
  PLATFORMS,
  PLATFORM_ORDER,
  PLATFORM_LIST,
  getPlatform,
  tightestLimit,
} from './lib/platforms';
export type { PlatformConfig } from './lib/platforms';

export { extractHashtags, tokenize } from './lib/hashtags';
export type { HashtagToken }         from './lib/hashtags';

export { validatePost } from './lib/validate';
export type {
  ValidatePostOptions,
  ValidationReport,
} from './lib/validate';

export { EMOJI_CATEGORIES, emojiSearch } from './lib/emojis';
export type { EmojiCategory }            from './lib/emojis';

export { useAutoResize, insertAtCursor } from './hooks/useAutoResize';

// ── Types ───────────────────────────────────────────────────────────────────
export type {
  PlatformId,
  FileKind,
  MediaUploadStatus,
  ComposerMedia,
  ValidationSeverity,
  ValidationIssue,
  ComposerPostShape,
} from './types';
