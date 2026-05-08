export type PostStatus =
  | 'draft'
  | 'scheduled'
  | 'publishing'
  | 'published'
  | 'failed';

/**
 * Statuses the composer can deliberately write. Transient/system-driven states
 * (`publishing`, `failed`) live only in the database / publish-worker.
 */
export type WritablePostStatus = 'draft' | 'scheduled' | 'published';

export interface PostAuthor {
  id: string;
  name: string | null;
  email: string;
}

export interface PostMedia {
  id: string;
  file_url: string;
  file_type: string;
  file_name: string;
  mime_type: string;
  storage_path: string;
  order_index: number;
}

export interface PostPublishEvent {
  id: string;
  created_at: string;
  kind: 'info' | 'warn' | 'error' | 'success';
  message: string;
}

export interface Post {
  id: string;
  user_id: string;
  content: string;
  status: PostStatus;
  scheduled_at: string | null;
  published_at: string | null;
  created_at: string;
  updated_at: string;
  /** Last backend-reported publish failure message, when known. */
  last_publish_error: string | null;
  /** Number of publish attempts recorded by workers (0 if none). */
  publish_attempt_count: number;
  author: PostAuthor | null;
  platforms: string[];
  media: PostMedia[];
  /** Populated when loaded with `POST_DETAIL_SELECT`; otherwise []. */
  publish_events: PostPublishEvent[];
}

export type StatusFilter = 'all' | PostStatus;

/** Shape used by the composer when creating or editing a post. */
export interface PostDraft {
  content: string;
  status: WritablePostStatus;
  scheduled_at: string | null;
  platforms: string[];
}
