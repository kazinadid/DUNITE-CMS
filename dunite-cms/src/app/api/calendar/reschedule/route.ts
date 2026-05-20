import { NextRequest } from 'next/server';

import { failJson, okJson } from '@/lib/social/http/apiResponse';
import { calendarRescheduleBodySchema } from '@/features/calendar/api/contracts';
import {
  assertEditablePostInOrg,
  requireCalendarGate,
  runRescheduleMutation,
} from '@/features/calendar/api/server';

export const dynamic = 'force-dynamic';

/**
 * PATCH /api/calendar/reschedule
 * 
 * Reschedules a single post to a new UTC timestamp.
 * Includes optimistic concurrency control via expectedUpdatedAt.
 */
export async function PATCH(req: NextRequest) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return failJson('Invalid JSON body.', 400, 'validation_error');
  }

  const parsed = calendarRescheduleBodySchema.safeParse(body);
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
      payload.scheduledAtIsoUtc,
      payload.expectedUpdatedAt,
    );

    const response = okJson({ post: updated });
    
    // Add cache-busting headers to invalidate stale data
    response.headers.set('Cache-Control', 'no-cache, no-store, must-revalidate');
    response.headers.set('X-Post-Updated', updated.updated_at);
    
    return response;
  } catch (e) {
    const errorMessage = e instanceof Error ? e.message : 'Could not reschedule.';
    const errorCode = e instanceof Error && e.message.includes('organization') 
      ? 'forbidden' 
      : 'reschedule_failed';
    const httpStatus = errorCode === 'forbidden' ? 403 : 400;
    
    return failJson(errorMessage, httpStatus, errorCode);
  }
}
