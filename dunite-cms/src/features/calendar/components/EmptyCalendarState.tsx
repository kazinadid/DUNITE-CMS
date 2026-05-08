import { ArrowRight, CalendarHeart, Sparkles } from 'lucide-react';
import Link from 'next/link';

import { Button } from '@/components/ui/button';

interface EmptyCalendarStateProps {
  /** Narrow range with no rows at all (not “filters hid everything”). */
  hasNoData: boolean;
  /** True when filters excluded every post in the loaded range. */
  filtersActive: boolean;
}

export function EmptyCalendarState({
  hasNoData,
  filtersActive,
}: EmptyCalendarStateProps) {
  return (
    <div className="relative isolate flex max-w-full flex-col items-center overflow-hidden rounded-2xl border border-dashed border-border/85 bg-gradient-to-br from-muted/55 via-card/90 to-muted/35 px-5 py-12 text-center shadow-inner sm:px-8 sm:py-14">
      <div
        className="pointer-events-none absolute -top-10 left-1/2 h-40 w-[120%] -translate-x-1/2 rounded-full bg-[radial-gradient(circle,rgba(122,0,0,0.12)_0%,transparent_68%)]"
        aria-hidden
      />
      <div className="relative mb-5 flex h-[4.75rem] w-[4.75rem] items-center justify-center rounded-2xl bg-gradient-to-br from-[#7A0000]/90 to-[#451010] p-[1px] shadow-[0_22px_50px_-28px_rgba(122,0,0,0.82)] ring-4 ring-[#7A0000]/10 ring-offset-4 ring-offset-background">
        <div className="flex h-full w-full items-center justify-center rounded-[0.875rem] bg-gradient-to-b from-white/14 to-transparent">
          <Sparkles className="absolute h-12 w-12 text-white/85 drop-shadow-md" aria-hidden />
          <CalendarHeart className="relative z-[1] h-[2.1rem] w-[2.1rem] text-white drop-shadow-lg" aria-hidden />
        </div>
      </div>

      <p className="relative text-[1.0625rem] font-semibold tracking-tight text-foreground">
        {filtersActive
          ? 'Nothing matches right now'
          : hasNoData
            ? 'Your planner is wide open'
            : 'Nothing to show'}
      </p>
      <p className="relative mt-2 max-w-md text-sm leading-relaxed text-muted-foreground">
        {filtersActive
          ? 'Loosen filters or widen the visible date range — your posts may be just outside this window.'
          : hasNoData
            ? 'Compose a post with a scheduled time — it lands here instantly so your team always sees what goes out next.'
            : 'Adjust filters or swipe to another week.'}
      </p>
      {!filtersActive && (
        <Button
          asChild
          size="sm"
          className="relative mt-7 rounded-full bg-[#7A0000] px-6 font-semibold text-primary-foreground shadow-[0_14px_40px_-20px_rgba(122,0,0,0.65)] ring-4 ring-[#7A0000]/10 hover:bg-[#5C0000]"
        >
          <Link href="/dashboard/posts/compose" className="gap-2 font-semibold tracking-tight">
            Create post
            <ArrowRight className="h-3.5 w-3.5 opacity-90" aria-hidden />
          </Link>
        </Button>
      )}
    </div>
  );
}
