'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

import { cn } from '@/lib/utils';

import { isItemActive, type NavItem } from '../data/navigation';

interface SidebarNavProps {
  items: NavItem[];
  onNavigate?: () => void;
}

export function SidebarNav({ items, onNavigate }: SidebarNavProps) {
  const pathname = usePathname();

  return (
    <nav aria-label="Primary" className="flex flex-col gap-0.5">
      {items.map((item) => {
        const Icon = item.icon;
        const active = isItemActive(item.href, pathname ?? '');

        return (
          <Link
            key={item.href}
            href={item.href}
            onClick={onNavigate}
            aria-current={active ? 'page' : undefined}
            className={cn(
              'group flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm font-medium transition-colors',
              active
                ? 'bg-red-50 text-red-700'
                : 'text-muted-foreground hover:bg-muted hover:text-foreground',
            )}
          >
            <Icon
              aria-hidden
              className={cn(
                'size-4 shrink-0 transition-colors',
                active
                  ? 'text-red-600'
                  : 'text-muted-foreground group-hover:text-foreground',
              )}
            />
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
