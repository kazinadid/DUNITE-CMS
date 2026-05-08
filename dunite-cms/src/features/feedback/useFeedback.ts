'use client';

import { useCallback, useState } from 'react';
import { toast } from 'sonner';

import type { AppDialogState } from './AppDialog';

interface ToastOptions {
  title: string;
  description?: string;
}

interface DialogOptions {
  title: string;
  description: string;
}

const INITIAL_DIALOG: AppDialogState = {
  open: false,
  title: '',
  description: '',
};

export function useFeedback() {
  const [dialog, setDialog] = useState<AppDialogState>(INITIAL_DIALOG);

  const success = useCallback(({ title, description }: ToastOptions) => {
    toast.success(title, { description });
  }, []);

  const error = useCallback(({ title, description }: DialogOptions) => {
    setDialog({ open: true, title, description });
  }, []);

  const closeDialog = useCallback(() => {
    setDialog((prev) => ({ ...prev, open: false }));
  }, []);

  const setDialogOpen = useCallback((open: boolean) => {
    setDialog((prev) => ({ ...prev, open }));
  }, []);

  return {
    dialog,
    success,
    error,
    closeDialog,
    setDialogOpen,
  };
}
