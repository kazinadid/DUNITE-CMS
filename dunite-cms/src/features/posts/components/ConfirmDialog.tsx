'use client';

import { AlertTriangle, Loader2, type LucideIcon } from 'lucide-react';

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

interface ConfirmDialogProps {
  open:           boolean;
  onOpenChange:   (open: boolean) => void;
  onConfirm:      () => void;
  title:          string;
  description:    string;
  confirmLabel?:  string;
  cancelLabel?:   string;
  /** Show the destructive (red) treatment. */
  destructive?:   boolean;
  /** When true the confirm button shows a spinner and the dialog can't be dismissed. */
  isPending?:     boolean;
  icon?:          LucideIcon;
}

/**
 * Production-grade confirmation dialog. Centered, dark-backdrop, ESC + outside
 * click to dismiss, keyboard accessible. Use for destructive or otherwise
 * irreversible actions (delete, force-publish, etc.).
 */
export function ConfirmDialog({
  open,
  onOpenChange,
  onConfirm,
  title,
  description,
  confirmLabel = 'Confirm',
  cancelLabel  = 'Cancel',
  destructive  = false,
  isPending    = false,
  icon: Icon   = AlertTriangle,
}: ConfirmDialogProps) {
  const tone = destructive
    ? { ringIcon: 'bg-red-50 text-red-600 ring-red-100', confirmBtn: 'bg-red-600 hover:bg-red-700 text-white' }
    : { ringIcon: 'bg-gray-100 text-gray-700 ring-gray-200', confirmBtn: 'bg-gray-900 hover:bg-gray-800 text-white' };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (isPending && !next) return; // lock during pending action
        onOpenChange(next);
      }}
    >
      <DialogContent
        showCloseButton={false}
        className="max-w-[calc(100%-2rem)] gap-0 overflow-hidden rounded-2xl border border-gray-200 bg-white p-0 text-gray-900 shadow-2xl shadow-black/25 sm:max-w-md"
      >
        <div className="p-6">
          <DialogHeader className="items-center text-center">
            <span
              aria-hidden
              className={`mb-2 flex h-12 w-12 items-center justify-center rounded-full ring-1 ${tone.ringIcon}`}
            >
              <Icon size={22} />
            </span>
            <DialogTitle className="text-lg font-semibold tracking-tight text-gray-950">
              {title}
            </DialogTitle>
            <DialogDescription className="max-w-sm text-sm leading-6 text-gray-500">
              {description}
            </DialogDescription>
          </DialogHeader>
        </div>

        <DialogFooter className="flex-col-reverse gap-2 border-t border-gray-100 bg-gray-50/80 px-6 py-4 sm:flex-row sm:justify-end">
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            disabled={isPending}
            className="h-10 w-full rounded-xl border border-gray-200 bg-white px-4 text-sm font-medium text-gray-700 transition hover:bg-gray-50 disabled:opacity-60 sm:w-auto sm:min-w-24"
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={isPending}
            className={`inline-flex h-10 w-full items-center justify-center gap-2 rounded-xl px-4 text-sm font-medium transition disabled:opacity-70 sm:w-auto sm:min-w-32 ${tone.confirmBtn}`}
          >
            {isPending && <Loader2 size={14} className="animate-spin" aria-hidden />}
            {confirmLabel}
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
