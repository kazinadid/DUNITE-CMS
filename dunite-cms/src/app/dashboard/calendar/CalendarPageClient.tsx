'use client';

import dynamic from 'next/dynamic';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  QueryClient,
  QueryClientProvider,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';

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
import {
  formatAbsolute,
  listCalendarPostsWithFilters,
  resizeCalendarPost,
  rescheduleCalendarPost,
  type Post,
} from '@/features/posts';
import {
  resolveLocalTimeZone,
  getCalendarViewportRangeUtc,
} from '@/lib/datetime';
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

function readFiltersFromUrl(search: URLSearchParams): CalendarFilterState {
  return {
    platform: search.get('platform') ?? 'all',
    status: (search.get('status') as CalendarFilterState['status']) ?? 'all',
    userId: search.get('userId') ?? 'all',
    failedOnly: search.get('failedOnly') === '1',
    scheduledOnly: search.get('scheduledOnly') === '1',
    mediaOnly: search.get('mediaOnly') === '1',
  };
}

function writeFiltersToUrl(
  pathname: string,
  search: URLSearchParams,
  filters: CalendarFilterState,
): string {
  const next = new URLSearchParams(search.toString());
  const setOptional = (key: string, value: string, skip = 'all') => {
    if (!value || value === skip) next.delete(key);
    else next.set(key, value);
  };
  setOptional('platform', filters.platform);
  setOptional('status', filters.status);
  setOptional('userId', filters.userId);
  if (filters.failedOnly) next.set('failedOnly', '1');
  else next.delete('failedOnly');
  if (filters.scheduledOnly) next.set('scheduledOnly', '1');
  else next.delete('scheduledOnly');
  if (filters.mediaOnly) next.set('mediaOnly', '1');
  else next.delete('mediaOnly');
  const qs = next.toString();
  return qs ? `${pathname}?${qs}` : pathname;
}

function CalendarPageClientInner({ role }: CalendarPageClientProps) {
  const { dialog, success, error: showError, setDialogOpen } = useFeedback();

  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const queryClient = useQueryClient();
  const rangeRef = useRef<{ start: Date; end: Date } | null>(null);
  const debouncePrefetch = useRef<ReturnType<typeof setTimeout> | null>(null);

  const allowDrag = canEditPost(role);

  const [range, setRange] = useState<{ startIso: string; endIso: string } | null>(null);
  const [filters, setFilters] = useState<CalendarFilterState>(() =>
    readFiltersFromUrl(new URLSearchParams(searchParams.toString())),
  );
  const [detailPost, setDetailPost] = useState<Post | null>(null);

  const showUserFilter = isAdmin(role);

  const effectiveFilters = useMemo(
    (): CalendarFilterState => ({
      ...filters,
      userId: showUserFilter ? filters.userId : 'all',
    }),
    [filters, showUserFilter],
  );

  const queryKey = useMemo(
    () => ['calendar-posts', range?.startIso, range?.endIso, effectiveFilters] as const,
    [range?.startIso, range?.endIso, effectiveFilters],
  );

  const calendarQuery = useQuery({
    queryKey,
    enabled: Boolean(range?.startIso && range?.endIso),
    staleTime: 20_000,
    refetchOnWindowFocus: true,
    queryFn: async () => {
      if (!range) return { items: [] as Post[], total: 0, hasMore: false };
      return listCalendarPostsWithFilters({
        startIso: range.startIso,
        endIso: range.endIso,
        filters: effectiveFilters,
        page: 1,
        pageSize: 500,
      });
    },
  });

  const posts = calendarQuery.data?.items ?? [];
  const ready = !calendarQuery.isLoading;
  const fetching = calendarQuery.isFetching;

  /** Prime `[start,end)` aligned to **workspace** month boundaries (`resolveLocalTimeZone`). `new Date(y,m,d)` would use the browser/OS zone — different from FC's `timeZone` and corrupts `[gte scheduled_at lt)` filtering for remote editors. */
  useEffect(() => {
    const { startIso, endIso } = getCalendarViewportRangeUtc();
    const start = new Date(startIso);
    const end = new Date(endIso);
    const id = window.setTimeout(() => {
      rangeRef.current = { start, end };
      setRange({ startIso, endIso });
    }, 0);
    return () => window.clearTimeout(id);
  }, []);

  const scheduleRangeRefetch = useCallback(() => {
    if (debouncePrefetch.current) clearTimeout(debouncePrefetch.current);
    debouncePrefetch.current = setTimeout(() => {
      void queryClient.invalidateQueries({ queryKey: ['calendar-posts'] });
    }, 400);
  }, [queryClient]);

  useEffect(() => {
    const channel = supabase
      .channel('calendar-posts')
      .on(
        'postgres_changes',
        { 
          event: '*', 
          schema: 'public', 
          table: 'posts',
          filter: `scheduled_at=not.is.null`,
        },
        (payload) => {
          const newPost = payload.new as Record<string, unknown> | null;
          const oldPost = payload.old as Record<string, unknown> | null;
          
          if (!rangeRef.current) return;
          
          const eventTime = (newPost?.scheduled_at || oldPost?.scheduled_at) as string | undefined;
          if (!eventTime) return;
          
          const eventMs = new Date(eventTime).getTime();
          const rangeStart = rangeRef.current.start.getTime();
          const rangeEnd = rangeRef.current.end.getTime();
          
          if (eventMs >= rangeStart && eventMs < rangeEnd) {
            scheduleRangeRefetch();
          }
        },
      )
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          console.log('[calendar] Realtime subscription active (scoped to scheduled posts)');
        }
        if (status === 'CHANNEL_ERROR') {
          console.error('[calendar] Realtime channel error, will refetch on reconnect');
          scheduleRangeRefetch();
        }
      });

    return () => {
      supabase.removeChannel(channel);
      if (debouncePrefetch.current) clearTimeout(debouncePrefetch.current);
    };
  }, [scheduleRangeRefetch]);

  useEffect(() => {
    const next = writeFiltersToUrl(pathname, new URLSearchParams(searchParams.toString()), filters);
    const current = `${pathname}${searchParams.toString() ? `?${searchParams.toString()}` : ''}`;
    if (next !== current) {
      router.replace(next, { scroll: false });
    }
  }, [filters, pathname, router, searchParams]);

  const updateFilters = useCallback((next: CalendarFilterState) => {
    setFilters(next);
  }, []);

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

  const filteredPosts = posts;

  const filtersExcludeAll = ready && posts.length > 0 && filteredPosts.length === 0;

  const trulyEmpty = ready && posts.length === 0;

  const handleDatesSet = useCallback(
    (start: Date, end: Date) => {
      rangeRef.current = { start, end };
      setRange({ startIso: start.toISOString(), endIso: end.toISOString() });
    },
    [],
  );

  const handleOpenPost = useCallback((post: Post) => {
    setDetailPost(post);
  }, []);

  const handleCloseDetail = useCallback(() => {
    setDetailPost(null);
  }, []);

  const handleDetailUpdated = useCallback((updated: Post) => {
    queryClient.setQueryData(
      queryKey,
      (prev: { items: Post[]; total: number; hasMore: boolean } | undefined) => {
        if (!prev) return prev;
        return {
          ...prev,
          items: prev.items.map((p) => (p.id === updated.id ? updated : p)),
        };
      },
    );
    setDetailPost((prev) => (prev?.id === updated.id ? updated : prev));
  }, [queryClient, queryKey]);

  const handleDetailRemoved = useCallback((id: string) => {
    queryClient.setQueryData(
      queryKey,
      (prev: { items: Post[]; total: number; hasMore: boolean } | undefined) => {
        if (!prev) return prev;
        return {
          ...prev,
          items: prev.items.filter((p) => p.id !== id),
          total: Math.max(0, prev.total - 1),
        };
      },
    );
    setDetailPost((prev) => (prev?.id === id ? null : prev));
  }, [queryClient, queryKey]);

  const handleReschedule = useCallback(
    async (post: Post, scheduledAtIsoUtc: string) => {
      try {
        const updated = await rescheduleCalendarPost(
          post.id,
          scheduledAtIsoUtc,
          post.updated_at,
        );
        handleDetailUpdated(updated);
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
    [showError, success, handleDetailUpdated],
  );

  const handleResize = useCallback(
    async (post: Post, startAtIsoUtc: string, endAtIsoUtc: string) => {
      try {
        const updated = await resizeCalendarPost(
          post.id,
          startAtIsoUtc,
          endAtIsoUtc,
          post.updated_at,
        );
        handleDetailUpdated(updated);
        success({
          title: 'Calendar block resized',
          description: 'Publish instant updated; duration remains visual-only.',
        });
      } catch (e: unknown) {
        const msg =
          e instanceof Error ? e.message : 'You may not have permission to edit this post.';
        showError({
          title: 'Could not resize',
          description: msg,
        });
        throw e;
      }
    },
    [handleDetailUpdated, showError, success],
  );

  const handleRefresh = useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: ['calendar-posts'] });
  }, [queryClient]);

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
          onChange={updateFilters}
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
            onResizePost={handleResize}
          />
        </div>
      </div>
    </div>
  );
}

export function CalendarPageClient({ role }: CalendarPageClientProps) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            retry: 1,
          },
        },
      }),
  );

  return (
    <QueryClientProvider client={queryClient}>
      <CalendarPageClientInner role={role} />
    </QueryClientProvider>
  );
}
