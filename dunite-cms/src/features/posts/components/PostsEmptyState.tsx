import Link from 'next/link';
import { FilePlus2, Plus, SearchX } from 'lucide-react';

interface PostsEmptyStateProps {
  totalPosts: number;
  hasFilter:  boolean;
  canCreate:  boolean;
  /** Called when the user wants to clear search/status filters. */
  onClearFilters?: () => void;
}

/**
 * Reusable EmptyState for the posts feed. Visually distinguishes between
 * "no posts at all yet" vs. "filters yielded nothing", and only offers
 * the create CTA to roles that can actually create.
 */
export function PostsEmptyState({
  totalPosts,
  hasFilter,
  canCreate,
  onClearFilters,
}: PostsEmptyStateProps) {
  if (totalPosts > 0 && hasFilter) {
    return (
      <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-gray-200 bg-white px-6 py-16 text-center">
        <span className="flex h-12 w-12 items-center justify-center rounded-full bg-gray-100">
          <SearchX size={20} className="text-gray-400" aria-hidden />
        </span>
        <p className="mt-4 text-sm font-medium text-gray-900">
          No posts match your filters.
        </p>
        <p className="mt-1 text-sm text-gray-500">
          Try a different status or clear the search.
        </p>
        {onClearFilters && (
          <button
            type="button"
            onClick={onClearFilters}
            className="mt-4 inline-flex items-center rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 shadow-sm transition hover:bg-gray-50"
          >
            Clear filters
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-gray-200 bg-white px-6 py-20 text-center">
      <span className="flex h-12 w-12 items-center justify-center rounded-full bg-gray-100">
        <FilePlus2 size={20} className="text-gray-400" aria-hidden />
      </span>
      <p className="mt-4 text-sm font-medium text-gray-900">No posts yet.</p>
      {canCreate ? (
        <>
          <p className="mt-1 max-w-xs text-sm text-gray-500">
            Create your first post to start scheduling content for Dunite.
          </p>
          <Link
            href="/dashboard/posts/compose"
            className="mt-5 inline-flex items-center gap-2 rounded-lg bg-[#7A0000] px-4 py-2 text-sm font-medium text-white shadow-sm transition hover:bg-[#5A0000]"
          >
            <Plus size={14} aria-hidden />
            Create Post
          </Link>
        </>
      ) : (
        <p className="mt-1 max-w-xs text-sm text-gray-500">
          When content is published it&apos;ll appear here.
        </p>
      )}
    </div>
  );
}
