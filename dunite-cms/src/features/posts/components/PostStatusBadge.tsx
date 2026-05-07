import type { PostStatus } from '../types';

const STYLES: Record<PostStatus, { ring: string; dot: string; label: string }> = {
  draft: {
    ring:  'bg-gray-100 text-gray-700 ring-gray-300/50',
    dot:   'bg-gray-400',
    label: 'Draft',
  },
  scheduled: {
    ring:  'bg-amber-50 text-amber-700 ring-amber-300/60',
    dot:   'bg-amber-500',
    label: 'Scheduled',
  },
  published: {
    ring:  'bg-emerald-50 text-emerald-700 ring-emerald-300/60',
    dot:   'bg-emerald-500',
    label: 'Published',
  },
};

export function PostStatusBadge({ status }: { status: PostStatus }) {
  const s = STYLES[status];
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${s.ring}`}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${s.dot}`} aria-hidden />
      {s.label}
    </span>
  );
}
