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
        overlayClassName="z-[100001] bg-black/40 backdrop-blur-sm"
        className="z-[100002] flex max-h-[min(94dvh,900px)] w-full max-w-[min(96vw,80rem)] flex-col gap-0 overflow-hidden p-0 sm:max-w-[min(96vw,80rem)]"
      >
        <DialogHeader className="shrink-0 border-b px-4 py-3 pr-12">
          <DialogTitle>Campaign import</DialogTitle>
          <DialogDescription>
            Parse a CSV or XLSX locally. Nothing is uploaded until you run a separate commit step.
          </DialogDescription>
        </DialogHeader>
        <div className="min-h-0 min-w-0 flex-1 overscroll-contain overflow-x-hidden overflow-y-auto">
          <ImportWorkflowBody className="p-3 sm:p-4" role={role} />
        </div>
      </DialogContent>
    </Dialog>
  );
}
