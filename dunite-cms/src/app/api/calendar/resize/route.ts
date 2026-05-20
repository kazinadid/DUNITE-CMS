import { NextRequest } from 'next/server';

import { failJson, okJson } from '@/lib/social/http/apiResponse';
import { calendarResizeBodySchema } from '@/features/calendar/api/contracts';
import {
  assertEditablePostInOrg,
  requireCalendarGate,
  runRescheduleMutation,
} from '@/features/calendar/api/server';

export const dynamic = 'force-dynamic';

/**
 * PATCH /api/calendar/resize
 * 
 * Resizes a calendar event (post). Since posts are point-in-time publishes
 * without persisted duration, resize snaps the publish instant to the
 * resized start time. End time is visual-only in the calendar.
 */
export async function PATCH(req: NextRequest) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return failJson('Invalid JSON body.', 400, 'validation_error');
  }

  const parsed = calendarResizeBodySchema.safeParse(body);
  if (!parsed.success) {
    return failJson(parsed.error.issues[0]?.message ?? 'Invalid payload.', 422, 'validation_error');
  }

  try {
    const { gate } = await requireCalendarGate();
    const payload = parsed.data;
    const current = await assertEditablePostInOrg(payload.postId, gate.organizationId);

    if (payload.expectedUpdatedAt && current.updated_at !== payload.expectedUpdatedAt) {
      return failJson(
        'Post has changed since you started editing. Refresh and retry.',
        409,
        'stale_write',
      );
    }

    const updated = await runRescheduleMutation(
      payload.postId,
      payload.startAtIsoUtc,
      payload.expectedUpdatedAt,
    );

    const response = okJson({
      post: updated,
      durationPersisted: false,
      note: 'Duration is visual-only; publish instant updated to resized start.',
    });
    
    // Add cache-busting headers
    response.headers.set('Cache-Control', 'no-cache, no-store, must-revalidate');
    response.headers.set('X-Post-Updated', updated.updated_at);
    
    return response;
  } catch (e) {
    const errorMessage = e instanceof Error ? e.message : 'Resize failed.';
    const errorCode = e instanceof Error && e.message.includes('organization')
      ? 'forbidden'
      : 'resize_failed';
    const httpStatus = errorCode === 'forbidden' ? 403 : 400;
    
    return failJson(errorMessage, httpStatus, errorCode);
  }
}
