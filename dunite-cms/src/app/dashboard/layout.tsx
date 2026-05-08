'use client';

import { ReactNode, useEffect, useState, useRef } from 'react';
import { LogOut, Menu, X } from 'lucide-react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';

import { supabase } from '@/lib/supabaseClient';
import type { Role } from '@/features/auth';
import { AppToast } from '@/features/feedback';
import { DashboardNotificationHost } from '@/features/notifications';
import {
  isItemActive,
  visibleNavItems,
  type NavItem,
} from '@/features/dashboard/data/navigation';

type DashboardUser = {
  id: string;
  email: string;
  role: Role;
  name?: string | null;
};

function getDisplayName(user: DashboardUser): string {
  if (user.name) return user.name;
  const local = user.email.split('@')[0];
  return local.charAt(0).toUpperCase() + local.slice(1);
}

function getInitials(user: DashboardUser): string {
  const name = getDisplayName(user);
  const parts = name.split(/[\s._-]/);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return name.slice(0, 2).toUpperCase();
}

const ROLE_BADGE: Record<Role, string> = {
  admin: 'bg-red-100 text-red-700',
  editor: 'bg-blue-100 text-blue-700',
  viewer: 'bg-gray-100 text-gray-600',
};

export default function DashboardLayout({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<DashboardUser | null>(null);
  const [open, setOpen] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  const router = useRouter();
  const pathname = usePathname();
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Always pull the role from the DB (never trust the auth token alone).
  // We also subscribe to changes so role updates from /dashboard/users
  // are reflected without a hard refresh.
  useEffect(() => {
    let mounted = true;

    const load = async () => {
      const { data: authData } = await supabase.auth.getUser();
      if (!authData?.user) {
        router.push('/login');
        return;
      }

      const { data: profile } = await supabase
        .from('users')
        .select('id, email, name, role')
        .eq('id', authData.user.id)
        .single();

      if (mounted && profile) setUser(profile);

      const channel = supabase
        .channel(`user:${authData.user.id}`)
        .on(
          'postgres_changes',
          {
            event: 'UPDATE',
            schema: 'public',
            table: 'users',
            filter: `id=eq.${authData.user.id}`,
          },
          (payload) => {
            if (mounted) setUser(payload.new as DashboardUser);
          },
        )
        .subscribe();

      return () => {
        supabase.removeChannel(channel);
      };
    };

    const cleanup = load();
    return () => {
      mounted = false;
      cleanup.then((fn) => fn?.());
    };
  }, [router]);

  // Close dropdown / mobile drawer on outside click
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(e.target as Node)
      ) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleLogout = async () => {
    await supabase.auth.signOut();
    router.push('/login');
  };

  if (!user) return null;

  const displayName = getDisplayName(user);
  const initials = getInitials(user);
  const navItems = visibleNavItems(user.role);

  return (
    <div className="flex h-screen overflow-hidden bg-gray-50">
      {/* ── Desktop sidebar ─────────────────────────────────────── */}
      <aside className="hidden md:flex flex-col w-60 bg-gradient-to-b from-[#7A0000] to-[#4A0000] text-white">
        <div className="flex items-center gap-2.5 px-4 pt-5 pb-6">
          <div className="w-8 h-8 rounded-lg bg-white text-[#7A0000] flex items-center justify-center font-bold">
            D
          </div>
          <span className="font-semibold text-sm">DUNITE CMS</span>
        </div>

        <nav className="px-3 space-y-1">
          {navItems.map((item) => (
            <SidebarItem
              key={item.href}
              item={item}
              active={isItemActive(item.href, pathname ?? '')}
            />
          ))}
        </nav>
      </aside>

      {/* ── Mobile sidebar drawer ──────────────────────────────── */}
      {mobileOpen && (
        <>
          <div
            className="fixed inset-0 z-40 bg-black/40 md:hidden"
            onClick={() => setMobileOpen(false)}
            aria-hidden
          />
          <aside className="fixed inset-y-0 left-0 z-50 flex w-64 flex-col bg-gradient-to-b from-[#7A0000] to-[#4A0000] text-white md:hidden">
            <div className="flex items-center justify-between px-4 pt-5 pb-6">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-white text-[#7A0000] flex items-center justify-center font-bold">
                  D
                </div>
                <span className="font-semibold text-sm">DUNITE CMS</span>
              </div>
              <button
                onClick={() => setMobileOpen(false)}
                className="p-1 rounded-md hover:bg-white/10"
                aria-label="Close menu"
              >
                <X size={18} />
              </button>
            </div>
            <nav className="px-3 space-y-1">
              {navItems.map((item) => (
                <SidebarItem
                  key={item.href}
                  item={item}
                  active={isItemActive(item.href, pathname ?? '')}
                  onClick={() => setMobileOpen(false)}
                />
              ))}
            </nav>
          </aside>
        </>
      )}

      {/* ── Main column ─────────────────────────────────────────── */}
      <div className="flex flex-col flex-1 overflow-hidden">
        {/* Topbar */}
        <header className="flex items-center gap-3 px-4 md:px-6 py-2.5 border-b bg-white/80 backdrop-blur-sm">
          {/* Mobile menu toggle */}
          <button
            onClick={() => setMobileOpen(true)}
            className="md:hidden inline-flex items-center justify-center w-8 h-8 rounded-md text-gray-600 hover:bg-gray-100"
            aria-label="Open menu"
          >
            <Menu size={18} />
          </button>

          <div className="ml-auto flex items-center gap-3">
            <DashboardNotificationHost userId={user.id} />
            <AppToast />
            <span className="hidden sm:block text-sm font-medium text-gray-800">
              {displayName}
            </span>
            <span
              className={`text-xs px-2 py-1 rounded-full ${ROLE_BADGE[user.role]}`}
            >
              {user.role}
            </span>

            <div ref={dropdownRef} className="relative">
              <div
                onClick={() => setOpen(!open)}
                className="w-8 h-8 rounded-full bg-gray-900 text-white flex items-center justify-center text-xs font-semibold cursor-pointer"
              >
                {initials}
              </div>

              {open && (
                <div className="absolute right-0 mt-2 w-56 bg-white rounded-xl shadow-lg border p-4 z-50 animate-in fade-in zoom-in-95">
                  <p className="text-sm font-semibold">{displayName}</p>
                  <p className="text-xs text-gray-500 mb-2">{user.email}</p>

                  <div className="border-t my-2" />

                  <span
                    className={`text-xs px-2 py-1 rounded-full ${ROLE_BADGE[user.role]}`}
                  >
                    {user.role}
                  </span>

                  <div className="border-t my-3" />

                  <button
                    onClick={handleLogout}
                    className="w-full flex items-center gap-2 text-sm text-red-600 hover:bg-gray-100 px-2 py-1 rounded"
                  >
                    <LogOut size={14} />
                    Sign out
                  </button>
                </div>
              )}
            </div>
          </div>
        </header>

        {/* Content */}
        <main className="flex-1 overflow-y-auto max-w-6xl mx-auto w-full">
          {children}
        </main>
      </div>
    </div>
  );
}

function SidebarItem({
  item,
  active,
  onClick,
}: {
  item: NavItem;
  active: boolean;
  onClick?: () => void;
}) {
  const Icon = item.icon;
  return (
    <Link
      href={item.href}
      onClick={onClick}
      className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm cursor-pointer transition ${
        active
          ? 'bg-white/10 text-white font-medium'
          : 'text-white/70 hover:bg-white/10 hover:text-white'
      }`}
    >
      <Icon size={16} />
      <span>{item.label}</span>
    </Link>
  );
}
