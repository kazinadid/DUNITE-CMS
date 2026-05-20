'use client';

import { Plus, RefreshCw } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useTransition,
} from 'react';

import type { Role } from '@/features/auth';
import { ReadOnlyBanner } from '@/features/dashboard';
import { AppDialog, AppToast, useFeedback } from '@/features/feedback';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  ConfirmDialog,
  DeleteDialog,
  PostCard,
  PostDetailModal,
  PostsAdvancedFilters,
  type PostsAdvancedFiltersState,
  PostsBulkToolbar,
  PostsEmptyState,
  PostsSkeleton,
  PostsToolbar,
  bulkDeletePosts,
  bulkMoveToDraft,
  bulkPublishNow,
  bulkSchedulePosts,
  deletePost,
  duplicatePost,
  listPostsPage,
  patchPostLifecycle,
  publishNow,
  resetToDraft,
  retryPublishingJob,
  type Post,
  type PostCardAction,
  type StatusFilter,
} from '@/features/posts';
import type { ListPostsPageParams } from '@/features/posts/services/postsService';
import { getPost } from '@/features/posts/services/postsService';
import { publishToFacebook } from '@/features/posts/lib/unifiedFacebookPublish';
import { UnifiedPublishConfirmDialog } from '@/features/posts/components/UnifiedPublishConfirmDialog';
import type { SocialAccount } from '@/features/integrations/types';
import {
  canCreatePost,
  canDeletePost,
  canEditPost,
  canPublishPost,
  isAdmin,
} from '@/lib/rbac';
import { isUtcScheduleTooSoon } from '@/lib/date';
import { supabase } from '@/lib/supabaseClient';

import {
  datetimeLocalInputToIso,
  isoToDatetimeLocalInput,
} from '@/features/calendar/lib/formatTime';

const PAGE_SIZE = 24;
const SCHEDULE_MIN_LEAD_MS = 5 * 60 * 1000;

interface PostsPageClientProps {
  initialPosts:  Post[];
  initialTotal:  number;
  initialError: string | null;
  currentUserId: string;
  role:           Role;
}

type PendingMap = Record<string, 'delete' | 'duplicate' | undefined>;

function toStartIso(dateInput: string): string | null {
  if (!dateInput.trim()) return null;
  const [y, mo, d] = dateInput.split('-').map(Number);
  if (!Number.isFinite(y) || !Number.isFinite(mo) || !Number.isFinite(d)) return null;
  return new Date(y, mo - 1, d, 0, 0, 0, 0).toISOString();
}

function toEndIso(dateInput: string): string | null {
  if (!dateInput.trim()) return null;
  const [y, mo, d] = dateInput.split('-').map(Number);
  if (!Number.isFinite(y) || !Number.isFinite(mo) || !Number.isFinite(d)) return null;
  return new Date(y, mo - 1, d, 23, 59, 59, 999).toISOString();
}

export function PostsPageClient({
  initialPosts,
  initialTotal,
  initialError,
  currentUserId,
  role,
}: PostsPageClientProps) {
  const router = useRouter();
  const { dialog, success, error: showError, setDialogOpen } = useFeedback();

  const [posts, setPosts] = useState<Post[]>(initialPosts);
  const [total, setTotal] = useState(initialTotal);

  const [query,          setQuery]          = useState('');
  const [status,          setStatus]          = useState<StatusFilter>('all');
  const [adv,            setAdv]            = useState<PostsAdvancedFiltersState>({
    platform:       'all',
    authorId:       'all',
    createdFrom:    '',
    createdTo:      '',
    scheduledFrom:  '',
    scheduledTo:    '',
    sort:           'newest',
  });

  const [page,           setPage]           = useState(1);
  const [pending,       setPending]       = useState<PendingMap>({});
  const [retryingJobId,   setRetryingJobId]  = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<Post | null>(null);
  const [detailPost,    setDetailPost]    = useState<Post | null>(null);
  const [fbConfirmPost,    setFbConfirmPost]    = useState<Post | null>(null);
  const [fbConfirmPending, setFbConfirmPending] = useState(false);
  const [isRefreshing,  startRefresh]     = useTransition();
  const [pageLoading,   setPageLoading]   = useState(false);

  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedIds,   setSelectedIds]   = useState<Set<string>>(new Set());

  type BulkConfirm = null | 'delete' | 'publish' | 'draft';
  const [bulkConfirm,   setBulkConfirm]   = useState<BulkConfirm>(null);
  const [bulkScheduling, setBulkScheduling] = useState(false);
  const [bulkScheduleInput, setBulkScheduleInput] = useState('');
  const [bulkScheduleMin, setBulkScheduleMin] = useState('');
  const [bulkBusy,      setBulkBusy]      = useState(false);

  const canCreate    = canCreatePost(role);
  const canEditAny   = canEditPost(role);
  const canDeleteAny = canDeletePost(role);
  const canPublish   = canPublishPost(role);
  const adminUser    = isAdmin(role);

  const canManagePost = useCallback(
    (p: Post): boolean => {
      if (!canEditAny && !canDeleteAny) return false;
      return adminUser || p.user_id === currentUserId;
    },
    [adminUser, canEditAny, canDeleteAny, currentUserId],
  );

  useEffect(() => {
    if (initialError) {
      showError({
        title:       'Could not load posts',
        description:
          'Please refresh the page. If the problem continues, check your connection or contact an admin.',
      });
      console.error('[posts] initial load error:', initialError);
    }
  }, [initialError, showError]);

  const listParams = useMemo(
    (): ListPostsPageParams => ({
      page,
      pageSize:      PAGE_SIZE,
      status,
      query,
      userId:        adv.authorId,
      platform:      adv.platform,
      createdFrom:   toStartIso(adv.createdFrom),
      createdTo:     toEndIso(adv.createdTo),
      scheduledFrom: toStartIso(adv.scheduledFrom),
      scheduledTo:   toEndIso(adv.scheduledTo),
      sort:          adv.sort,
    }),
    [page, status, query, adv],
  );

  const listParamsKey = JSON.stringify(listParams);
  const firstPageRef  = useRef(true);
  const prevKeyRef    = useRef<string | null>(null);

  const fetchPage = useCallback(
    async (opts?: { force?: boolean }) => {
      if (firstPageRef.current && !opts?.force) {
        firstPageRef.current = false;
        prevKeyRef.current = listParamsKey;
        return;
      }
      if (!opts?.force && prevKeyRef.current === listParamsKey) return;

      setPageLoading(true);
      try {
        const { posts: rows, total: t } = await listPostsPage(listParams);
        setPosts(rows);
        setTotal(t);
        prevKeyRef.current = listParamsKey;
      } catch (e: unknown) {
        console.error('[posts] paged fetch failed:', e);
        showError({
          title:       'Could not refresh posts',
          description: e instanceof Error ? e.message : 'Verify migrations are applied.',
        });
      } finally {
        setPageLoading(false);
      }
    },
    [listParams, listParamsKey, showError],
  );

  useEffect(() => {
    /* List fetch intentionally updates React state — keeps feed aligned with filters & pagination. */
    /* eslint-disable react-hooks/set-state-in-effect */
    void fetchPage();
    /* eslint-enable react-hooks/set-state-in-effect */
  }, [fetchPage]);

  const reloadDebouncedRef = useRef<number | null>(null);
  useEffect(() => {
    const channel = supabase
      .channel('posts-feed-managed')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'posts' },
        () => {
          if (reloadDebouncedRef.current) window.clearTimeout(reloadDebouncedRef.current);
          reloadDebouncedRef.current = window.setTimeout(() => {
            void fetchPage({ force: true });
          }, 400);
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
      if (reloadDebouncedRef.current) window.clearTimeout(reloadDebouncedRef.current);
    };
  }, [fetchPage]);

  const authorOptions = useMemo(() => {
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

  const markPending = useCallback(
    (id: string, kind: PendingMap[string]) =>
      setPending((prev) => {
        const next: PendingMap = { ...prev };
        if (kind) next[id] = kind;
        else delete next[id];
        return next;
      }),
    [],
  );

  const handleRetryPublishingJob = useCallback(
    async (jobId: string) => {
      setRetryingJobId(jobId);
      try {
        await retryPublishingJob(jobId);
        success({
          title:       'Retry queued',
          description: 'Platform delivery will be attempted again shortly.',
        });
        await fetchPage({ force: true });
      } catch (e: unknown) {
        showError({
          title:       'Could not retry',
          description: e instanceof Error ? e.message : 'Try again later.',
        });
      } finally {
        setRetryingJobId(null);
      }
    },
    [fetchPage, showError, success],
  );

  const handleConfirmDelete = useCallback(async () => {
    if (!confirmDelete) return;
    const target = confirmDelete;
    markPending(target.id, 'delete');
    const previous = posts;
    setPosts((prev) => prev.filter((p) => p.id !== target.id));
    setTotal((t) => Math.max(0, t - 1));
    try {
      await deletePost(target.id);
      success({
        title:       'Post deleted',
        description: 'The post has been permanently removed.',
      });
      setConfirmDelete(null);
    } catch (err) {
      console.error('[posts] delete failed:', err);
      setPosts(previous);
      showError({
        title:       'Could not delete post',
        description: 'Something went wrong while deleting. Please try again.',
      });
    } finally {
      markPending(target.id, undefined);
    }
  }, [confirmDelete, posts, markPending, success, showError]);

  const handleDuplicate = useCallback(
    async (post: Post) => {
      markPending(post.id, 'duplicate');
      try {
        const fresh = await duplicatePost(post);
        setPosts((prev) =>
          prev.some((p) => p.id === fresh.id) ? prev : [fresh, ...prev],
        );
        setTotal((t) => t + 1);
        success({
          title:       'Post duplicated',
          description: 'A draft copy is ready to edit.',
        });
      } catch (err) {
        console.error('[posts] duplicate failed:', err);
        showError({
          title:       'Could not duplicate post',
          description: 'Something went wrong while duplicating. Please try again.',
        });
      } finally {
        markPending(post.id, undefined);
      }
    },
    [markPending, success, showError],
  );

  const handlePublishOne = useCallback(
    async (post: Post) => {
      // When Facebook is one of the platforms, route through the unified
      // confirmation dialog so the operator picks a target Page first.
      if (post.platforms.includes('facebook')) {
        setFbConfirmPost(post);
        return;
      }
      try {
        const updated = await publishNow(post.id);
        setPosts((prev) => prev.map((p) => (p.id === updated.id ? updated : p)));
        success({
          title:       'Published',
          description: 'Post is live on all selected platforms.',
        });
      } catch (e: unknown) {
        showError({
          title:       'Publish failed',
          description: e instanceof Error ? e.message : 'Check permissions.',
        });
      }
    },
    [success, showError],
  );

  const handleFbConfirmPublish = useCallback(
    async (account: SocialAccount) => {
      const post = fbConfirmPost;
      if (!post) return;
      setFbConfirmPending(true);
      try {
        await publishToFacebook(post.id, account.id);
        // Re-fetch the updated row so the publishing→published transition
        // recorded by the server appears in the feed immediately.
        const updated = await getPost(post.id).catch(() => null);
        if (updated) {
          setPosts((prev) => prev.map((p) => (p.id === updated.id ? updated : p)));
        }
        success({
          title:       'Published to Facebook',
          description: 'This post is live on Facebook.',
        });
        setFbConfirmPost(null);
      } catch (e: unknown) {
        showError({
          title:       'Publish failed',
          description:
            e instanceof Error ? e.message : 'Could not publish to Facebook.',
        });
      } finally {
        setFbConfirmPending(false);
      }
    },
    [fbConfirmPost, success, showError],
  );

  const handleMoveDraftOne = useCallback(
    async (post: Post) => {
      try {
        const updated =
          post.status === 'failed'
            ? await resetToDraft(post.id)
            : await patchPostLifecycle(post.id, {
                status:       'draft',
                scheduled_at: null,
                published_at: null,
              });
        setPosts((prev) => prev.map((p) => (p.id === updated.id ? updated : p)));
        success({ title: 'Moved to draft', description: 'You can revise and reschedule.' });
      } catch (e: unknown) {
        showError({
          title:       'Could not update',
          description: e instanceof Error ? e.message : 'Try again.',
        });
      }
    },
    [success, showError],
  );

  const handleAction = useCallback(
    (action: PostCardAction, post: Post) => {
      switch (action) {
        case 'open':
        case 'schedule':
          setDetailPost(post);
          break;
        case 'edit':
          router.push(`/dashboard/posts/${post.id}/edit`);
          break;
        case 'delete':
          setConfirmDelete(post);
          break;
        case 'duplicate':
          void handleDuplicate(post);
          break;
        case 'publishNow':
          void handlePublishOne(post);
          break;
        case 'moveDraft':
          void handleMoveDraftOne(post);
          break;
      }
    },
    [router, handleDuplicate, handlePublishOne, handleMoveDraftOne],
  );

  const handleClearFilters = useCallback(() => {
    setQuery('');
    setStatus('all');
    setAdv({
      platform:       'all',
      authorId:       'all',
      createdFrom:    '',
      createdTo:      '',
      scheduledFrom:  '',
      scheduledTo:    '',
      sort:           'newest',
    });
    setPage(1);
  }, []);

  const handleRefresh = useCallback(() => {
    startRefresh(() => {
      void fetchPage({ force: true });
      router.refresh();
    });
  }, [router, fetchPage]);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const toggleSelected = useCallback((id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const selectedPosts = useMemo(
    () => posts.filter((p) => selectedIds.has(p.id)),
    [posts, selectedIds],
  );

  const bulkHasPublished = selectedPosts.some((p) => p.status === 'published');
  const canBulkManageSel = selectedPosts.every((p) => canManagePost(p));

  const runBulkDelete = async () => {
    setBulkBusy(true);
    try {
      await bulkDeletePosts(selectedPosts.map((p) => p.id));
      success({ title: 'Deleted', description: `${selectedPosts.length} post(s) removed.` });
      setSelectedIds(new Set());
      setBulkConfirm(null);
      await fetchPage({ force: true });
    } catch (e: unknown) {
      showError({
        title:       'Bulk delete failed',
        description: e instanceof Error ? e.message : 'Try again.',
      });
    } finally {
      setBulkBusy(false);
    }
  };

  const runBulkPublish = async () => {
    setBulkBusy(true);
    try {
      await bulkPublishNow(selectedPosts.map((p) => p.id));
      success({
        title:       'Bulk publish queued',
        description: `${selectedPosts.length} post(s) set to published.`,
      });
      setSelectedIds(new Set());
      setBulkConfirm(null);
      await fetchPage({ force: true });
    } catch (e: unknown) {
      showError({
        title:       'Bulk publish failed',
        description: e instanceof Error ? e.message : 'Verify admin permission.',
      });
    } finally {
      setBulkBusy(false);
    }
  };

  const runBulkDraft = async () => {
    setBulkBusy(true);
    try {
      await bulkMoveToDraft(selectedPosts.map((p) => p.id));
      success({
        title:       'Moved to drafts',
        description: `${selectedPosts.length} post(s).`,
      });
      setSelectedIds(new Set());
      setBulkConfirm(null);
      await fetchPage({ force: true });
    } catch (e: unknown) {
      showError({
        title:       'Bulk update failed',
        description: e instanceof Error ? e.message : 'Try again.',
      });
    } finally {
      setBulkBusy(false);
    }
  };

  const openBulkSchedule = () => {
    const minIso = new Date(Date.now() + SCHEDULE_MIN_LEAD_MS).toISOString();
    setBulkScheduleMin(isoToDatetimeLocalInput(minIso));
    setBulkScheduleInput(
      isoToDatetimeLocalInput(minIso),
    );
    setBulkScheduling(true);
  };

  const runBulkSchedule = async () => {
    const iso = datetimeLocalInputToIso(bulkScheduleInput);
    if (!iso) {
      showError({
        title:       'Pick a valid time',
        description: 'Choose a valid local date and time.',
      });
      return;
    }
    if (isUtcScheduleTooSoon(iso, SCHEDULE_MIN_LEAD_MS)) {
      showError({
        title:       'Pick a later time',
        description: `At least ${SCHEDULE_MIN_LEAD_MS / 60000} minutes ahead.`,
      });
      return;
    }
    setBulkBusy(true);
    try {
      await bulkSchedulePosts(
        selectedPosts.map((p) => p.id),
        iso,
      );
      success({
        title:       'Scheduled',
        description: `${selectedPosts.length} post(s) queued.`,
      });
      setBulkScheduling(false);
      setSelectedIds(new Set());
      await fetchPage({ force: true });
    } catch (e: unknown) {
      showError({
        title:       'Bulk schedule failed',
        description: e instanceof Error ? e.message : 'Try again.',
      });
    } finally {
      setBulkBusy(false);
    }
  };

  const hasFilter =
    status !== 'all' ||
    query.trim() !== '' ||
    adv.platform !== 'all' ||
    adv.authorId !== 'all' ||
    Boolean(adv.createdFrom || adv.createdTo || adv.scheduledFrom || adv.scheduledTo);

  const isDeleting = confirmDelete ? pending[confirmDelete.id] === 'delete' : false;

  return (
    <div className="space-y-6 p-4 md:p-6">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-gray-900">
            Posts
          </h1>
          <p className="text-sm text-gray-500">
            Browse, collaborate, and ship content across every connected channel — built for ops at scale.
          </p>
        </div>

        {canCreate && (
          <Link
            href="/dashboard/posts/compose"
            className="inline-flex h-9 items-center justify-center gap-2 rounded-lg bg-[#7A0000] px-4 text-sm font-medium text-white shadow-sm transition hover:bg-[#5A0000]"
          >
            <Plus size={14} aria-hidden />
            Create Post
          </Link>
        )}
      </header>

      {!canCreate && <ReadOnlyBanner />}

      <PostsToolbar
        query={query}
        status={status}
        onQueryChange={(q) => {
          setQuery(q);
          setPage(1);
        }}
        onStatusChange={(s) => {
          setStatus(s);
          setPage(1);
        }}
        trailing={
          <button
            type="button"
            onClick={handleRefresh}
            disabled={isRefreshing}
            aria-label="Refresh posts"
            className="inline-flex h-9 items-center justify-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 text-sm font-medium text-gray-700 shadow-sm transition hover:bg-gray-50 disabled:opacity-60"
          >
            <RefreshCw
              size={14}
              className={isRefreshing ? 'animate-spin' : ''}
              aria-hidden
            />
            <span className="hidden sm:inline">Refresh</span>
          </button>
        }
      />

      <PostsAdvancedFilters
        value={adv}
        onChange={(next) => {
          setAdv(next);
          setPage(1);
        }}
        authorOptions={authorOptions}
        showAuthorFilter={adminUser}
      />

      <PostsBulkToolbar
        selectedCount={selectedIds.size}
        selectionMode={selectionMode}
        onToggleMode={() => {
          setSelectionMode((v) => !v);
          setSelectedIds(new Set());
        }}
        busy={bulkBusy}
        canManageBulk={canEditAny && canBulkManageSel && selectedPosts.length > 0}
        canBulkPublish={
          canPublish && canBulkManageSel && selectedPosts.length > 0 && !bulkHasPublished
        }
        onSelectAllPage={() =>
          setSelectedIds(new Set(posts.map((p) => p.id)))
        }
        onClearSelection={() => setSelectedIds(new Set())}
        onBulkDelete={() =>
          bulkHasPublished
            ? showError({
                title:       'Includes published posts',
                description:
                  'Unpublish individually first—bulk delete skips live content safety.',
              })
            : setBulkConfirm('delete')
        }
        onBulkDraft={() =>
          bulkHasPublished
            ? showError({
                title:       'Includes published posts',
                description:
                  'Move published items individually—you cannot bulk-draft live posts.',
              })
            : setBulkConfirm('draft')
        }
        onBulkPublish={() => setBulkConfirm('publish')}
        onBulkSchedule={openBulkSchedule}
      />

{pageLoading && posts.length === 0 ? (
        <PostsSkeleton />
      ) : posts.length === 0 ? (
        <PostsEmptyState
          totalPosts={total}
          hasFilter={hasFilter}
          canCreate={canCreate}
          onClearFilters={hasFilter ? handleClearFilters : undefined}
        />
      ) : (
        <>
          <section
            aria-label="Posts feed"
            className="grid grid-cols-1 gap-5 sm:grid-cols-2 xl:grid-cols-3"
          >
            {posts.map((post) => {
              const manage = canManagePost(post);
              return (
                <PostCard
                  key={post.id}
                  post={post}
                  pending={pending[post.id] ?? null}
                  canEdit={manage && canEditAny}
                  canDelete={manage && canDeleteAny}
                  canDuplicate={manage && canCreate}
                  canPublish={manage && canPublish}
                  canPreview
                  selectable={selectionMode}
                  selected={selectedIds.has(post.id)}
                  onSelectToggle={() => toggleSelected(post.id)}
                  onRetryPublishingJob={manage && canEditAny ? handleRetryPublishingJob : undefined}
                  retryingJobId={retryingJobId}
                  onAction={handleAction}
                />
              );
            })}
          </section>

          <div className="flex flex-col gap-3 border-t border-gray-100 pt-4 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-xs text-gray-500">
              Showing{' '}
              <span className="font-semibold text-gray-800">
                {posts.length}
              </span>{' '}
              of{' '}
              <span className="font-semibold text-gray-800">{total}</span> matching posts
              {totalPages > 1 && (
                <>
                  {' '}
                  · page{' '}
                  <span className="font-semibold text-gray-800">{page}</span>/{totalPages}
                </>
              )}
            </p>
            <div className="flex gap-2">
              <button
                type="button"
                disabled={page <= 1 || pageLoading}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                className="h-9 rounded-lg border border-gray-200 bg-white px-3 text-xs font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-40"
              >
                Previous
              </button>
              <button
                type="button"
                disabled={page >= totalPages || pageLoading}
                onClick={() => setPage((p) => p + 1)}
                className="h-9 rounded-lg border border-gray-200 bg-white px-3 text-xs font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-40"
              >
                Next
              </button>
            </div>
          </div>
        </>
      )}

      <AppToast />
      <AppDialog state={dialog} onOpenChange={setDialogOpen} />
      <DeleteDialog
        open={confirmDelete !== null}
        itemLabel={confirmDelete?.content || undefined}
        isPending={isDeleting}
        onOpenChange={(open) => {
          if (!open && !isDeleting) setConfirmDelete(null);
        }}
        onConfirm={handleConfirmDelete}
      />

      {detailPost ? (
        <PostDetailModal
          key={detailPost.id}
          role={role}
          post={detailPost}
          onClose={() => setDetailPost(null)}
          onPostUpdated={(p) => {
            setPosts((prev) => prev.map((row) => (row.id === p.id ? p : row)));
            setDetailPost((d) => (d?.id === p.id ? p : d));
          }}
          onPostRemoved={(id) => {
            setPosts((prev) => prev.filter((p) => p.id !== id));
            setDetailPost(null);
            setTotal((t) => Math.max(0, t - 1));
          }}
        />
      ) : null}

      <UnifiedPublishConfirmDialog
        open={fbConfirmPost !== null}
        mode="publish"
        contentPreview={fbConfirmPost?.content ?? ''}
        scheduledFor={null}
        initialAccountId={fbConfirmPost?.social_account_id ?? null}
        pending={fbConfirmPending}
        onCancel={() => {
          if (fbConfirmPending) return;
          setFbConfirmPost(null);
        }}
        onConfirm={handleFbConfirmPublish}
      />

      <ConfirmDialog
        open={bulkConfirm === 'delete'}
        onOpenChange={(o) => !o && setBulkConfirm(null)}
        onConfirm={() => void runBulkDelete()}
        title="Delete selected posts?"
        description={`Permanently remove ${selectedPosts.length} post(s) and attached media.`}
        confirmLabel={bulkBusy ? 'Deleting…' : 'Delete all'}
        destructive
        isPending={bulkBusy}
      />
      <ConfirmDialog
        open={bulkConfirm === 'publish'}
        onOpenChange={(o) => !o && setBulkConfirm(null)}
        onConfirm={() => void runBulkPublish()}
        title="Publish selected posts now?"
        description={`Immediately publish ${selectedPosts.length} post(s).`}
        confirmLabel={bulkBusy ? 'Publishing…' : 'Publish'}
        destructive={false}
        isPending={bulkBusy}
      />
      <ConfirmDialog
        open={bulkConfirm === 'draft'}
        onOpenChange={(o) => !o && setBulkConfirm(null)}
        onConfirm={() => void runBulkDraft()}
        title="Move selected posts to draft?"
        description={`Clears schedules for ${selectedPosts.length} non-published item(s).`}
        confirmLabel={bulkBusy ? 'Updating…' : 'Move to draft'}
        isPending={bulkBusy}
      />

      <Dialog
        open={bulkScheduling}
        onOpenChange={(o) => !bulkBusy && setBulkScheduling(o)}
      >
        <DialogContent className="gap-0 rounded-2xl border border-gray-200 p-0 sm:max-w-md">
          <DialogHeader className="border-b border-gray-100 px-5 py-4 text-left">
            <DialogTitle>Bulk schedule</DialogTitle>
            <DialogDescription className="text-sm text-gray-500">
              Applies the same time to {selectedPosts.length} post(s). Respect the
              usual lead-time buffer.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 px-5 py-4">
            <input
              type="datetime-local"
              aria-label="Schedule time"
              value={bulkScheduleInput}
              min={bulkScheduleMin || undefined}
              className="h-10 w-full rounded-lg border border-gray-200 px-3 text-sm outline-none focus:border-gray-400 focus:ring-2 focus:ring-gray-100"
              onChange={(e) => setBulkScheduleInput(e.target.value)}
            />
          </div>
          <DialogFooter className="gap-2 border-t border-gray-100 bg-gray-50/80 px-5 py-4 sm:justify-end">
            <Button
              type="button"
              variant="outline"
              disabled={bulkBusy}
              onClick={() => setBulkScheduling(false)}
            >
              Cancel
            </Button>
            <Button type="button" disabled={bulkBusy} onClick={() => void runBulkSchedule()}>
              Schedule all
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
