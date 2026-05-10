export default function ImportsPageLoading() {
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-6 p-4 md:p-6">
      <div className="space-y-2">
        <div className="h-8 w-48 animate-pulse rounded-md bg-muted" />
        <div className="h-4 w-full max-w-xl animate-pulse rounded-md bg-muted/70" />
      </div>
      <div className="grid gap-6 lg:grid-cols-2">
        <div className="h-72 animate-pulse rounded-xl border bg-muted/30" />
        <div className="h-96 animate-pulse rounded-xl border bg-muted/30" />
      </div>
    </div>
  );
}
