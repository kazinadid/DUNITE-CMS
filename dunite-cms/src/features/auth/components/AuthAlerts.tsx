'use client';

import { AlertCircle, CheckCircle2, Info } from 'lucide-react';

import { cn } from '@/lib/utils';

export function AuthErrorBanner({ message }: { message: string }) {
  return (
    <div
      role="alert"
      className={cn(
        'flex items-start gap-2.5 rounded-xl border border-red-200/90 bg-red-50 px-3.5 py-3 text-sm text-red-900',
        'dark:border-red-900/40 dark:bg-red-950/40 dark:text-red-100',
      )}
    >
      <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden />
      <span>{message}</span>
    </div>
  );
}

export function AuthSuccessBanner({ message }: { message: string }) {
  return (
    <div
      role="status"
      className="flex items-start gap-2.5 rounded-xl border border-emerald-200/90 bg-emerald-50 px-3.5 py-3 text-sm text-emerald-900"
    >
      <CheckCircle2 className="mt-0.5 size-4 shrink-0" aria-hidden />
      <span>{message}</span>
    </div>
  );
}

export function AuthInfoBanner({ message }: { message: string }) {
  return (
    <div
      role="status"
      className="flex items-start gap-2.5 rounded-xl border border-gray-200 bg-gray-50 px-3.5 py-3 text-sm text-gray-800"
    >
      <Info className="mt-0.5 size-4 shrink-0 text-gray-500" aria-hidden />
      <span>{message}</span>
    </div>
  );
}
