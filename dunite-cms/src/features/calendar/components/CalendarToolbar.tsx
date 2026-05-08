'use client';

import { RefreshCw } from 'lucide-react';
import type { ReactNode } from 'react';

import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

interface CalendarToolbarProps {
  title:        string;
  description?: string;
  onRefresh?:   () => void;
  refreshing?:  boolean;
  className?:   string;
  /** Extra controls rendered beside refresh. */
  trailing?:    ReactNode;
}

export function CalendarToolbar({
  title,
  description,
  onRefresh,
  refreshing,
  className,
  trailing,
}: CalendarToolbarProps) {
  return (
    <div
      className={cn(
        'flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between',
        className,
      )}
    >
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">{title}</h1>
        {description && (
          <p className="text-sm text-muted-foreground">{description}</p>
        )}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {trailing}
        {onRefresh && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={refreshing}
            onClick={() => onRefresh()}
            className="border-border shadow-xs"
          >
            <RefreshCw
              className={cn('h-4 w-4', refreshing && 'animate-spin')}
              aria-hidden
            />
            Refresh
          </Button>
        )}
      </div>
    </div>
  );
}
