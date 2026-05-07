import { cn } from '@/lib/utils';
import type { Role } from '@/features/auth';

const STYLES: Record<Role, string> = {
  admin:  'bg-red-50 text-red-700 ring-red-600/20',
  editor: 'bg-blue-50 text-blue-700 ring-blue-600/20',
  viewer: 'bg-gray-100 text-gray-700 ring-gray-500/20',
};

const LABELS: Record<Role, string> = {
  admin: 'Admin',
  editor: 'Editor',
  viewer: 'Viewer',
};

export function RoleBadge({
  role,
  className,
}: {
  role: Role | null | undefined;
  className?: string;
}) {
  if (!role) return null;
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset',
        STYLES[role],
        className,
      )}
    >
      {LABELS[role]}
    </span>
  );
}
