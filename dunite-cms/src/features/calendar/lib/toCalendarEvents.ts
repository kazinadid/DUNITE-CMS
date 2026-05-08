import type { EventInput } from '@fullcalendar/core';

import type { Post } from '@/features/posts';

/** Short plain-text preview — FullCalendar expects a title; we trim in UI. */
export function postContentPreview(content: string, max = 120): string {
  const trimmed = content.replace(/\s+/g, ' ').trim();
  if (trimmed.length <= max) return trimmed || 'Scheduled post';
  return `${trimmed.slice(0, max - 1)}…`;
}

export function postToEventInput(post: Post, allowDrag: boolean): EventInput {
  const at = post.scheduled_at;
  if (!at) {
    throw new Error('postToEventInput requires scheduled_at');
  }

  const draggable =
    allowDrag && post.status === 'scheduled';

  return {
    id:         post.id,
    title:      postContentPreview(post.content),
    start:      at,
    allDay:     false,
    editable:   draggable,
    startEditable:    draggable,
    durationEditable: false,
    duration:         '00:50:00',
    extendedProps: {
      post,
    } as Record<string, unknown>,
  };
}
