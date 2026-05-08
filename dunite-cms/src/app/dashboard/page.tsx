'use client';

import { useEffect, useState } from 'react';
import { Lock } from 'lucide-react';
import { RecentActivityWidget } from '@/features/activity';
import { supabase } from '@/lib/supabaseClient';
import type { Role } from '@/features/auth';

type DashboardUser = {
  id: string;
  email: string;
  role: Role;
  name?: string | null;
};

export default function DashboardPage() {
  const [user, setUser] = useState<DashboardUser | null>(null);

  useEffect(() => {
    const fetchUser = async () => {
      const { data: authData } = await supabase.auth.getUser();
      if (!authData?.user) return;

      const { data } = await supabase
        .from('users')
        .select('*')
        .eq('id', authData.user.id)
        .single();

      setUser(data);
    };
    fetchUser();
  }, []);

  if (!user) return null;

  const displayName =
    user.name ||
    user.email.split('@')[0].charAt(0).toUpperCase() +
      user.email.split('@')[0].slice(1);

  const canCreate = user.role === 'admin' || user.role === 'editor';

  return (
    <div className="max-w-6xl mx-auto px-4 md:px-6 py-6 space-y-6">

      {/* ── Welcome ─────────────────────────────────────────────── */}
      <div>
        <h1 className="text-3xl font-semibold tracking-tight text-gray-900">
          Welcome back, {displayName}
        </h1>
        <p className="mt-1 text-sm text-gray-500">
          Here&apos;s your workspace overview.
        </p>
      </div>

      {/* ── Viewer banner ───────────────────────────────────────── */}
      {user.role === 'viewer' && (
        <div className="flex items-center gap-2.5 border border-amber-200 bg-amber-50 text-amber-800 px-4 py-3 rounded-xl text-sm">
          <Lock size={15} className="shrink-0" aria-hidden />
          <span>
            <strong className="font-medium">Read-only mode.</strong>{' '}
            You can view data but cannot make changes.
          </span>
        </div>
      )}

      {/* ── Stat cards ──────────────────────────────────────────── */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:col-span-2">
          <StatCard label="Total posts"     value="0" />
          <StatCard label="Scheduled posts" value="0" tone="warning" />
          <StatCard label="Failed posts"    value="0" tone="danger"  />
        </div>
        <div className="lg:col-span-1">
          <RecentActivityWidget />
        </div>
      </div>

      {/* ── Account card ────────────────────────────────────────── */}
      <div className="bg-white border border-gray-100 rounded-xl shadow-sm hover:shadow-lg transition-all duration-200 p-4">
        <h3 className="text-lg font-semibold text-gray-900">Account</h3>
        <p className="text-sm text-gray-500 mt-0.5 mb-4">Your current session details.</p>

        <div className="border-t border-gray-100 pt-4">
          <p className="text-sm text-gray-500 mb-1">Email</p>
          <p className="text-sm font-medium text-gray-800 truncate">{user.email}</p>
        </div>
      </div>

      {/* ── Admin tools ─────────────────────────────────────────── */}
      {user.role === 'admin' && (
        <div className="bg-white border border-gray-100 rounded-xl shadow-sm hover:shadow-lg transition-all duration-200 p-4">
          <h3 className="text-lg font-semibold text-gray-900">Admin tools</h3>
          <p className="text-sm text-gray-500 mt-0.5 mb-4">
            Workspace management and user controls.
          </p>
          <div className="flex flex-wrap gap-2">
            <PlaceholderButton>Manage users</PlaceholderButton>
            <PlaceholderButton>Workspace settings</PlaceholderButton>
          </div>
        </div>
      )}

      {/* ── Quick actions ───────────────────────────────────────── */}
      {canCreate && (
        <div className="bg-white border border-gray-100 rounded-xl shadow-sm hover:shadow-lg transition-all duration-200 p-4">
          <h3 className="text-lg font-semibold text-gray-900">Quick actions</h3>
          <p className="text-sm text-gray-500 mt-0.5 mb-4">
            Shortcuts to common tasks.
          </p>
          <div className="flex flex-wrap gap-2">
            <PlaceholderButton>New post</PlaceholderButton>
            <PlaceholderButton>Upload media</PlaceholderButton>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Helpers ──────────────────────────────────────────────────────────────────

const TONE_CLASSES: Record<'default' | 'warning' | 'danger', { value: string; label: string }> = {
  default: { value: 'text-gray-900', label: 'text-gray-500' },
  warning: { value: 'text-amber-600', label: 'text-amber-500' },
  danger:  { value: 'text-red-600',   label: 'text-red-400'   },
};

function StatCard({
  label,
  value,
  tone = 'default',
}: {
  label: string;
  value: string;
  tone?: 'default' | 'warning' | 'danger';
}) {
  const t = TONE_CLASSES[tone];
  return (
    <div className="bg-white border border-gray-100 rounded-xl shadow-sm hover:shadow-lg transition-all duration-200 p-4">
      <p className={`text-sm ${t.label}`}>{label}</p>
      <p className={`text-3xl font-bold tracking-tight mt-2 ${t.value}`}>{value}</p>
    </div>
  );
}

function PlaceholderButton({ children }: { children: React.ReactNode }) {
  return (
    <button
      disabled
      className="px-3 py-1.5 text-xs font-medium border border-gray-200 rounded-lg text-gray-400 cursor-not-allowed"
    >
      {children} <span className="text-gray-300">(soon)</span>
    </button>
  );
}
