import {
  BarChart3,
  Bell,
  Calendar,
  ClipboardList,
  History,
  Image as ImageIcon,
  LayoutDashboard,
  Link as LinkIcon,
  Settings,
  FileText,
  Users,
  Upload,
  type LucideIcon,
} from 'lucide-react';

import type { Role } from '@/features/auth';

export interface NavItem {
  label: string;
  href: string;
  icon: LucideIcon;
  /** If omitted, item is visible to every role. */
  roles?: Role[];
}

export const NAV_ITEMS: NavItem[] = [
  { label: 'Dashboard', href: '/dashboard',          icon: LayoutDashboard },
  { label: 'Analytics', href: '/dashboard/analytics', icon: BarChart3 },
  { label: 'Notifications', href: '/dashboard/notifications', icon: Bell },
  { label: 'Activity',  href: '/dashboard/activity', icon: History },
  { label: 'Posts',     href: '/dashboard/posts',    icon: FileText },
  {
    label: 'Import ops',
    href: '/dashboard/imports/operations',
    icon: ClipboardList,
  },
  {
    label: 'Import',
    href: '/dashboard/imports',
    icon: Upload,
    roles: ['admin', 'editor'] as Role[],
  },
  { label: 'Calendar',  href: '/dashboard/calendar', icon: Calendar },
  { label: 'Media',     href: '/dashboard/media',    icon: ImageIcon },
  {
    label: 'Integrations',
    href:  '/dashboard/integrations',
    icon:  LinkIcon,
    roles: ['admin', 'editor'] as Role[],
  },
  { label: 'Users',     href: '/dashboard/users',    icon: Users,    roles: ['admin'] as Role[] },
  { label: 'Settings',  href: '/dashboard/settings', icon: Settings, roles: ['admin'] as Role[] },
];

export function visibleNavItems(role: Role | null | undefined): NavItem[] {
  if (!role) return [];
  return NAV_ITEMS.filter((item) => !item.roles || item.roles.includes(role));
}

export function isItemActive(itemHref: string, pathname: string): boolean {
  if (itemHref === '/dashboard') return pathname === '/dashboard';
  if (itemHref === '/dashboard/imports') {
    return pathname === '/dashboard/imports';
  }
  if (itemHref === '/dashboard/imports/operations') {
    if (pathname.startsWith('/dashboard/imports/operations')) return true;
    return /^\/dashboard\/imports\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(pathname);
  }
  return pathname === itemHref || pathname.startsWith(`${itemHref}/`);
}
