export type PostStatus = 'draft' | 'scheduled' | 'published';

export interface PostAuthor {
  id: string;
  name: string | null;
  email: string;
}

export interface Post {
  id: string;
  user_id: string;
  content: string;
  status: PostStatus;
  scheduled_at: string | null;
  created_at: string;
  updated_at: string;
  author: PostAuthor | null;
  platforms: string[];
}

export type StatusFilter = 'all' | PostStatus;

/** Shape used by the composer when creating or editing a post. */
export interface PostDraft {
  content: string;
  status: PostStatus;
  scheduled_at: string | null;
  platforms: string[];
}
