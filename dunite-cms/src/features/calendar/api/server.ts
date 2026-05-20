import 'server-only';

import { createSupabaseAdminClient } from '@/lib/supabase/admin';
import { createAuthenticatedSupabaseServerClient } from '@/lib/supabase/server';
import { resolveOrgPublishGate } from '@/lib/org/publishGate';
import { POST_SELECT, mapPostRow, type RawPostRow } from '@/features/posts/queries';
import type { Post } from '@/features/posts';
import { isUtcScheduleTooSoon } from '@/lib/date';

const MIN_CALENDAR_LEAD_MS = 5 * 60 * 1000;

export async function requireCalendarGate() {
  const auth = await createAuthenticatedSupabaseServerClient();
  const gate = await resolveOrgPublishGate(auth.user.id);
  if (!gate) {
    throw new Error('No organization membership found.');
  }
  return { auth, gate };
}

export async function assertEditablePostInOrg(
  postId: string,
  organizationId: string,
): Promise<{ status: string; publish_locked_at: string | null; updated_at: string }> {
  const admin = createSupabaseAdminClient();
  const { data: row } = await admin
    .from('posts')
    .select('status, publish_locked_at, updated_at, organization_id')
    .eq('id', postId)
    .maybeSingle();

  if (!row?.organization_id || row.organization_id !== organizationId) {
    throw new Error('Post belongs to another organization.');
  }

  if (row.publish_locked_at) {
    throw new Error('Post is currently being published and cannot be rescheduled.');
  }

  if (row.status === 'published' || row.status === 'publishing' || row.status === 'cancelled') {
    throw new Error(`Cannot reschedule post in status "${row.status}".`);
  }

  return {
    status: row.status as string,
    publish_locked_at: row.publish_locked_at as string | null,
    updated_at: row.updated_at as string,
  };
}

export async function runRescheduleMutation(
  postId: string,
  scheduledAtIsoUtc: string,
  expectedUpdatedAt?: string,
): Promise<Post> {
  if (isUtcScheduleTooSoon(scheduledAtIsoUtc, MIN_CALENDAR_LEAD_MS)) {
    throw new Error('Schedule must be at least 5 minutes in the future.');
  }

  const { auth } = await requireCalendarGate();

  let query = auth.supabase
    .from('posts')
    .update({
      scheduled_at: scheduledAtIsoUtc,
      status:       'scheduled',
      updated_at:   new Date().toISOString(),
    })
    .eq('id', postId);

  if (expectedUpdatedAt) {
    query = query.eq('updated_at', expectedUpdatedAt);
  }

  const { error: updateErr } = await query;
  if (updateErr) {
    throw new Error(updateErr.message);
  }

  const { error: jobsErr } = await auth.supabase.rpc('replace_publishing_jobs', {
    p_post_id: postId,
  });
  if (jobsErr) {
    throw new Error(`Publishing queue sync failed: ${jobsErr.message}`);
  }

  const { data: full, error: fetchErr } = await auth.supabase
    .from('posts')
    .select(POST_SELECT)
    .eq('id', postId)
    .single();

  if (fetchErr) {
    throw new Error(fetchErr.message);
  }

  return mapPostRow(full as unknown as RawPostRow);
}
