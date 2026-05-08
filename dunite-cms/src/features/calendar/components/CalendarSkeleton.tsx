import { cn } from '@/lib/utils';

export function CalendarSkeleton({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        'animate-pulse space-y-3 rounded-2xl border border-border/60 bg-card p-4 shadow-sm',
        className,
      )}
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="h-8 w-40 rounded-lg bg-muted" />
        <div className="flex gap-2">
          <div className="h-8 w-20 rounded-lg bg-muted" />
          <div className="h-8 w-20 rounded-lg bg-muted" />
          <div className="h-8 w-20 rounded-lg bg-muted" />
        </div>
      </div>
      <div className="h-9 w-full max-w-md rounded-lg bg-muted" />
      <div className="grid grid-cols-7 gap-2 pt-2">
        {Array.from({ length: 7 }).map((_, i) => (
          <div key={i} className="h-7 rounded-md bg-muted/80" />
        ))}
      </div>
      <div className="grid min-h-[320px] grid-cols-7 gap-2 md:min-h-[480px]">
        {Array.from({ length: 35 }).map((_, i) => (
          <div key={i} className="rounded-lg bg-muted/50" />
        ))}
      </div>
    </div>
  );
}
