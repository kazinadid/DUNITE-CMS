interface PostsSkeletonProps {
  /** Number of skeleton cards to render. Default: 6. */
  count?: number;
}

/**
 * LoadingState for the posts feed. Renders animated card placeholders that
 * mirror the dimensions of `PostCard`, so layout doesn't jitter when real
 * data swaps in.
 */
export function PostsSkeleton({ count = 6 }: PostsSkeletonProps) {
  return (
    <section
      aria-busy="true"
      aria-label="Loading posts"
      className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3"
    >
      {Array.from({ length: count }).map((_, i) => (
        <SkeletonCard key={i} />
      ))}
    </section>
  );
}

function SkeletonCard() {
  return (
    <div className="flex flex-col gap-4 rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
      <div className="flex items-center justify-between">
        <div className="h-5 w-20 animate-pulse rounded-full bg-gray-100" />
        <div className="h-7 w-7 animate-pulse rounded-md bg-gray-100" />
      </div>
      <div className="aspect-[16/9] w-full animate-pulse rounded-lg bg-gray-100" />
      <div className="space-y-2">
        <div className="h-3 w-full animate-pulse rounded bg-gray-100" />
        <div className="h-3 w-5/6 animate-pulse rounded bg-gray-100" />
        <div className="h-3 w-3/4 animate-pulse rounded bg-gray-100" />
      </div>
      <div className="flex gap-1.5">
        <div className="h-5 w-16 animate-pulse rounded-md bg-gray-100" />
        <div className="h-5 w-16 animate-pulse rounded-md bg-gray-100" />
      </div>
      <div className="flex items-center justify-between border-t border-gray-100 pt-3">
        <div className="h-3 w-24 animate-pulse rounded bg-gray-100" />
        <div className="h-3 w-20 animate-pulse rounded bg-gray-100" />
      </div>
    </div>
  );
}
