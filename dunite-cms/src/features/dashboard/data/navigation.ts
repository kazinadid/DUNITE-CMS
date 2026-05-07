import {
  Calendar,
  Image as ImageIcon,
  LayoutDashboard,
  Settings,
  FileText,
  Users,
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
  { label: 'Posts',     href: '/dashboard/posts',    icon: FileText },
  { label: 'Calendar',  href: '/dashboard/calendar', icon: Calendar },
  { label: 'Media',     href: '/dashboard/media',    icon: ImageIcon },
  { label: 'Users',     href: '/dashboard/users',    icon: Users,    roles: ['admin'] },
  { label: 'Settings',  href: '/dashboard/settings', icon: Settings, roles: ['admin'] },
];

export function visibleNavItems(role: Role | null | undefined): NavItem[] {
  if (!role) return [];
  return NAV_ITEMS.filter((item) => !item.roles || item.roles.includes(role));
}

export function isItemActive(itemHref: string, pathname: string): boolean {
  if (itemHref === '/dashboard') return pathname === '/dashboard';
  return pathname === itemHref || pathname.startsWith(`${itemHref}/`);
}
