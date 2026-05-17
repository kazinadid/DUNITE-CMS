import type { ReactNode } from 'react';
import Link from 'next/link';

export default function AnalyticsWorkspaceLayout(props: {
  children: ReactNode;
}) {
  const tabs = [
    { href: '/dashboard/analytics/overview', label: 'Overview' },
    { href: '/dashboard/analytics/posts', label: 'Post analytics' },
    { href: '/dashboard/analytics/pages', label: 'Page analytics' },
    { href: '/dashboard/analytics/sync', label: 'Sync center' },
  ];

  return (
    <div className="mx-auto max-w-7xl">
      <nav className="sticky top-0 z-10 border-b border-gray-100 bg-[#fdf8f4]/95 px-4 py-3 backdrop-blur md:px-6">
        <div className="flex flex-wrap gap-2">
          {tabs.map((t) => (
            <Link
              key={t.href}
              href={t.href}
              className="rounded-full px-4 py-1.5 text-sm font-semibold text-gray-900 ring-1 ring-gray-200 hover:bg-[#fff4ec]"
            >
              {t.label}
            </Link>
          ))}
        </div>
      </nav>
      {props.children}
    </div>
  );
}
