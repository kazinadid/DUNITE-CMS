export type PublishFacebookFormat = 'text' | 'photo' | 'video' | 'link';

/** Aligns with posts.status lifecycle (reuse — not a duplicate column). */
export type WorkflowPublishStatus =
  | 'draft'
  | 'scheduled'
  | 'queued'
  | 'publishing'
  | 'published'
  | 'failed'
  | 'retrying'
  | 'cancelled';

export type FailureType =
  | 'retryable'
  | 'permanent'
  | 'token'
  | 'rate_limited';

export interface PublishPostParams {
  postId: string;
  organizationId: string;
  actorUserId: string;
  socialAccountId: string;
}

export interface PublishResult {
  externalPostId: string | null;
  format: PublishFacebookFormat;
}

export interface TokenHealthSummary {
  canPublish: boolean;
  requiresReconnect?: boolean;
  reason?: string;
}
