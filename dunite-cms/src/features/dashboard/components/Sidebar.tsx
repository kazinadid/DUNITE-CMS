'use client';

import { useRole } from '@/hooks/useRole';

import { visibleNavItems } from '../data/navigation';
import { BrandMark } from './BrandMark';
import { SidebarNav } from './SidebarNav';

export function Sidebar() {
  const { role } = useRole();
  const items = visibleNavItems(role);

  return (
    <aside className="hidden h-screen w-64 shrink-0 flex-col border-r border-border bg-white p-4 lg:flex">
      <div className="mb-6">
        <BrandMark />
      </div>

      <SidebarNav items={items} />

      <div className="mt-auto pt-4 text-xs text-muted-foreground">
        <p>v0.1.0</p>
      </div>
    </aside>
  );
}
