import type { FileKind } from '@/features/composer';

export type MediaSort =
  | 'newest'
  | 'oldest'
  | 'name_asc'
  | 'name_desc'
  | 'size_desc'
  | 'size_asc'
  /** Placeholder — same ordering as newest until usage analytics ship */
  | 'recent_used';

export type MediaUploaderFilter =
  | { kind: 'all' }
  | { kind: 'mine' }
  | { kind: 'user'; userId: string };

export type MediaListFilter = {
  search:        string;
  fileType:      'all' | FileKind;
  categorySlug:  string | 'all';
  libraryScope:  'all' | 'library' | 'post';
  sort:          MediaSort;
  uploader:      MediaUploaderFilter;
  /** Inclusive start day `YYYY-MM-DD`, UTC interpretation in queries */
  uploadedFrom:  string | null;
  /** Inclusive end day `YYYY-MM-DD` */
  uploadedTo:    string | null;
};

export interface MediaCategory {
  id:         string;
  slug:       string;
  label:      string;
  sort_order: number;
}

export interface MediaUploaderOption {
  id:    string;
  name:  string | null;
  email: string;
}

export interface LibraryMediaRow {
  id:              string;
  post_id:         string | null;
  user_id:         string | null;
  file_url:        string;
  file_type:       string;
  file_name:       string;
  mime_type:       string;
  size:            number | null;
  storage_path:    string;
  order_index:     number;
  created_at:       string;
  category_id:     string | null;
  thumbnail_url:   string | null;
  thumbnail_path:  string | null;
  is_library:      boolean;
  width_px:        number | null;
  height_px:       number | null;
  media_categories?: { slug: string; label: string } | { slug: string; label: string }[] | null;
  /** Joined profile for `user_id` (Supabase embed). */
  users?: { name: string | null; email: string } | { name: string | null; email: string }[] | null;
}
