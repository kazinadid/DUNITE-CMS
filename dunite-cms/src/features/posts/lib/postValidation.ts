import type { Post } from '../types';

/**
 * Client-side checks for actionable issues — does not replace server validation.
 */
export function buildPostValidationWarnings(post: Post): string[] {
  const msgs: string[] = [];
  if (!post.content.trim()) {
    msgs.push('Post has no caption or body.');
  }
  if (post.platforms.length === 0) {
    msgs.push('No destination platforms selected.');
  }
  if (
    post.status === 'scheduled' &&
    post.scheduled_at &&
    Date.parse(post.scheduled_at) < Date.now() - 30_000
  ) {
    msgs.push('Scheduled time is in the past — reschedule or publish now.');
  }
  if (post.media.length === 0 && lengthyPostExpectsAssets(post.content)) {
    msgs.push(
      'No media attached — some networks perform better with an image or video.',
    );
  }
  return msgs;
}

function lengthyPostExpectsAssets(content: string): boolean {
  return content.trim().length > 280;
}
