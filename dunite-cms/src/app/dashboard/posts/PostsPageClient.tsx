'use client';

import { FilePlus2, Plus } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';

import type { Role } from '@/features/auth';
import { ReadOnlyBanner } from '@/features/dashboard';
import {
  PostCard,
  PostFilters,
  deletePost,
  duplicatePost,
  getPost,
  publishNow,
  type Post,
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

export function PostsPageClient({
  initialPosts,
  initialError,
  currentUserId,
  role,
}: PostsPageClientProps) {
  const router = useRouter();

  const [posts,   setPosts]        = useState<Post[]>(initialPosts);
  const [query,   setQuery]        = useState('');
  const [status,  setStatus]       = useState<StatusFilter>('all');
  const [error,   setError]        = useState<string | null>(initialError);

  const canCreate  = canCreatePost(role);
  const canEditAny = canEditPost(role);
  const canDelAny  = canDeletePost(role);
  const adminUser  = isAdmin(role);

  // Caller can manage post P if they're admin or own the post AND have the
  // generic permission.
  function canManagePost(p: Post) {
    if (!canEditAny && !canDelAny) return false;
    return adminUser || p.user_id === currentUserId;
  }

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
          // INSERT or UPDATE — refetch with joins so author/platforms are populated
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
            // RLS may hide the row from this user — ignore silently
          }
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  // ── Derived view ──────────────────────────────────────────────────────────
  const filtered = useMemo(() => {
    let xs = posts;
    if (status !== 'all') xs = xs.filter((p) => p.status === status);
    const q = query.trim().toLowerCase();
    if (q) {
      xs = xs.filter(
        (p) =>
          p.content.toLowerCase().includes(q) ||
          (p.author?.name ?? '').toLowerCase().includes(q) ||
          (p.author?.email ?? '').toLowerCase().includes(q),
      );
    }
    return xs;
  }, [posts, query, status]);

  const counts = useMemo(
    () => ({
      all:       posts.length,
      published: posts.filter((p) => p.status === 'published').length,
      scheduled: posts.filter((p) => p.status === 'scheduled').length,
      draft:     posts.filter((p) => p.status === 'draft').length,
    }),
    [posts],
  );

  // ── Actions (optimistic with rollback) ────────────────────────────────────

  async function handleDelete(post: Post) {
    if (typeof window !== 'undefined') {
      const ok = window.confirm('Delete this post? This cannot be undone.');
      if (!ok) return;
    }
    const previous = posts;
    setPosts((prev) => prev.filter((p) => p.id !== post.id));
    try {
      await deletePost(post.id);
    } catch (err) {
      console.error('[posts] delete failed:', err);
      setPosts(previous);
      setError(err instanceof Error ? err.message : 'Failed to delete post.');
    }
  }

  async function handlePublishNow(post: Post) {
    const previous = posts;
    const optimistic: Post = { ...post, status: 'published', scheduled_at: null };
    setPosts((prev) => prev.map((p) => (p.id === post.id ? optimistic : p)));
    try {
      const fresh = await publishNow(post.id);
      setPosts((prev) => prev.map((p) => (p.id === fresh.id ? fresh : p)));
    } catch (err) {
      console.error('[posts] publishNow failed:', err);
      setPosts(previous);
      setError(err instanceof Error ? err.message : 'Failed to publish post.');
    }
  }

  async function handleDuplicate(post: Post) {
    try {
      const fresh = await duplicatePost(post);
      setPosts((prev) =>
        prev.some((p) => p.id === fresh.id) ? prev : [fresh, ...prev],
      );
    } catch (err) {
      console.error('[posts] duplicate failed:', err);
      setError(err instanceof Error ? err.message : 'Failed to duplicate post.');
    }
  }

  function handleEdit(post: Post) {
    router.push(`/dashboard/posts/${post.id}/edit`);
  }

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="p-4 md:p-6 space-y-6">
      {/* Header */}
      <header className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-gray-900">
            Posts
          </h1>
          <p className="text-sm text-gray-500">
            All your content in one place.
          </p>
        </div>

        {canCreate && (
          <Link
            href="/dashboard/posts/compose"
            className="inline-flex items-center justify-center gap-2 rounded-lg bg-[#7A0000] px-4 py-2 text-sm font-medium text-white shadow-sm transition hover:bg-[#5A0000]"
          >
            <Plus size={14} aria-hidden />
            Create Post
          </Link>
        )}
      </header>

      {!canCreate && <ReadOnlyBanner />}

      {/* Error banner */}
      {error && (
        <div
          role="alert"
          className="flex items-center justify-between gap-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700"
        >
          <span>{error}</span>
          <button
            type="button"
            onClick={() => setError(null)}
            className="text-xs font-medium text-red-600 hover:underline"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Filters */}
      <PostFilters
        query={query}
        status={status}
        onQueryChange={setQuery}
        onStatusChange={setStatus}
        counts={counts}
      />

      {/* Feed */}
      {filtered.length === 0 ? (
        <EmptyState
          totalPosts={posts.length}
          hasFilter={status !== 'all' || query.trim() !== ''}
          canCreate={canCreate}
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
                canManage={manage}
                onEdit={manage && canEditAny ? () => handleEdit(post) : undefined}
                onDelete={manage && canDelAny ? () => handleDelete(post) : undefined}
                onDuplicate={manage && canCreate ? () => handleDuplicate(post) : undefined}
                onPublishNow={
                  manage && canEditAny && post.status !== 'published'
                    ? () => handlePublishNow(post)
                    : undefined
                }
              />
            );
          })}
        </section>
      )}
    </div>
  );
}

// ── Empty state ─────────────────────────────────────────────────────────────

function EmptyState({
  totalPosts,
  hasFilter,
  canCreate,
}: {
  totalPosts: number;
  hasFilter:  boolean;
  canCreate:  boolean;
}) {
  if (totalPosts > 0 && hasFilter) {
    return (
      <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-gray-200 bg-white py-16 text-center">
        <p className="text-sm font-medium text-gray-900">No posts match your filters.</p>
        <p className="mt-1 text-sm text-gray-500">Try clearing the search or status.</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-gray-200 bg-white py-16 text-center">
      <span className="flex h-12 w-12 items-center justify-center rounded-full bg-gray-100">
        <FilePlus2 size={20} className="text-gray-400" aria-hidden />
      </span>
      <p className="mt-4 text-sm font-medium text-gray-900">No posts yet.</p>
      {canCreate ? (
        <>
          <p className="mt-1 text-sm text-gray-500">
            Create your first post to get started.
          </p>
          <Link
            href="/dashboard/posts/compose"
            className="mt-4 inline-flex items-center gap-2 rounded-lg bg-[#7A0000] px-4 py-2 text-sm font-medium text-white shadow-sm transition hover:bg-[#5A0000]"
          >
            <Plus size={14} aria-hidden />
            Create Post
          </Link>
        </>
      ) : (
        <p className="mt-1 text-sm text-gray-500">
          When content is published it&apos;ll appear here.
        </p>
      )}
    </div>
  );
}
