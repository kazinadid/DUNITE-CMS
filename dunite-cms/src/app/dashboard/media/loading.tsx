export default function MediaPageLoading() {
  return (
    <div className="space-y-6 p-4 md:p-6">
      <div className="h-24 animate-pulse rounded-xl bg-muted" />
      <div className="h-36 animate-pulse rounded-2xl border border-dashed bg-muted/40" />
      <div className="h-20 animate-pulse rounded-xl bg-muted/60" />
      <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        {Array.from({ length: 8 }).map((_, i) => (
          <li key={i} className="overflow-hidden rounded-xl border bg-card">
            <div className="aspect-square animate-pulse bg-muted" />
            <div className="space-y-2 p-3">
              <div className="h-3 w-[75%] max-w-[180px] animate-pulse rounded bg-muted" />
              <div className="h-2 w-1/2 animate-pulse rounded bg-muted" />
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
