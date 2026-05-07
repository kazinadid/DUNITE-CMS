import { type LucideIcon } from 'lucide-react';

import { Card, CardContent } from '@/components/ui/card';
import { cn } from '@/lib/utils';

interface StatCardProps {
  label: string;
  value: string | number;
  icon?: LucideIcon;
  hint?: string;
  tone?: 'default' | 'warning' | 'danger' | 'success';
  loading?: boolean;
}

const TONE_RING: Record<NonNullable<StatCardProps['tone']>, string> = {
  default: 'text-muted-foreground bg-muted',
  warning: 'text-amber-700 bg-amber-50',
  danger:  'text-red-700 bg-red-50',
  success: 'text-emerald-700 bg-emerald-50',
};

export function StatCard({
  label,
  value,
  icon: Icon,
  hint,
  tone = 'default',
  loading,
}: StatCardProps) {
  return (
    <Card className="rounded-xl shadow-sm ring-0 border border-border">
      <CardContent className="flex items-start gap-3 p-4">
        {Icon && (
          <div
            className={cn(
              'flex size-9 shrink-0 items-center justify-center rounded-lg',
              TONE_RING[tone],
            )}
          >
            <Icon className="size-4" aria-hidden />
          </div>
        )}
        <div className="flex min-w-0 flex-col gap-0.5">
          <span className="text-xs font-medium text-muted-foreground">
            {label}
          </span>
          {loading ? (
            <span className="mt-1 inline-block h-6 w-16 animate-pulse rounded bg-muted" />
          ) : (
            <span className="text-2xl font-semibold tracking-tight">
              {value}
            </span>
          )}
          {hint && (
            <span className="text-xs text-muted-foreground">{hint}</span>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
