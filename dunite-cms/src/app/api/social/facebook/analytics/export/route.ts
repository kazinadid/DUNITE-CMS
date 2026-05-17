import { type NextRequest, NextResponse } from 'next/server';

import { insertAnalyticsAuditLog } from '@/lib/activity/analyticsAudit';
import { createAuthenticatedSupabaseServerClient } from '@/lib/supabase/server';
import {
  resolveOrgPublishGate,
  canExportFacebookAnalytics,
} from '@/lib/org/publishGate';
import { failJson } from '@/lib/social/http/apiResponse';
import {
  facebookExportQuerySchema,
  formatZodError,
} from '@/lib/social/facebook/insights/validator';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';

export const dynamic = 'force-dynamic';

function toCsv(rows: Record<string, unknown>[]): string {
  if (!rows.length) return 'post_id,metric_date\n';
  const cols = [...new Set(rows.flatMap((r) => Object.keys(r)))];
  const esc = (v: unknown) => {
    const s = v == null ? '' : String(v);
    if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
    return s;
  };
  const header = cols.join(',');
  const body = rows
    .map((r) => cols.map((c) => esc(r[c])).join(','))
    .join('\n');
  return `${header}\n${body}\n`;
}

export async function GET(req: NextRequest) {
  let userId: string;
  let gate;
  try {
    const auth = await createAuthenticatedSupabaseServerClient();
    userId = auth.user.id;
    gate = await resolveOrgPublishGate(userId);
    if (!gate || !canExportFacebookAnalytics(gate)) {
      return failJson('Insufficient permissions.', 403);
    }
  } catch {
    return failJson('Not authenticated.', 401);
  }

  const parsed = facebookExportQuerySchema.safeParse(
    Object.fromEntries(req.nextUrl.searchParams.entries()),
  );

  if (!parsed.success) {
    return failJson(formatZodError(parsed.error), 422);
  }

  const { format, from, to, socialAccountId } = parsed.data;
  const orgId = gate.organizationId;

  const today = new Date().toISOString().slice(0, 10);
  const rangeStart =
    from ?? new Date(Date.now() - 30 * 24 * 3600 * 1000).toISOString().slice(0, 10);
  const rangeEnd = to ?? today;

  try {
    const admin = createSupabaseAdminClient();
    let analyticQuery = admin
      .from('facebook_post_analytics')
      .select(
        `
        post_id,
        metric_date,
        impressions,
        reach,
        engagements,
        reactions,
        comments_count,
        shares_count,
        clicks,
        ctr,
        external_post_id,
        social_account_id
      `,
      )
      .eq('organization_id', orgId)
      .gte('metric_date', rangeStart)
      .lte('metric_date', rangeEnd)
      .order('metric_date', { ascending: true });

    if (socialAccountId) {
      analyticQuery = analyticQuery.eq('social_account_id', socialAccountId);
    }

    const { data: rows, error } = await analyticQuery;
    if (error) throw error;

    const postIds = [...new Set((rows ?? []).map((r) => (r as { post_id?: string }).post_id).filter(Boolean))] as string[];

    const captions = new Map<string, string>();
    if (postIds.length > 0) {
      const { data: posts } = await admin
        .from('posts')
        .select('id, content')
        .in('id', postIds);
      for (const p of posts ?? []) {
        const r = p as { id?: string; content?: string };
        if (typeof r.id === 'string') captions.set(r.id, (r.content ?? '').slice(0, 200));
      }
    }

    const merged = (rows ?? []).map((raw) => {
      const r = raw as Record<string, unknown>;
      const pid = typeof r.post_id === 'string' ? r.post_id : '';
      return {
        ...r,
        content_preview: captions.get(pid) ?? '',
      };
    });

    await insertAnalyticsAuditLog({
      userId,
      organizationId: orgId,
      actionType: 'analytics_exported',
      message: `Facebook analytics export (${format}).`,
      metadata: {
        row_count: merged.length,
        range_start: rangeStart,
        range_end: rangeEnd,
      },
    });

    const filenameBase = `facebook-analytics-${orgId.slice(0, 8)}-${rangeStart}-${rangeEnd}`;

    if (format === 'json') {
      return new NextResponse(JSON.stringify({ ok: true, data: merged }, null, 2), {
        status: 200,
        headers: {
          'Content-Type': 'application/json; charset=utf-8',
          'Content-Disposition': `attachment; filename="${filenameBase}.json"`,
        },
      });
    }

    const csv = toCsv(merged);
    return new NextResponse(csv, {
      status: 200,
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="${filenameBase}.csv"`,
      },
    });
  } catch (e: unknown) {
    return failJson(e instanceof Error ? e.message : 'export_failed', 500);
  }
}
