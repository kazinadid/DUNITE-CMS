'use client';

import { Plus, RefreshCw } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useMemo, useState, useTransition } from 'react';

import type { Role } from '@/features/auth';
import { ReadOnlyBanner } from '@/features/dashboard';
import { AppDialog, AppToast, useFeedback } from '@/features/feedback';
import {
  DeleteDialog,
  PostCard,
  PostPreviewDialog,
  PostsEmptyState,
  PostsSkeleton,
  PostsToolbar,
  deletePost,
  duplicatePost,
  getPost,
  type Post,
  type PostCardAction,
  type StatusFilter,
} from '@/features/posts';
import {
  canCreatePost,
  canDeletePost,
  canEditPost,
  isAdmin,
} from '@/lib/rbac';
import { supabase } from '@/lib/supabaseClient';

interface PostsPageClientProps {
  initialPosts:   Post[];
  initialError:   string | null;
  currentUserId:  string;
  role:           Role;
}

type PendingMap = Record<string, 'delete' | 'duplicate' | undefined>;

export function PostsPageClient({
  initialPosts,
  initialError,
  currentUserId,
  role,
}: PostsPageClientProps) {
  const router = useRouter();
  const { dialog, success, error: showError, setDialogOpen } = useFeedback();

  // ── Feed state ────────────────────────────────────────────────────────────
  const [posts,         setPosts]         = useState<Post[]>(initialPosts);
  const [query,         setQuery]         = useState('');
  const [status,        setStatus]        = useState<StatusFilter>('all');
  const [pending,       setPending]       = useState<PendingMap>({});
  const [confirmDelete, setConfirmDelete] = useState<Post | null>(null);
  const [previewPost,   setPreviewPost]   = useState<Post | null>(null);
  const [isRefreshing,  startRefresh]     = useTransition();

  const canCreate    = canCreatePost(role);
  const canEditAny   = canEditPost(role);
  const canDeleteAny = canDeletePost(role);
  const adminUser    = isAdmin(role);

  // ── Initial load: surface SSR error via dialog (don't break page) ─────────
  useEffect(() => {
    if (initialError) {
      showError({
        title:       'Could not load posts',
        description: 'Please refresh the page. If the problem continues, check your connection or contact an admin.',
      });
      console.error('[posts] initial load error:', initialError);
    }
  }, [initialError, showError]);

  // ── Realtime — keep the feed live ─────────────────────────────────────────
  useEffect(() => {
    const channel = supabase
      .channel('posts-feed')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'posts' },
        async (payload) => {
          if (payload.eventType === 'DELETE') {
            const oldId = (payload.old as { id: string }).id;
            setPosts((prev) => prev.filter((p) => p.id !== oldId));
            return;
          }
          // INSERT / UPDATE — refetch with joins so author/platforms/media populate.
          const newId = (payload.new as { id: string }).id;
          try {
            const fresh = await getPost(newId);
            if (!fresh) return;
            setPosts((prev) => {
              const exists = prev.some((p) => p.id === fresh.id);
              return exists
                ? prev.map((p) => (p.id === fresh.id ? fresh : p))
                : [fresh, ...prev];
            });
          } catch {
            // RLS may hide the row from this user — ignore silently.
          }
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  // ── Permissions per-post ──────────────────────────────────────────────────
  // Editors can manage their own; admin can manage all; viewers can manage none.
  const canManagePost = useCallback(
    (p: Post): boolean => {
      if (!canEditAny && !canDeleteAny) return false;
      return adminUser || p.user_id === currentUserId;
    },
    [adminUser, canEditAny, canDeleteAny, currentUserId],
  );

  // ── Derived view ──────────────────────────────────────────────────────────
  const filtered = useMemo(() => {
    let xs = posts;
    if (status !== 'all') xs = xs.filter((p) => p.status === status);
    const q = query.trim().toLowerCase();
    if (q) {
      xs = xs.filter((p) => p.content.toLowerCase().includes(q));
    }
    return xs;
  }, [posts, query, status]);

  const counts: Partial<Record<StatusFilter, number>> = useMemo(
    () => ({
      all:        posts.length,
      draft:      posts.filter((p) => p.status === 'draft').length,
      scheduled:  posts.filter((p) => p.status === 'scheduled').length,
      publishing: posts.filter((p) => p.status === 'publishing').length,
      published:  posts.filter((p) => p.status === 'published').length,
      failed:     posts.filter((p) => p.status === 'failed').length,
    }),
    [posts],
  );

  // ── Mutations ─────────────────────────────────────────────────────────────
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

  const handleConfirmDelete = useCallback(async () => {
    if (!confirmDelete) return;
    const target = confirmDelete;
    markPending(target.id, 'delete');
    const previous = posts;
    // Optimistic remove
    setPosts((prev) => prev.filter((p) => p.id !== target.id));
    try {
      await deletePost(target.id);
      success({
        title: 'Post deleted',
        description: 'The post has been permanently removed.',
      });
      setConfirmDelete(null);
    } catch (err) {
      console.error('[posts] delete failed:', err);
      // Rollback
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

  // ── Single dispatcher fed to every PostCard (stable, memo-safe) ───────────
  const handleAction = useCallback(
    (action: PostCardAction, post: Post) => {
      switch (action) {
        case 'preview':   setPreviewPost(post); break;
        case 'edit':      router.push(`/dashboard/posts/${post.id}/edit`); break;
        case 'delete':    setConfirmDelete(post); break;
        case 'duplicate': void handleDuplicate(post); break;
      }
    },
    [router, handleDuplicate],
  );

  const handleClearFilters = useCallback(() => {
    setQuery('');
    setStatus('all');
  }, []);

  const handleRefresh = useCallback(() => {
    startRefresh(() => {
      router.refresh();
    });
  }, [router]);

  // ── Render ────────────────────────────────────────────────────────────────
  const hasFilter  = status !== 'all' || query.trim() !== '';
  const isDeleting = confirmDelete ? pending[confirmDelete.id] === 'delete' : false;

  return (
    <div className="p-4 md:p-6 space-y-6">
      {/* ─ Header ─────────────────────────────────────────────────────────── */}
      <header className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-gray-900">
            Posts
          </h1>
          <p className="text-sm text-gray-500">
            Browse, edit, and schedule everything across your social platforms.
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

      {/* ─ Toolbar ────────────────────────────────────────────────────────── */}
      <PostsToolbar
        query={query}
        status={status}
        onQueryChange={setQuery}
        onStatusChange={setStatus}
        counts={counts}
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

      {/* ─ Body ───────────────────────────────────────────────────────────── */}
      {isRefreshing && posts.length === 0 ? (
        <PostsSkeleton />
      ) : filtered.length === 0 ? (
        <PostsEmptyState
          totalPosts={posts.length}
          hasFilter={hasFilter}
          canCreate={canCreate}
          onClearFilters={hasFilter ? handleClearFilters : undefined}
        />
      ) : (
        <section
          aria-label="Posts feed"
          className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3"
        >
          {filtered.map((post) => {
            const manage = canManagePost(post);
            return (
              <PostCard
                key={post.id}
                post={post}
                pending={pending[post.id] ?? null}
                canEdit={manage && canEditAny}
                canDelete={manage && canDeleteAny}
                canDuplicate={manage && canCreate}
                canPreview
                onAction={handleAction}
              />
            );
          })}
        </section>
      )}

      {/* ─ Feedback layer ─────────────────────────────────────────────────── */}
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
      <PostPreviewDialog
        post={previewPost}
        open={previewPost !== null}
        onOpenChange={(open) => {
          if (!open) setPreviewPost(null);
        }}
      />
    </div>
  );
}
