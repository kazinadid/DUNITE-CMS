'use client';

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

import type { Role } from '@/features/auth';
import { canRunBatchImport } from '@/lib/rbac';

import { ImportWorkflowBody } from './ImportWorkflowBody';

export interface BatchImportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  role: Role;
}

/**
 * Portal-hosted dialog (radix) for quick imports from other dashboard surfaces.
 */
export function BatchImportDialog({ open, onOpenChange, role }: BatchImportDialogProps) {
  if (!canRunBatchImport(role)) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        showCloseButton
        overlayClassName="z-[100] bg-black/40 backdrop-blur-sm"
        className="z-[101] flex max-h-[min(92vh,900px)] w-full max-w-5xl flex-col gap-0 overflow-hidden p-0 sm:max-w-5xl"
      >
        <DialogHeader className="shrink-0 border-b px-4 py-3 pr-12">
          <DialogTitle>Campaign import</DialogTitle>
          <DialogDescription>
            Parse a CSV or XLSX locally. Nothing is uploaded until you run a separate commit step.
          </DialogDescription>
        </DialogHeader>
        <div className="min-h-0 min-w-0 flex-1 overflow-x-hidden overflow-y-auto">
          <ImportWorkflowBody className="p-4" />
        </div>
      </DialogContent>
    </Dialog>
  );
}
