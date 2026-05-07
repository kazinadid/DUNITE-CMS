'use client';

import { Loader2 } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';

import { RoleBadge } from '@/features/dashboard';
import type { Role } from '@/features/auth';
import { supabase } from '@/lib/supabaseClient';

export interface UserRow {
  id: string;
  email: string;
  name: string | null;
  role: Role;
  created_at: string | null;
}

const ROLES: Role[] = ['admin', 'editor', 'viewer'];

interface UsersTableProps {
  initialUsers: UserRow[];
  /** Used to disable role editing on the admin's own row (avoids self-lockout). */
  currentUserId: string;
}

export function UsersTable({ initialUsers, currentUserId }: UsersTableProps) {
  const [users, setUsers] = useState<UserRow[]>(initialUsers);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState('');

  // Realtime: any change to `public.users` mirrors into local state.
  // (RLS allows admins to subscribe to all rows; non-admins would only
  // receive their own row, so this is safe to leave on for everyone.)
  useEffect(() => {
    const channel = supabase
      .channel('users-list')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'users' },
        (payload) => {
          setUsers((prev) => {
            if (payload.eventType === 'INSERT') {
              const next = payload.new as UserRow;
              return prev.some((u) => u.id === next.id)
                ? prev
                : [next, ...prev];
            }
            if (payload.eventType === 'UPDATE') {
              const next = payload.new as UserRow;
              return prev.map((u) => (u.id === next.id ? { ...u, ...next } : u));
            }
            if (payload.eventType === 'DELETE') {
              const old = payload.old as { id: string };
              return prev.filter((u) => u.id !== old.id);
            }
            return prev;
          });
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  async function changeRole(id: string, role: Role) {
    setError(null);
    setSavingId(id);

    // Optimistic update
    const previous = users;
    setUsers((prev) => prev.map((u) => (u.id === id ? { ...u, role } : u)));

    const { error: updateError } = await supabase
      .from('users')
      .update({ role })
      .eq('id', id);

    setSavingId(null);

    if (updateError) {
      setUsers(previous); // revert
      setError(updateError.message);
    }
  }

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return users;
    return users.filter(
      (u) =>
        u.email.toLowerCase().includes(q) ||
        (u.name ?? '').toLowerCase().includes(q),
    );
  }, [users, query]);

  return (
    <div className="space-y-4">
      {/* Search + count */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search by name or email…"
          className="w-full sm:max-w-xs rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 outline-none transition focus:border-gray-400 focus:ring-2 focus:ring-gray-100"
        />
        <p className="text-xs text-gray-500">
          {filtered.length} of {users.length} user{users.length === 1 ? '' : 's'}
        </p>
      </div>

      {error && (
        <div
          role="alert"
          className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700"
        >
          {error}
        </div>
      )}

      {/* Desktop table */}
      <div className="hidden md:block overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-left text-xs font-medium uppercase tracking-wide text-gray-500">
            <tr>
              <th scope="col" className="px-4 py-3">Name</th>
              <th scope="col" className="px-4 py-3">Email</th>
              <th scope="col" className="px-4 py-3">Role</th>
              <th scope="col" className="px-4 py-3 text-right">Change role</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {filtered.map((u) => {
              const displayName = u.name ?? u.email.split('@')[0];
              const isSelf = u.id === currentUserId;

              return (
                <tr key={u.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 text-gray-900">
                    {displayName}
                    {isSelf && (
                      <span className="ml-2 text-xs text-gray-400">(you)</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-gray-600">{u.email}</td>
                  <td className="px-4 py-3">
                    <RoleBadge role={u.role} />
                  </td>
                  <td className="px-4 py-3 text-right">
                    <RoleSelect
                      value={u.role}
                      disabled={isSelf || savingId === u.id}
                      saving={savingId === u.id}
                      onChange={(r) => changeRole(u.id, r)}
                    />
                  </td>
                </tr>
              );
            })}

            {filtered.length === 0 && (
              <tr>
                <td colSpan={4} className="px-4 py-10 text-center text-sm text-gray-500">
                  No users found.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Mobile cards */}
      <div className="space-y-3 md:hidden">
        {filtered.map((u) => {
          const displayName = u.name ?? u.email.split('@')[0];
          const isSelf = u.id === currentUserId;

          return (
            <div
              key={u.id}
              className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="font-medium text-gray-900 truncate">
                    {displayName}
                    {isSelf && (
                      <span className="ml-2 text-xs text-gray-400">(you)</span>
                    )}
                  </p>
                  <p className="text-xs text-gray-500 truncate">{u.email}</p>
                </div>
                <RoleBadge role={u.role} />
              </div>
              <div className="mt-3">
                <RoleSelect
                  value={u.role}
                  disabled={isSelf || savingId === u.id}
                  saving={savingId === u.id}
                  onChange={(r) => changeRole(u.id, r)}
                  full
                />
              </div>
            </div>
          );
        })}

        {filtered.length === 0 && (
          <div className="rounded-xl border border-gray-200 bg-white p-6 text-center text-sm text-gray-500">
            No users found.
          </div>
        )}
      </div>
    </div>
  );
}

// ── Role selector ───────────────────────────────────────────────────────────

function RoleSelect({
  value,
  disabled,
  saving,
  onChange,
  full,
}: {
  value: Role;
  disabled?: boolean;
  saving?: boolean;
  onChange: (role: Role) => void;
  full?: boolean;
}) {
  return (
    <div className={`inline-flex items-center gap-2 ${full ? 'w-full' : ''}`}>
      <select
        aria-label="Change role"
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value as Role)}
        className={`${
          full ? 'flex-1' : 'min-w-[110px]'
        } rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-sm capitalize text-gray-900 outline-none transition focus:border-gray-400 focus:ring-2 focus:ring-gray-100 disabled:cursor-not-allowed disabled:bg-gray-50 disabled:text-gray-400`}
      >
        {ROLES.map((r) => (
          <option key={r} value={r} className="capitalize">
            {r}
          </option>
        ))}
      </select>
      {saving && (
        <Loader2
          size={14}
          className="animate-spin text-gray-400"
          aria-label="Saving"
        />
      )}
    </div>
  );
}
