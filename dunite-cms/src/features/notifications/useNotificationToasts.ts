'use client';

import { useEffect, useRef } from 'react';
import { toast } from 'sonner';

import { supabase } from '@/lib/supabaseClient';

import { mapNotificationRow } from './queries';
import type { NotificationRow, RawNotificationRow } from './types';
import { shouldToastNotificationType, toastVariantForType } from './notificationToastPolicy';

/**
 * Subscribes to new notification rows for the signed-in user and surfaces sonner toasts.
 * Scoped INSERT filter keeps payload small; RLS is the primary isolation gate.
 */
export function useNotificationToasts(userId: string | null | undefined) {
  const uid = userId ?? null;
  const seenRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (!uid) return;

    const channel = supabase
      .channel(`notifications-toast:${uid}`)
      .on(
        'postgres_changes',
        {
          event:          'INSERT',
          schema:         'public',
          table:          'notifications',
          filter:         `user_id=eq.${uid}`,
        },
        (payload) => {
          const raw = payload.new as RawNotificationRow;
          if (!raw?.id || seenRef.current.has(raw.id)) return;
          seenRef.current.add(raw.id);

          const n = mapNotificationRow(raw);
          if (!shouldToastNotificationType(n.type)) return;

          const variant = toastVariantForType(n.type);
          const fn =
            variant === 'success'
              ? toast.success
              : variant === 'error'
                ? toast.error
                : variant === 'warning'
                  ? toast.warning
                  : toast.info;

          fn(n.title, {
            description: n.message.slice(0, 280),
            duration:    variant === 'error' ? 8000 : 5000,
          });
        },
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [uid]);
}
