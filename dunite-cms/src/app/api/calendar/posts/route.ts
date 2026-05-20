import { NextRequest } from 'next/server';

import { okJson, failJson } from '@/lib/social/http/apiResponse';
import { calendarFiltersSchema } from '@/features/calendar/api/contracts';
import { requireCalendarGate } from '@/features/calendar/api/server';
import { POST_SELECT, mapPostRow, type RawPostRow } from '@/features/posts/queries';

export const dynamic = 'force-dynamic';

/**
 * GET /api/calendar/posts
 * 
 * Fetches calendar posts within a UTC date range with optional filters.
 * Supports pagination and returns caching headers for performance.
 */
export async function GET(req: NextRequest) {
  let parsed: ReturnType<typeof calendarFiltersSchema.safeParse>;
  try {
    parsed = calendarFiltersSchema.safeParse(Object.fromEntries(req.nextUrl.searchParams.entries()));
  } catch {
    return failJson('Invalid query string.', 400, 'validation_error');
  }

  if (!parsed.success) {
    return failJson(parsed.error.issues[0]?.message ?? 'Invalid query.', 422, 'validation_error');
  }

  try {
    const { auth, gate } = await requireCalendarGate();
    const q = parsed.data;
    
    // Ensure pagination defaults
    const page = q.page ?? 1;
    const pageSize = q.pageSize ?? 250;
    
    // Validate date range width (max 6 months to prevent abuse)
    const startMs = new Date(q.start).getTime();
    const endMs = new Date(q.end).getTime();
    const rangeWidthMs = endMs - startMs;
    const maxRangeMs = 6 * 30 * 24 * 60 * 60 * 1000; // 6 months
    
    if (rangeWidthMs > maxRangeMs) {
      return failJson(
        'Date range too large. Maximum is 6 months.',
        400,
        'range_too_large',
      );
    }

    // Build base query
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let sql: any = auth.supabase
      .from('posts')
      .select(POST_SELECT, { count: 'exact' })
      .eq('organization_id', gate.organizationId)
      .not('scheduled_at', 'is', null)
      .gte('scheduled_at', q.start)
      .lt('scheduled_at', q.end);

    // Apply filters directly to avoid deep type instantiation
    if (q.platform && q.platform !== 'all') {
      sql = sql.eq('post_platforms.platform', q.platform);
    }
    if (q.status && q.status !== 'all') {
      sql = sql.eq('status', q.status);
    }
    if (q.userId) {
      sql = sql.eq('user_id', q.userId);
    }
    if (q.failedOnly) {
      sql = sql.in('status', ['failed', 'retrying']);
    }
    if (q.scheduledOnly) {
      sql = sql.eq('status', 'scheduled');
    }
    if (q.mediaOnly) {
      sql = sql.not('media.id', 'is', null);
    }

    let items: RawPostRow[] = [];
    let total = 0;
    let nextCursor: string | null = null;
    let hasMore = false;
    let queryError: { message: string } | null = null;

    // Support both cursor-based and offset-based pagination
    if (q.cursor) {
      // Cursor-based pagination (more efficient for large datasets)
      const { data, count, error } = await sql
        .order('scheduled_at', { ascending: true })
        .gt('scheduled_at', q.cursor)
        .limit(pageSize + 1);
      
      if (error) {
        queryError = error;
      } else {
        items = (data ?? []) as unknown as RawPostRow[];
        total = count ?? 0;
        
        if (items.length > pageSize) {
          hasMore = true;
          const lastItem = items[pageSize - 1];
          nextCursor = lastItem?.scheduled_at ?? null;
          items = items.slice(0, pageSize);
        }
      }
    } else {
      // Offset-based pagination (legacy support)
      const from = (page - 1) * pageSize;
      const to = from + pageSize - 1;
      
      const { data, count, error } = await sql
        .order('scheduled_at', { ascending: true })
        .range(from, to);
      
      if (error) {
        queryError = error;
      } else {
        items = (data ?? []) as unknown as RawPostRow[];
        total = count ?? 0;
        hasMore = total > page * pageSize;
        if (items.length > 0) {
          const lastItem = items[items.length - 1];
          nextCursor = lastItem?.scheduled_at ?? null;
        }
      }
    }

    if (queryError) return failJson(queryError.message, 500, 'query_failed');

    const response = okJson({
      items: items.map(mapPostRow),
      page,
      pageSize,
      total,
      hasMore,
      nextCursor,
    });
    
    // Add caching headers for better performance
    const cacheMaxAge = 30; // 30 seconds
    response.headers.set('Cache-Control', `public, s-maxage=${cacheMaxAge}, stale-while-revalidate=60`);
    response.headers.set('X-Calendar-Range', `${q.start}/${q.end}`);
    response.headers.set('X-Total-Count', String(total));
    response.headers.set('X-Robots-Tag', 'noindex');
    response.headers.set('X-Content-Type-Options', 'nosniff');
    response.headers.set('X-Frame-Options', 'DENY');
    
    return response;
  } catch (e) {
    return failJson(e instanceof Error ? e.message : 'Unauthorized', 403, 'forbidden');
  }
}
