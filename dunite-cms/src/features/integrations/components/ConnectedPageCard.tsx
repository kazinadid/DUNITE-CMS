'use client';

// ============================================================================
// DUNITE CMS — Connected Page card component
// ============================================================================

import {
  ExternalLink,
  Globe,
  MoreHorizontal,
  RefreshCw,
  Trash2,
  Activity,
  Clock,
} from 'lucide-react';
import { useState } from 'react';
import Image from 'next/image';
import { toast } from 'sonner';

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Button } from '@/components/ui/button';
import { AccountHealthBadge } from './AccountHealthBadge';
import {
  disconnectSocialAccountAction,
  refreshAccountTokenAction,
  runDiagnosticsAction,
} from '../server/integrationsActions';
import type { SocialAccount } from '../types';
import { cn } from '@/lib/utils';
import { formatLocalDateTime } from '@/lib/date';

// ── Platform icons (Facebook logo as SVG inline) ──────────────────────────────

function FacebookIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M24 12.073C24 5.405 18.627 0 12 0S0 5.405 0 12.073c0 6.032 4.388 11.031 10.125 11.927v-8.437H7.078v-3.49h3.047V9.41c0-3.025 1.792-4.697 4.533-4.697 1.312 0 2.686.236 2.686.236v2.975h-1.513c-1.491 0-1.956.93-1.956 1.883v2.256h3.328l-.532 3.49h-2.796v8.437C19.612 23.104 24 18.105 24 12.073z"/>
    </svg>
  );
}

// ── Card ──────────────────────────────────────────────────────────────────────

interface ConnectedPageCardProps {
  account: SocialAccount;
  canManage: boolean;
  onRefresh?: () => void;
}

const HEALTH_BORDER: Record<string, string> = {
  healthy:            'border-emerald-200/70',
  warning:            'border-amber-200/70',
  expired:            'border-red-200/70',
  disconnected:       'border-gray-200',
  permission_error:   'border-orange-200/70',
  reconnect_required: 'border-violet-200/70',
};

function getTokenDaysRemaining(account: SocialAccount): number | null {
  if (account.token_type === 'never_expires' || !account.token_expires_at) {
    return null;
  }

  const expiresAt = new Date(account.token_expires_at).getTime();
  if (!Number.isFinite(expiresAt)) return null;

  const msRemaining = expiresAt - Date.now();
  if (msRemaining <= 0) return 0;

  return Math.floor(msRemaining / (1000 * 60 * 60 * 24));
}

export function ConnectedPageCard({
  account,
  canManage,
  onRefresh,
}: ConnectedPageCardProps) {
  const [loadingAction, setLoadingAction] = useState<string | null>(null);

  const tokenDaysRemaining = getTokenDaysRemaining(account);
  const borderColor = HEALTH_BORDER[account.health_status] ?? 'border-gray-200';

  async function handleDisconnect() {
    if (!confirm(`Disconnect "${account.external_name}"? This cannot be undone.`)) return;
    setLoadingAction('disconnect');
    const res = await disconnectSocialAccountAction(account.id);
    if (res.ok) {
      toast.success(`"${account.external_name}" disconnected.`);
      onRefresh?.();
    } else {
      toast.error(res.error);
    }
    setLoadingAction(null);
  }

  async function handleRefreshToken() {
    setLoadingAction('refresh');
    const res = await refreshAccountTokenAction(account.id);
    if (res.ok) {
      toast.success('Token refreshed successfully.');
      onRefresh?.();
    } else {
      toast.error(res.error);
    }
    setLoadingAction(null);
  }

  async function handleDiagnostics() {
    setLoadingAction('diagnostics');
    const res = await runDiagnosticsAction(account.id);
    if (res.ok) {
      const issue = res.data.issues[0];
      if (res.data.isValid) {
        toast.success(`Health check passed — ${account.external_name} is healthy.`);
      } else {
        toast.warning(issue?.message ?? 'Health check found issues.');
      }
      onRefresh?.();
    } else {
      toast.error(res.error);
    }
    setLoadingAction(null);
  }

  const pageMetadata = account.page_metadata as Record<string, unknown>;
  const followersCount = pageMetadata?.followers_count as number | null;
  const fanCount       = pageMetadata?.fan_count as number | null;
  const displayCount   = followersCount ?? fanCount;

  return (
    <div
      className={cn(
        'relative flex flex-col gap-4 rounded-xl border bg-white p-5 shadow-sm transition-shadow hover:shadow-md',
        borderColor,
      )}
    >
      {/* ── Header ─────────────────────────────────────────────────────── */}
      <div className="flex items-start gap-3">
        {/* Avatar */}
        <div className="relative flex-shrink-0">
          {account.profile_image_url ? (
            <div className="relative h-12 w-12 overflow-hidden rounded-xl border border-gray-100">
              <Image
                src={account.profile_image_url}
                alt={account.external_name}
                fill
                sizes="48px"
                className="object-cover"
                unoptimized
              />
            </div>
          ) : (
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-[#1877F2]/10">
              <FacebookIcon className="h-6 w-6 text-[#1877F2]" />
            </div>
          )}
          {/* Platform badge */}
          <div className="absolute -bottom-1 -right-1 flex h-5 w-5 items-center justify-center rounded-full bg-[#1877F2] ring-2 ring-white">
            <FacebookIcon className="h-3 w-3 text-white" />
          </div>
        </div>

        {/* Name + category */}
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <p className="truncate text-sm font-semibold text-gray-900">
              {account.external_name}
            </p>
            {account.status === 'active' && (
              <span className="rounded-full bg-emerald-50 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-700 ring-1 ring-inset ring-emerald-200">
                Connected
              </span>
            )}
            {account.page_url && (
              <a
                href={account.page_url}
                target="_blank"
                rel="noopener noreferrer"
                className="text-gray-400 hover:text-gray-600"
                aria-label="Open page"
              >
                <ExternalLink size={12} aria-hidden />
              </a>
            )}
          </div>
          {account.external_category && (
            <p className="text-xs text-muted-foreground">{account.external_category}</p>
          )}
          {displayCount != null && (
            <p className="mt-0.5 text-xs text-muted-foreground">
              {displayCount.toLocaleString()} followers
            </p>
          )}
        </div>

        {/* Actions menu */}
        {canManage && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                className="h-7 w-7 shrink-0 p-0 text-gray-400 hover:text-gray-700"
                aria-label="Page actions"
                disabled={loadingAction !== null}
              >
                {loadingAction ? (
                  <RefreshCw size={14} className="animate-spin" aria-hidden />
                ) : (
                  <MoreHorizontal size={14} aria-hidden />
                )}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-44">
              <DropdownMenuItem onClick={handleDiagnostics}>
                <Activity className="mr-2 size-3.5" aria-hidden />
                Check health
              </DropdownMenuItem>
              {account.platform === 'facebook' && (
                <DropdownMenuItem onClick={handleRefreshToken}>
                  <RefreshCw className="mr-2 size-3.5" aria-hidden />
                  Refresh token
                </DropdownMenuItem>
              )}
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onClick={handleDisconnect}
                className="text-red-600 focus:text-red-700"
              >
                <Trash2 className="mr-2 size-3.5" aria-hidden />
                Disconnect
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>

      {/* ── Health + token info ─────────────────────────────────────────── */}
      <div className="flex flex-wrap items-center gap-2">
        <AccountHealthBadge status={account.health_status} size="sm" />

        {tokenDaysRemaining !== null && (
          <span className="inline-flex items-center gap-1 text-[10px] text-muted-foreground">
            <Clock size={10} aria-hidden />
            {tokenDaysRemaining > 0
              ? `Token expires in ${tokenDaysRemaining}d`
              : 'Token expired'}
          </span>
        )}

        {account.token_type === 'never_expires' && (
          <span className="inline-flex items-center gap-1 text-[10px] text-emerald-600">
            <Globe size={10} aria-hidden />
            Long-lived token
          </span>
        )}
      </div>

      {/* ── Permissions ─────────────────────────────────────────────────── */}
      {account.granted_scopes.length > 0 && (
        <div className="border-t border-gray-100 pt-3">
          <p className="mb-1.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
            Granted permissions
          </p>
          <div className="flex flex-wrap gap-1">
            {account.granted_scopes.slice(0, 5).map((scope) => (
              <span
                key={scope}
                className="rounded-md bg-gray-100 px-1.5 py-0.5 font-mono text-[9px] text-gray-600"
              >
                {scope.replace('pages_', '')}
              </span>
            ))}
            {account.granted_scopes.length > 5 && (
              <span className="rounded-md bg-gray-100 px-1.5 py-0.5 text-[9px] text-gray-500">
                +{account.granted_scopes.length - 5} more
              </span>
            )}
          </div>
        </div>
      )}

      {/* ── Reconnect CTA ───────────────────────────────────────────────── */}
      {(account.health_status === 'reconnect_required' ||
        account.health_status === 'expired' ||
        account.health_status === 'permission_error') && canManage && (
        <a
          href="/api/integrations/facebook/connect"
          className="flex items-center justify-center gap-2 rounded-lg bg-[#1877F2] px-3 py-2 text-xs font-semibold text-white transition-opacity hover:opacity-90"
        >
          <RefreshCw size={12} aria-hidden />
          Reconnect Facebook
        </a>
      )}

      {/* ── Last validated ──────────────────────────────────────────────── */}
      {account.last_validated_at && (
        <p className="text-[10px] text-muted-foreground">
          Last synced:{' '}
          {formatLocalDateTime(account.last_validated_at, {
            weekday: undefined,
            year:    undefined,
            month:   'short',
            day:     'numeric',
            hour:    '2-digit',
            minute:  '2-digit',
            hour12:  true,
          })}
        </p>
      )}
    </div>
  );
}
