'use client';

import { Trash2 } from 'lucide-react';

import { ConfirmDialog } from './ConfirmDialog';

interface DeleteDialogProps {
  open:           boolean;
  /** Short, human-readable label used inside the dialog body (e.g. post excerpt). */
  itemLabel?:     string;
  isPending?:     boolean;
  onOpenChange:   (open: boolean) => void;
  onConfirm:      () => void;
}

/**
 * Dedicated, reusable dialog for destructive deletions.  Wraps the generic
 * `ConfirmDialog` with delete-specific copy + iconography so call-sites stay
 * one-liners and the UX is consistent everywhere.
 */
export function DeleteDialog({
  open,
  itemLabel,
  isPending,
  onOpenChange,
  onConfirm,
}: DeleteDialogProps) {
  const description = itemLabel
    ? `“${truncate(itemLabel, 90)}” will be permanently removed, along with any attached media. This cannot be undone.`
    : 'This action cannot be undone. The post and any attached media will be permanently removed.';

  return (
    <ConfirmDialog
      open={open}
      onOpenChange={onOpenChange}
      onConfirm={onConfirm}
      title="Delete this post?"
      description={description}
      confirmLabel={isPending ? 'Deleting…' : 'Delete post'}
      cancelLabel="Cancel"
      destructive
      isPending={isPending}
      icon={Trash2}
    />
  );
}

function truncate(s: string, max: number) {
  const trimmed = s.replace(/\s+/g, ' ').trim();
  if (trimmed.length <= max) return trimmed;
  return `${trimmed.slice(0, max - 1)}…`;
}
