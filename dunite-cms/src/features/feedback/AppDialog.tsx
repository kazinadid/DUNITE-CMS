'use client';

import { AlertTriangle, CheckCircle2 } from 'lucide-react';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

export interface AppDialogState {
  open: boolean;
  title: string;
  description: string;
  variant?: 'error' | 'success';
}

interface AppDialogProps {
  state: AppDialogState;
  onOpenChange: (open: boolean) => void;
}

export function AppDialog({ state, onOpenChange }: AppDialogProps) {
  const isSuccess = state.variant === 'success';
  const Icon = isSuccess ? CheckCircle2 : AlertTriangle;
  const iconClasses = isSuccess
    ? 'bg-emerald-50 text-emerald-600 ring-emerald-100'
    : 'bg-red-50 text-red-600 ring-red-100';

  return (
    <Dialog open={state.open} onOpenChange={onOpenChange}>
      <DialogContent
        showCloseButton={false}
        overlayClassName="z-[100001] bg-black/30 backdrop-blur-sm"
        className="z-[100002] max-h-[min(92dvh,38rem)] max-w-[calc(100%-2rem)] gap-0 overflow-hidden rounded-2xl border border-gray-200 bg-white p-0 text-gray-900 shadow-2xl shadow-black/25 sm:max-w-md"
      >
        <div className="min-h-0 overflow-y-auto p-6">
          <DialogHeader className="items-center text-center">
            <span className={`mb-2 flex h-12 w-12 items-center justify-center rounded-full ring-1 ${iconClasses}`}>
              <Icon size={22} aria-hidden />
            </span>
            <DialogTitle className="text-lg font-semibold tracking-tight text-gray-950">
              {state.title}
            </DialogTitle>
            <DialogDescription className="max-w-sm whitespace-pre-wrap break-words text-sm leading-6 text-gray-500">
              {state.description}
            </DialogDescription>
          </DialogHeader>
        </div>

        <DialogFooter className="border-t border-gray-100 bg-gray-50/80 px-6 py-4">
          <Button
            type="button"
            onClick={() => onOpenChange(false)}
            className="h-10 w-full rounded-xl bg-gray-900 text-white hover:bg-gray-800 sm:w-auto sm:min-w-24"
          >
            OK
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
