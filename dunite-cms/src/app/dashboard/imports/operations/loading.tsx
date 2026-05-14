export default function ImportOperationsLoading() {
  return (
    <div className="mx-auto max-w-[min(100vw-2rem,1360px)] space-y-4 px-4 py-8 md:px-6">
      <div className="h-10 w-64 animate-pulse rounded-lg bg-muted" />
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-24 animate-pulse rounded-xl bg-muted/70" />
        ))}
      </div>
      <div className="h-96 animate-pulse rounded-xl bg-muted/50" />
    </div>
  );
}
