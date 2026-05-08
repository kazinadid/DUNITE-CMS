// ============================================================================
//  Composer feature — shared types
// ----------------------------------------------------------------------------
//  These types are used across the composer surface (editor, previews,
//  validation engine, media sorter) so changes here propagate consistently.
// ============================================================================

export type PlatformId = 'facebook' | 'instagram' | 'linkedin' | 'twitter';

export type FileKind = 'image' | 'video' | 'audio' | 'other';

export type MediaUploadStatus = 'idle' | 'uploading' | 'failed';

/** Client-side validation note on one attachment tile (upload / dimensions). */
export interface ClientAttachmentMsg {
  level:   'error' | 'warning';
  message: string;
}

/** State of optional async dimension probing for thumbnails. */
export type MediaProbeState = 'idle' | 'loading' | 'ready' | 'failed';

/**
 * A single media slot in the composer. Discriminated union covers two cases:
 *
 *   pending — newly added by the user, hasn't been uploaded yet
 *   saved   — already exists in `public.media`; loaded for edit mode
 *
 * Both share the same display fields so the UI can render them uniformly.
 */
export type ComposerMedia =
  | {
      kind:        'pending';
      uid:         string;          // stable client id for keys / drag
      file:        File;
      previewUrl:  string;
      mimeType:    string;
      size:        number;
      name:        string;
      fileType:    FileKind;
      status:      MediaUploadStatus;
      progress?:   number;          // 0..100, optional
      errorMessage?: string;
      /** Local validation messages (MIME, caps, probes). Shown inline on tiles. */
      clientAttachmentMsgs?: ClientAttachmentMsg[];
      width?:  number;
      height?: number;
      durationSeconds?: number;
      mediaProbe?: MediaProbeState;
    }
  | {
      kind:        'saved';
      uid:         string;
      dbId:        string;
      fileUrl:     string;
      storagePath: string;
      mimeType:    string;
      size:        number;
      name:        string;
      fileType:    FileKind;
      clientAttachmentMsgs?: ClientAttachmentMsg[];
      width?:  number;
      height?: number;
      durationSeconds?: number;
      mediaProbe?: MediaProbeState;
    }
  | {
      /** Reuse an existing uploaded object (library or post) — cloned to a new `media` row on save. */
      kind:            'library_ref';
      uid:             string;
      sourceMediaId:   string;
      /** Canonical `media.file_type` from the source row (e.g. `image`, `video`). */
      storageFileType: string;
      fileUrl:         string;
      storagePath:     string;
      mimeType:        string;
      size:            number;
      name:            string;
      fileType:        FileKind;
      thumbnailUrl:    string | null;
      thumbnailPath:   string | null;
      clientAttachmentMsgs?: ClientAttachmentMsg[];
      width?:  number;
      height?: number;
      durationSeconds?: number;
      mediaProbe?: MediaProbeState;
    };

export type ValidationSeverity = 'error' | 'warning' | 'recommendation';

export interface ValidationIssue {
  severity:  ValidationSeverity;
  /** `null` ⇒ applies to the whole post / no specific platform. */
  platform:  PlatformId | null;
  message:   string;
  /** Optional grouping for tooling / QA. */
  code?: string;
}

export interface ComposerPostShape {
  content:    string;
  platforms:  PlatformId[];
  media:      ComposerMedia[];
}

export interface ValidationReport {
  issues:                 ValidationIssue[];
  errors:                 ValidationIssue[];
  warnings:               ValidationIssue[];
  recommendations:        ValidationIssue[];
  canSubmit:              boolean;
  /** Populated whenever X/Twitter participates and trimmed content exists. */
  twitterSegments:        string[];
  twitterHasHardOverflow: boolean;
}
