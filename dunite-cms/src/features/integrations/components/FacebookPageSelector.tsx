'use client';

// ============================================================================
// DUNITE CMS — Facebook Page selector (post-OAuth page selection UI)
// ============================================================================

import {
  CheckCircle2,
  ChevronRight,
  ExternalLink,
  Loader2,
  Users,
} from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import {
  getPageSelectionStateAction,
  selectFacebookPagesAction,
} from '../server/integrationsActions';
import { cn } from '@/lib/utils';

interface AvailablePage {
  id: string;
  name: string;
  category: string;
  picture_url: string | null;
  fan_count: number | null;
  already_connected: boolean;
}

interface FacebookPageSelectorProps {
  stateId: string;
}

export function FacebookPageSelector({ stateId }: FacebookPageSelectorProps) {
  const router = useRouter();

  const [pages, setPages] = useState<AvailablePage[]>([]);
  const [oauthPageCount, setOauthPageCount] = useState(0);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const connectablePages = useMemo(
    () => pages.filter((p) => !p.already_connected),
    [pages],
  );

  useEffect(() => {
    async function load() {
      const res = await getPageSelectionStateAction(stateId);
      if (!res.ok) {
        setError(res.error);
        setLoading(false);
        return;
      }
      setPages(res.data.pages);
      setOauthPageCount(res.data.oauthPageCount);

      const connectable = res.data.pages.filter((p) => !p.already_connected);
      if (connectable.length === 1) {
        setSelected(new Set([connectable[0].id]));
      }
      setLoading(false);
    }
    void load();
  }, [stateId]);

  function togglePage(pageId: string) {
    const page = pages.find((p) => p.id === pageId);
    if (page?.already_connected) return;

    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(pageId)) next.delete(pageId);
      else next.add(pageId);
      return next;
    });
  }

  async function handleSave() {
    if (selected.size === 0) {
      toast.warning('Select at least one page to connect.');
      return;
    }

    setSaving(true);
    const res = await selectFacebookPagesAction(stateId, Array.from(selected));

    if (res.ok) {
      if (res.data.skipped.length > 0) {
        toast.message(
          `${res.data.skipped.length} page(s) skipped (already connected or could not save).`,
        );
      }

      if (res.data.connected.length === 0) {
        toast.warning('No new pages were connected.');
        setSaving(false);
        return;
      }

      const count = res.data.connected.length;
      const firstName = res.data.connected[0]?.external_name ?? 'Page';
      const msg =
        count === 1
          ? `"${firstName}" connected successfully.`
          : `${count} pages connected successfully.`;

      router.push(`/dashboard/integrations?connected=${encodeURIComponent(firstName)}`);
      toast.success(msg);
      return;
    }

    toast.error(res.error);
    setSaving(false);
  }

  if (loading) {
    return (
      <div className="flex min-h-[300px] items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" aria-hidden />
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-xl border border-red-200 bg-red-50 p-6 text-center">
        <p className="text-sm font-semibold text-red-800">Session error</p>
        <p className="mt-1 text-sm text-red-700">{error}</p>
        <a
          href="/api/integrations/facebook/connect"
          className="mt-4 inline-flex items-center gap-2 rounded-lg bg-[#1877F2] px-4 py-2 text-sm font-semibold text-white hover:bg-[#1665D8]"
        >
          Try again
        </a>
      </div>
    );
  }

  if (pages.length === 0) {
    return (
      <div className="rounded-xl border border-amber-200 bg-amber-50 p-6 text-center">
        <p className="text-sm font-semibold text-amber-800">No pages found</p>
        <p className="mt-1 text-sm text-amber-700">
          {oauthPageCount === 0
            ? 'No Facebook Pages were authorized. Make sure you granted access to at least one Page.'
            : 'Your authorized Pages could not be loaded for selection. Please reconnect.'}
        </p>
        <a
          href="/api/integrations/facebook/connect"
          className="mt-4 inline-flex items-center gap-2 rounded-lg bg-[#1877F2] px-4 py-2 text-sm font-semibold text-white hover:bg-[#1665D8]"
        >
          Reconnect
          <ExternalLink size={12} aria-hidden />
        </a>
      </div>
    );
  }

  if (connectablePages.length === 0) {
    return (
      <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-6 text-center">
        <p className="text-sm font-semibold text-emerald-900">All Pages already connected</p>
        <p className="mt-1 text-sm text-emerald-800">
          Every Page returned by Facebook for this login is already linked to your organization.
          Disconnect a Page first if you need to reconnect it with a different token.
        </p>
        <Button className="mt-4" onClick={() => router.push('/dashboard/integrations')}>
          Back to integrations
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-lg font-semibold text-gray-900">
          Select Pages to connect
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          {connectablePages.length === 1 && pages.length === 1
            ? 'The following Page was authorized. Click connect to add it.'
            : `${connectablePages.length} Page${connectablePages.length !== 1 ? 's are' : ' is'} available to connect.${
                pages.length > connectablePages.length
                  ? ` (${pages.length - connectablePages.length} already linked)`
                  : ''
              }`}
        </p>
      </div>

      {/* ── Pages list ─────────────────────────────────────────────────── */}
      <div className="space-y-2">
        {pages.map((page) => {
          const isSelected = selected.has(page.id);
          const disabled = page.already_connected;

          return (
            <button
              key={page.id}
              type="button"
              disabled={disabled}
              aria-disabled={disabled}
              onClick={() => togglePage(page.id)}
              className={cn(
                'w-full flex items-center gap-3 rounded-xl border p-4 text-left transition-all',
                disabled && 'cursor-not-allowed opacity-60',
                !disabled &&
                  (isSelected
                    ? 'border-[#1877F2] bg-blue-50/60 ring-1 ring-[#1877F2]/40'
                    : 'border-gray-200 bg-white hover:border-gray-300 hover:bg-gray-50'),
              )}
            >
              {/* Avatar */}
              {page.picture_url ? (
                <div className="relative h-11 w-11 shrink-0 overflow-hidden rounded-xl border border-gray-100">
                  <Image
                    src={page.picture_url}
                    alt={page.name}
                    fill
                    sizes="44px"
                    className="object-cover"
                    unoptimized
                  />
                </div>
              ) : (
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[#1877F2]/10">
                  <svg className="h-5 w-5 text-[#1877F2]" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
                    <path d="M24 12.073C24 5.405 18.627 0 12 0S0 5.405 0 12.073c0 6.032 4.388 11.031 10.125 11.927v-8.437H7.078v-3.49h3.047V9.41c0-3.025 1.792-4.697 4.533-4.697 1.312 0 2.686.236 2.686.236v2.975h-1.513c-1.491 0-1.956.93-1.956 1.883v2.256h3.328l-.532 3.49h-2.796v8.437C19.612 23.104 24 18.105 24 12.073z"/>
                  </svg>
                </div>
              )}

              {/* Info */}
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="truncate text-sm font-semibold text-gray-900">{page.name}</p>
                  {page.already_connected && (
                    <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-emerald-800">
                      Connected
                    </span>
                  )}
                </div>
                <p className="text-xs text-muted-foreground">{page.category}</p>
                {page.fan_count != null && (
                  <p className="mt-0.5 inline-flex items-center gap-1 text-xs text-muted-foreground">
                    <Users size={10} aria-hidden />
                    {page.fan_count.toLocaleString()} fans
                  </p>
                )}
              </div>

              {/* Checkbox */}
              <div
                className={cn(
                  'flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 transition-colors',
                  page.already_connected && 'border-emerald-400 bg-emerald-50',
                  !page.already_connected &&
                    (isSelected
                      ? 'border-[#1877F2] bg-[#1877F2]'
                      : 'border-gray-300 bg-white'),
                )}
              >
                {page.already_connected ? (
                  <CheckCircle2 size={12} className="text-emerald-600" aria-hidden />
                ) : (
                  isSelected && <CheckCircle2 size={12} className="text-white" aria-hidden />
                )}
              </div>
            </button>
          );
        })}
      </div>

      {/* ── Select all / deselect all ─────────────────────────────────── */}
      {connectablePages.length > 1 && (
        <div className="flex gap-3 text-xs">
          <button
            type="button"
            onClick={() =>
              setSelected(new Set(connectablePages.map((p) => p.id)))
            }
            className="text-[#1877F2] hover:underline"
          >
            Select all available
          </button>
          <button
            type="button"
            onClick={() => setSelected(new Set())}
            className="text-muted-foreground hover:text-gray-700"
          >
            Clear
          </button>
        </div>
      )}

      {/* ── Actions ────────────────────────────────────────────────────── */}
      <div className="flex items-center gap-3 border-t border-gray-100 pt-4">
        <Button
          onClick={() => void handleSave()}
          disabled={saving || selected.size === 0}
          className="gap-2 bg-[#1877F2] hover:bg-[#1665D8]"
        >
          {saving ? (
            <Loader2 size={14} className="animate-spin" aria-hidden />
          ) : (
            <ChevronRight size={14} aria-hidden />
          )}
          {saving
            ? 'Connecting…'
            : `Connect ${selected.size > 0 ? selected.size : ''} Page${selected.size !== 1 ? 's' : ''}`}
        </Button>
        <Button
          variant="ghost"
          onClick={() => router.push('/dashboard/integrations')}
          disabled={saving}
        >
          Cancel
        </Button>
      </div>
    </div>
  );
}
