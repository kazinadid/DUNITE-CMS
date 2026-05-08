'use client';

import { Loader2 } from 'lucide-react';
import { useEffect, useState } from 'react';

import { listActivityForPost } from '../activityService';
import type { ActivityLog } from '../types';
import { ActivityTimeline } from './ActivityTimeline';

interface PostAuditSectionProps {
  postId: string;
}

export function PostAuditSection({ postId }: PostAuditSectionProps) {
  const [rows, setRows] = useState<ActivityLog[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const data = await listActivityForPost(postId);
        if (!cancelled) setRows(data);
      } catch {
        if (!cancelled) setRows([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [postId]);

  if (rows === null) {
    return (
      <div className="flex items-center gap-2 rounded-xl border border-gray-100 bg-gray-50/50 px-4 py-6 text-sm text-gray-500">
        <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
        Loading activity…
      </div>
    );
  }

  return <ActivityTimeline entries={rows} compact className="max-h-80 overflow-y-auto pr-1" />;
}
