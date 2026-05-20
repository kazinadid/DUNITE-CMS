'use client';

import { DateTime } from 'luxon';
import dynamic from 'next/dynamic';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import type { Role } from '@/features/auth';
import {
  CalendarEventDetailsModal,
  CalendarFilters,
  type CalendarFilterState,
  CalendarMobileAgenda,
  CalendarSkeleton,
  CalendarToolbar,
  EmptyCalendarState,
} from '@/features/calendar';
import { formatCalendarSlotTime } from '@/features/calendar/lib/formatTime';
import { AppDialog, AppToast, useFeedback } from '@/features/feedback';
import { ReadOnlyBanner } from '@/features/dashboard';
import { formatAbsolute, listCalendarPosts, rescheduleCalendarPost, type Post } from '@/features/posts';
import { resolveLocalTimeZone } from '@/lib/date';
import { canEditPost, isAdmin } from '@/lib/rbac';
import { supabase } from '@/lib/supabaseClient';

const ContentCalendar = dynamic(
  () =>
    import('@/features/calendar/components/ContentCalendar').then((m) => ({
      default: m.ContentCalendar,
    })),
  {
    ssr: false,
    loading: () => <CalendarSkeleton className="min-h-[min(520px,70vh)] md:min-h-[calc(100vh-15rem)]" />,
  },
);

interface CalendarPageClientProps {
  role: Role;
}

export function CalendarPageClient({ role }: CalendarPageClientProps) {
  const { dialog, success, error: showError, setDialogOpen } = useFeedback();

  const rangeRef          = useRef<{ start: Date; end: Date } | null>(null);
  const debouncePrefetch    = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastRangeRequestId = useRef(0);

  const allowDrag          = canEditPost(role);

  const [posts,       setPosts]       = useState<Post[]>([]);
  const [filters,     setFilters]     = useState<CalendarFilterState>({
    platform: 'all',
    status:   'all',
    userId:   'all',
  });
  const [fetching, setFetching]       = useState(false);
  /** True after the first in-flight range query resolves (success or error). */
  const [ready, setReady]             = useState(false);
  const [detailPost, setDetailPost]   = useState<Post | null>(null);

  const showUserFilter = isAdmin(role);

  const effectiveFilters = useMemo(
    (): CalendarFilterState => ({
      ...filters,
      userId: showUserFilter ? filters.userId : 'all',
    }),
    [filters, showUserFilter],
  );

  const loadRange = useCallback(
    async (start: Date, end: Date, quiet = false) => {
      rangeRef.current = { start, end };
      const req = ++lastRangeRequestId.current;
      if (!quiet) setFetching(true);
      try {
        const rows = await listCalendarPosts(start.toISOString(), end.toISOString());
        if (req !== lastRangeRequestId.current) return;
        setPosts(rows);
      } catch (e: unknown) {
        if (req !== lastRangeRequestId.current) return;
        const msg =
          e instanceof Error ? e.message : 'Please check your connection and try again.';
        showError({
          title:       'Could not load calendar',
          description: msg,
        });
      } finally {
        if (req !== lastRangeRequestId.current) return;
        if (!quiet) setFetching(false);
        setReady(true);
      }
    },
    [showError],
  );

  /** Prime `[start,end)` aligned to **workspace** month boundaries (`resolveLocalTimeZone`). `new Date(y,m,d)` would use the browser/OS zone — different from FC's `timeZone` and corrupts `[gte scheduled_at lt)` filtering for remote editors. */
  useEffect(() => {
    const z = resolveLocalTimeZone();
    const startLux = DateTime.now().setZone(z).startOf('month');
    const endLux = DateTime.now().setZone(z).plus({ months: 2 }).startOf('month');
    const start = startLux.toJSDate();
    const end = endLux.toJSDate();
    const id = window.setTimeout(() => {
      void loadRange(start, end);
    }, 0);
    return () => window.clearTimeout(id);
  }, [loadRange]);

  const scheduleRangeRefetch = useCallback(() => {
    if (debouncePrefetch.current) clearTimeout(debouncePrefetch.current);
    debouncePrefetch.current = setTimeout(() => {
      const r = rangeRef.current;
      if (r) void loadRange(r.start, r.end, true);
    }, 400);
  }, [loadRange]);

  useEffect(() => {
    const channel = supabase
      .channel('calendar-posts')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'posts' },
        () => {
          scheduleRangeRefetch();
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
      if (debouncePrefetch.current) clearTimeout(debouncePrefetch.current);
    };
  }, [scheduleRangeRefetch]);

  const userOptions = useMemo(() => {
    const m = new Map<string, string>();
    for (const p of posts) {
      const label =
        p.author?.name?.trim() ||
        p.author?.email?.split('@')[0] ||
        'Unknown author';
      m.set(p.user_id, label);
    }
    return [...m.entries()]
      .map(([id, name]) => ({ id, name }))
      .sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }));
  }, [posts]);

  const filteredPosts = useMemo(() => {
    return posts.filter((p) => {
      if (
        effectiveFilters.platform !== 'all' &&
        !p.platforms.includes(effectiveFilters.platform)
      ) {
        return false;
      }
      if (effectiveFilters.status !== 'all' && p.status !== effectiveFilters.status) {
        return false;
      }
      if (effectiveFilters.userId !== 'all' && p.user_id !== effectiveFilters.userId) {
        return false;
      }
      return true;
    });
  }, [posts, effectiveFilters]);

  const filtersExcludeAll =
    ready && posts.length > 0 && filteredPosts.length === 0;

  const trulyEmpty = ready && posts.length === 0;

  const handleDatesSet = useCallback(
    (start: Date, end: Date) => {
      void loadRange(start, end);
    },
    [loadRange],
  );

  const handleOpenPost = useCallback((post: Post) => {
    setDetailPost(post);
  }, []);

  const handleCloseDetail = useCallback(() => {
    setDetailPost(null);
  }, []);

  const handleDetailUpdated = useCallback((updated: Post) => {
    setPosts((prev) => prev.map((p) => (p.id === updated.id ? updated : p)));
    setDetailPost((prev) => (prev?.id === updated.id ? updated : prev));
  }, []);

  const handleDetailRemoved = useCallback((id: string) => {
    setPosts((prev) => prev.filter((p) => p.id !== id));
    setDetailPost((prev) => (prev?.id === id ? null : prev));
  }, []);

  const handleReschedule = useCallback(
    async (post: Post, scheduledAtIsoUtc: string) => {
      try {
        const updated = await rescheduleCalendarPost(post.id, scheduledAtIsoUtc);
        setPosts((prev) => prev.map((p) => (p.id === updated.id ? updated : p)));
        success({
          title:       'Post rescheduled',
          description:
            `${formatCalendarSlotTime(updated.scheduled_at ?? scheduledAtIsoUtc)} · `
            + `${formatAbsolute(updated.scheduled_at ?? scheduledAtIsoUtc)}`,
        });
      } catch (e: unknown) {
        const msg =
          e instanceof Error ? e.message : 'You may not have permission to edit this post.';
        showError({
          title:       'Could not reschedule',
          description: msg,
        });
        throw e;
      }
    },
    [showError, success],
  );

  const handleRefresh = useCallback(() => {
    const r = rangeRef.current;
    if (r) void loadRange(r.start, r.end);
  }, [loadRange]);

  return (
    <div className="space-y-6 p-4 md:p-6">
      <AppToast />
      <AppDialog state={dialog} onOpenChange={setDialogOpen} />

      {detailPost ? (
        <CalendarEventDetailsModal
          key={`${detailPost.id}-${detailPost.updated_at}`}
          post={detailPost}
          role={role}
          onClose={handleCloseDetail}
          onPostUpdated={handleDetailUpdated}
          onPostRemoved={handleDetailRemoved}
        />
      ) : null}

      <CalendarToolbar
        title="Content calendar"
        description="Plan and reschedule posts across every channel — month, week, or day."
        onRefresh={handleRefresh}
        refreshing={fetching}
      />

      {!allowDrag && <ReadOnlyBanner />}

      <div className="flex flex-col gap-4 rounded-2xl border border-border/60 bg-card/30 p-4 shadow-sm md:p-5">
        <CalendarFilters
          value={filters}
          onChange={setFilters}
          userOptions={userOptions}
          showUserFilter={showUserFilter}
        />
      </div>

      <div className="relative md:hidden">
        {!ready ? (
          <CalendarSkeleton className="min-h-[280px]" />
        ) : (
          <CalendarMobileAgenda
            posts={filteredPosts}
            onOpenPost={handleOpenPost}
            emptyHint={
              <EmptyCalendarState
                hasNoData={trulyEmpty}
                filtersActive={filtersExcludeAll}
              />
            }
          />
        )}
      </div>

      <div className="hidden md:block space-y-3">
        {ready && filteredPosts.length === 0 && (
          <EmptyCalendarState
            hasNoData={trulyEmpty}
            filtersActive={filtersExcludeAll}
          />
        )}
        <div className="relative">
          {fetching && ready && (
            <div
              className="pointer-events-none absolute inset-0 z-30 flex items-start justify-center rounded-2xl bg-background/40 pt-24 backdrop-blur-[1px] transition-opacity"
              aria-hidden
            >
              <div className="rounded-full border border-border bg-card px-4 py-2 text-xs font-medium text-muted-foreground shadow-md">
                Updating…
              </div>
            </div>
          )}
          <ContentCalendar
            posts={filteredPosts}
            allowDrag={allowDrag}
            onDatesSet={handleDatesSet}
            onOpenPost={handleOpenPost}
            onReschedulePost={handleReschedule}
          />
        </div>
      </div>
    </div>
  );
}
