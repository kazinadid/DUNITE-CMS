// ============================================================================
//  Composer feature — shared types
// ----------------------------------------------------------------------------
//  These types are used across the composer surface (editor, previews,
//  validation engine, media sorter) so changes here propagate consistently.
// ============================================================================

export type PlatformId = 'facebook' | 'instagram' | 'linkedin' | 'twitter';

export type FileKind = 'image' | 'video' | 'audio' | 'other';

export type MediaUploadStatus = 'idle' | 'uploading' | 'failed';

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
    };

export type ValidationSeverity = 'error' | 'warning';

export interface ValidationIssue {
  severity:  ValidationSeverity;
  /** `null` ⇒ applies to the whole post / no specific platform. */
  platform:  PlatformId | null;
  message:   string;
}

export interface ComposerPostShape {
  content:    string;
  platforms:  PlatformId[];
  media:      ComposerMedia[];
}
