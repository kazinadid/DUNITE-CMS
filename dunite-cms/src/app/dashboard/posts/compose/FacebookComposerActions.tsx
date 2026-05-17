'use client';

import { Loader2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';

import type { Role } from '@/features/auth/types';
import { listSocialAccountsAction } from '@/features/integrations/server/integrationsActions';
import type { SocialAccount } from '@/features/integrations/types';
import { Button } from '@/components/ui/button';
import { canPublishPost } from '@/lib/rbac';

interface FacebookComposerActionsProps {
  postId: string;
  userRole: Role;
}

export function FacebookComposerActions({
  postId,
  userRole,
}: FacebookComposerActionsProps) {
  const [accounts, setAccounts] = useState<SocialAccount[]>([]);
  const [picked, setPicked] = useState<string>('');
  const [loadingAccounts, setLoadingAccounts] = useState(true);
  const [busy, setBusy] = useState<'publish' | 'retry' | null>(null);

  const allowImmediate = canPublishPost(userRole);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoadingAccounts(true);
      const res = await listSocialAccountsAction('facebook');
      if (cancelled) return;
      if (!res.ok) {
        toast.error(res.error);
        setAccounts([]);
      } else {
        const rows = res.data.filter(
          (a) => a.status === 'active' && a.health_status !== 'permission_error',
        );
        setAccounts(rows);
        setPicked((prev) => prev || rows[0]?.id || '');
      }
      setLoadingAccounts(false);
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  async function callPublish(path: '/api/social/facebook/publish' | '/api/social/facebook/retry') {
    const body =
      path === '/api/social/facebook/publish'
        ? { postId, socialAccountId: picked }
        : { postId };
    const res = await fetch(path, {
      method:     'POST',
      headers:    { 'Content-Type': 'application/json' },
      body:       JSON.stringify(body),
      credentials: 'include',
    });
    const json = (await res.json().catch(() => null)) as
      | { ok: true }
      | { ok: false; error?: string }
      | null;
    if (!res.ok || !json || json.ok !== true) {
      const msg = json && typeof json === 'object' && 'error' in json && json.error
        ? json.error
        : 'Facebook request failed';
      toast.error(msg);
      return false;
    }
    return true;
  }

  return (
    <div className="space-y-3 text-sm">
      <p className="text-xs text-muted-foreground">
        Publishes this post to Meta using encrypted Page tokens (server-side). Select a Page and
        use an action below.
      </p>

      {loadingAccounts ? (
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Loader2 size={14} className="animate-spin" aria-hidden />
          Loading Pages…
        </div>
      ) : accounts.length === 0 ? (
        <p className="text-xs text-amber-700">
          No active Facebook Pages for your organization.&nbsp;
          <a href="/dashboard/integrations" className="font-semibold underline">
            Connect a Page first
          </a>
          .
        </p>
      ) : (
        <label className="block space-y-1">
          <span className="text-[11px] font-medium uppercase tracking-wide text-gray-500">
            Target Page
          </span>
          <select
            value={picked}
            onChange={(e) => setPicked(e.target.value)}
            className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm outline-none focus:border-gray-400"
          >
            {accounts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.external_name ?? a.page_name ?? a.external_id}
              </option>
            ))}
          </select>
        </label>
      )}

      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          size="sm"
          disabled={
            busy !== null ||
            !picked ||
            !allowImmediate ||
            loadingAccounts ||
            accounts.length === 0
          }
          onClick={() => {
            void (async () => {
              setBusy('publish');
              try {
                const ok = await callPublish('/api/social/facebook/publish');
                if (ok) toast.success('Facebook publish started/completed.');
              } finally {
                setBusy(null);
              }
            })();
          }}
        >
          {busy === 'publish' ? (
            <Loader2 size={14} className="animate-spin" aria-hidden />
          ) : (
            'Publish to Facebook'
          )}
        </Button>

        <Button
          type="button"
          size="sm"
          variant="secondary"
          disabled={busy !== null || loadingAccounts}
          onClick={() => {
            void (async () => {
              setBusy('retry');
              try {
                const ok = await callPublish('/api/social/facebook/retry');
                if (ok) toast.success('Publishing job queued for retry.');
              } finally {
                setBusy(null);
              }
            })();
          }}
        >
          {busy === 'retry' ? (
            <Loader2 size={14} className="animate-spin" aria-hidden />
          ) : (
            'Retry failed job'
          )}
        </Button>
      </div>

      {!allowImmediate && (
        <p className="text-[11px] text-muted-foreground">
          Immediately publishing requires a global&nbsp;
          <code className="rounded bg-muted px-1 py-0.5 text-[10px]">admin</code>
          role. Editors can retry scheduled jobs via the Retry action or reschedule from the Posts
          list.
        </p>
      )}
    </div>
  );
}
