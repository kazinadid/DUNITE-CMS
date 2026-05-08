import { fileKind } from '@/features/composer';
import { supabase } from '@/lib/supabaseClient';

import {
  MEDIA_PAGE_SIZE,
  MAX_IMAGE_BYTES,
  MAX_VIDEO_BYTES,
  STORAGE_BUCKET,
} from '../constants';
import { probeImageDimensions, probeVideoDimensions } from '../lib/probeDimensions';
import { compressImageForUpload } from '../lib/compressImage';
import { makeImageThumbnailBlob } from '../lib/makeThumbnail';
import type {
  LibraryMediaRow,
  MediaCategory,
  MediaListFilter,
  MediaUploaderOption,
} from '../types';

const MEDIA_LIST_SELECT = `
  id,
  post_id,
  user_id,
  file_url,
  file_type,
  file_name,
  mime_type,
  size,
  storage_path,
  order_index,
  created_at,
  category_id,
  thumbnail_url,
  thumbnail_path,
  is_library,
  width_px,
  height_px,
  media_categories ( slug, label ),
  users ( name, email )
`;

function buildStoragePath(userId: string, file: File, salt: string): string {
  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '-');
  return `${userId}/lib-${Date.now()}-${salt}-${safeName}`;
}

export async function fetchMediaCategories(): Promise<MediaCategory[]> {
  const { data, error } = await supabase
    .from('media_categories')
    .select('id, slug, label, sort_order')
    .order('sort_order', { ascending: true });
  if (error) throw error;
  return (data ?? []) as MediaCategory[];
}

/** Admin-only: teammate list for uploader filter. */
export async function fetchMediaUploaderOptions(): Promise<MediaUploaderOption[]> {
  const { data, error } = await supabase
    .from('users')
    .select('id, name, email')
    .order('email', { ascending: true })
    .limit(300);
  if (error) throw error;
  return (data ?? []) as MediaUploaderOption[];
}

export function getDefaultMediaFilter(): MediaListFilter {
  return {
    search:       '',
    fileType:     'all',
    categorySlug: 'all',
    libraryScope: 'library',
    sort:         'newest',
    uploader:     { kind: 'all' },
  };
}

export async function listUserMediaPage(opts: {
  /** Current signed-in user (for `mine` uploader scope). */
  requestingUserId: string;
  page: number;
  filter: MediaListFilter;
}): Promise<{ rows: LibraryMediaRow[]; total: number }> {
  const { requestingUserId, page, filter } = opts;
  const from = (page - 1) * MEDIA_PAGE_SIZE;
  const to   = from + MEDIA_PAGE_SIZE - 1;

  let query = supabase
    .from('media')
    .select(MEDIA_LIST_SELECT, { count: 'exact' });

  if (filter.uploader.kind === 'mine') {
    query = query.eq('user_id', requestingUserId);
  } else if (filter.uploader.kind === 'user') {
    query = query.eq('user_id', filter.uploader.userId);
  }

  if (filter.libraryScope === 'library') query = query.eq('is_library', true);
  else if (filter.libraryScope === 'post') query = query.eq('is_library', false);

  if (filter.fileType !== 'all') query = query.eq('file_type', filter.fileType);

  if (filter.search.trim()) {
    const raw = filter.search.trim();
    query = query.ilike('file_name', `%${raw}%`);
  }

  if (filter.categorySlug === 'uncategorized') {
    query = query.is('category_id', null);
  } else if (filter.categorySlug !== 'all') {
    const { data: cat, error: catErr } = await supabase
      .from('media_categories')
      .select('id')
      .eq('slug', filter.categorySlug)
      .maybeSingle();
    if (catErr) throw catErr;
    if (!cat?.id) {
      return { rows: [], total: 0 };
    }
    query = query.eq('category_id', cat.id);
  }

  const ascending = filter.sort === 'oldest';
  query = query.order('created_at', { ascending }).range(from, to);

  const { data, error, count } = await query;
  if (error) throw error;

  return {
    rows: (data ?? []) as unknown as LibraryMediaRow[],
    total: count ?? 0,
  };
}

export async function updateMediaCategory(
  mediaId: string,
  categoryId: string | null,
): Promise<void> {
  const { error } = await supabase
    .from('media')
    .update({ category_id: categoryId })
    .eq('id', mediaId);
  if (error) throw error;
}

export async function bulkUpdateMediaCategory(
  mediaIds: string[],
  categoryId: string | null,
): Promise<void> {
  if (mediaIds.length === 0) return;
  const { error } = await supabase
    .from('media')
    .update({ category_id: categoryId })
    .in('id', mediaIds)
    .eq('is_library', true);
  if (error) throw error;
}

export async function deleteLibraryMedia(mediaId: string): Promise<void> {
  const { data: row, error: fetchError } = await supabase
    .from('media')
    .select('id, storage_path, thumbnail_path, is_library')
    .eq('id', mediaId)
    .single();
  if (fetchError) throw fetchError;
  if (!row?.is_library) {
    throw new Error('Only central library assets can be removed here.');
  }

  const paths = [row.storage_path, row.thumbnail_path].filter(Boolean) as string[];
  if (paths.length > 0) {
    const { error: rmError } = await supabase.storage.from(STORAGE_BUCKET).remove(paths);
    if (rmError) console.warn('[media-library] storage remove:', rmError.message);
  }

  const { error: delError } = await supabase.from('media').delete().eq('id', mediaId);
  if (delError) throw delError;
}

export async function bulkDeleteLibraryMedia(mediaIds: string[]): Promise<void> {
  for (const id of mediaIds) {
    await deleteLibraryMedia(id);
  }
}

export interface LibraryUploadResult {
  id: string;
}

export async function uploadLibraryAsset(
  userId: string,
  file: File,
  categoryId: string | null,
  onProgress?: (n: number) => void,
): Promise<LibraryUploadResult> {
  const mime = file.type || 'application/octet-stream';
  const kind = fileKind(mime);
  if (kind === 'other') {
    throw new Error('Unsupported file type for the media library (images and videos only).');
  }
  if (kind === 'image' && file.size > MAX_IMAGE_BYTES) {
    throw new Error('Source image is too large. Try a file under 25 MB.');
  }
  if (kind === 'video' && file.size > MAX_VIDEO_BYTES) {
    throw new Error('Video exceeds the 120 MB library limit.');
  }

  const salt = Math.random().toString(36).slice(2, 10);

  let widthPx: number | null = null;
  let heightPx: number | null = null;
  if (kind === 'image') {
    const d = await probeImageDimensions(file);
    if (d) {
      widthPx = d.width;
      heightPx = d.height;
    }
  } else if (kind === 'video') {
    const d = await probeVideoDimensions(file);
    if (d) {
      widthPx = d.width;
      heightPx = d.height;
    }
  }

  let uploadBody: File | Blob = file;

  if (kind === 'image') {
    onProgress?.(8);
    uploadBody = await compressImageForUpload(file);
    onProgress?.(40);
  } else {
    onProgress?.(15);
  }

  const path = buildStoragePath(userId, file, salt);
  const { error: upError } = await supabase.storage
    .from(STORAGE_BUCKET)
    .upload(path, uploadBody, {
      upsert:      false,
      contentType: mime,
    });
  if (upError) throw upError;
  onProgress?.(70);

  const { data: pub } = supabase.storage.from(STORAGE_BUCKET).getPublicUrl(path);
  const publicUrl = pub.publicUrl;

  let thumbnailUrl: string | null   = null;
  let thumbnailPath: string | null = null;

  if (kind === 'image') {
    try {
      const thumbBlob = await makeImageThumbnailBlob(file);
      const thumbP    = `${userId}/thumb-${Date.now()}-${salt}.jpg`;
      const { error: tErr } = await supabase.storage
        .from(STORAGE_BUCKET)
        .upload(thumbP, thumbBlob, {
          upsert:      false,
          contentType: 'image/jpeg',
        });
      if (!tErr) {
        thumbnailPath = thumbP;
        const { data: tpub } = supabase.storage.from(STORAGE_BUCKET).getPublicUrl(thumbP);
        thumbnailUrl = tpub.publicUrl;
      }
    } catch {
      /* optional thumb */
    }
  }

  onProgress?.(88);

  const payload = {
    post_id:        null as string | null,
    user_id:        userId,
    file_url:       publicUrl,
    file_type:      kind,
    file_name:      file.name,
    mime_type:      mime,
    size:           (uploadBody as Blob).size,
    storage_path:   path,
    order_index:    0,
    category_id:    categoryId,
    thumbnail_url:  thumbnailUrl,
    thumbnail_path: thumbnailPath,
    is_library:     true,
    width_px:       widthPx,
    height_px:      heightPx,
  };

  const { data: ins, error: insError } = await supabase
    .from('media')
    .insert(payload)
    .select('id')
    .single();
  if (insError) {
    await supabase.storage.from(STORAGE_BUCKET).remove([path]);
    if (thumbnailPath) await supabase.storage.from(STORAGE_BUCKET).remove([thumbnailPath]);
    throw insError;
  }

  onProgress?.(100);
  return { id: ins.id };
}

/** Paginated picker: workspace-visible image/video rows for Composer reuse (RLS gated). */
export async function listPickerMediaPage(opts: {
  page: number;
  search: string;
}): Promise<{ rows: LibraryMediaRow[]; total: number }> {
  const { page, search } = opts;
  const from = (page - 1) * MEDIA_PAGE_SIZE;
  const to   = from + MEDIA_PAGE_SIZE - 1;

  let query = supabase
    .from('media')
    .select(
      `
      id,
      post_id,
      user_id,
      file_url,
      file_type,
      file_name,
      mime_type,
      size,
      storage_path,
      order_index,
      created_at,
      category_id,
      thumbnail_url,
      thumbnail_path,
      is_library,
      width_px,
      height_px,
      media_categories ( slug, label )
    `,
      { count: 'exact' },
    )
    .in('file_type', ['image', 'video'])
    .order('created_at', { ascending: false })
    .range(from, to);

  if (search.trim()) {
    query = query.ilike('file_name', `%${search.trim()}%`);
  }

  const { data, error, count } = await query;
  if (error) throw error;
  return {
    rows: (data ?? []) as unknown as LibraryMediaRow[],
    total: count ?? 0,
  };
}

/**
 * Used when attaching a library or post asset clone in the composer (`cloneMediaRowToPost`).
 */
export type LibrarySourcePayload = {
  file_url:        string;
  file_type:       string;
  file_name:       string;
  mime_type:       string;
  size:            number | null;
  storage_path:    string;
  thumbnail_url:   string | null;
  thumbnail_path:  string | null;
};

export async function cloneMediaRowToPost(opts: {
  postId: string;
  userId: string;
  source: LibrarySourcePayload;
  orderIndex: number;
}): Promise<{ id: string }> {
  const { postId, userId, source, orderIndex } = opts;
  const { data, error } = await supabase
    .from('media')
    .insert({
      post_id:        postId,
      user_id:        userId,
      file_url:       source.file_url,
      file_type:      source.file_type,
      file_name:      source.file_name,
      mime_type:      source.mime_type,
      size:           source.size,
      storage_path:   source.storage_path,
      order_index:    orderIndex,
      category_id:    null,
      is_library:     false,
      thumbnail_url:  source.thumbnail_url,
      thumbnail_path: source.thumbnail_path,
    })
    .select('id')
    .single();
  if (error) throw error;
  return { id: data.id };
}
