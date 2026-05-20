import { NextRequest } from 'next/server';

import { failJson, okJson } from '@/lib/social/http/apiResponse';
import { calendarBulkRescheduleBodySchema } from '@/features/calendar/api/contracts';
import {
  assertEditablePostInOrg,
  requireCalendarGate,
  runRescheduleMutation,
} from '@/features/calendar/api/server';

export const dynamic = 'force-dynamic';

export async function PATCH(req: NextRequest) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return failJson('Invalid JSON body.', 400, 'validation_error');
  }

  const parsed = calendarBulkRescheduleBodySchema.safeParse(body);
  if (!parsed.success) {
    return failJson(parsed.error.issues[0]?.message ?? 'Invalid payload.', 422, 'validation_error');
  }

  try {
    const { gate } = await requireCalendarGate();
    const updated: unknown[] = [];
    const failed: Array<{ postId: string; error: string }> = [];

    for (const item of parsed.data.items) {
      try {
        const current = await assertEditablePostInOrg(item.postId, gate.organizationId);
        if (item.expectedUpdatedAt && current.updated_at !== item.expectedUpdatedAt) {
          throw new Error('Post changed during edit.');
        }
        const row = await runRescheduleMutation(
          item.postId,
          item.scheduledAtIsoUtc,
          item.expectedUpdatedAt,
        );
        updated.push(row);
      } catch (e) {
        failed.push({
          postId: item.postId,
          error: e instanceof Error ? e.message : 'failed',
        });
      }
    }

    return okJson({
      updated,
      failed,
      successCount: updated.length,
      failedCount: failed.length,
    });
  } catch (e) {
    return failJson(e instanceof Error ? e.message : 'Bulk reschedule failed.', 400, 'bulk_failed');
  }
}
