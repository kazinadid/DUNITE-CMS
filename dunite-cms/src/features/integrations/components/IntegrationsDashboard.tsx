'use client';

// ============================================================================
// DUNITE CMS — Integrations dashboard (main client component)
// ============================================================================

import {
  AlertCircle,
  CheckCircle2,
  Link as LinkIcon,
  RefreshCw,
  ShieldAlert,
  Wifi,
} from 'lucide-react';
import { useEffect, useState, useCallback, useRef } from 'react';
import { useSearchParams } from 'next/navigation';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { ConnectedPageCard } from './ConnectedPageCard';
import { listSocialAccountsAction } from '../server/integrationsActions';
import type { SocialAccount, AccountHealthStatus } from '../types';
import { cn } from '@/lib/utils';

// ── Connect buttons ────────────────────────────────────────────────────────────

function ConnectFacebookButton() {
  return (
    <a
      href="/api/integrations/facebook/connect"
      className="inline-flex items-center gap-2 rounded-xl bg-[#1877F2] px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition-all hover:bg-[#1665D8] hover:shadow-md active:scale-95"
    >
      <FacebookWordmark />
      Connect Facebook Page
    </a>
  );
}

function ConnectLinkedInButton() {
  return (
    <a
      href="/api/integrations/linkedin/connect"
      className="inline-flex items-center gap-2 rounded-xl bg-[#0A66C2] px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition-all hover:bg-[#084d94] hover:shadow-md active:scale-95"
    >
      <LinkedInWordmark />
      Connect LinkedIn
    </a>
  );
}

function FacebookWordmark() {
  return (
    <svg className="h-4 w-4" viewBox="0 0 24 24" fill="white" aria-hidden>
      <path d="M24 12.073C24 5.405 18.627 0 12 0S0 5.405 0 12.073c0 6.032 4.388 11.031 10.125 11.927v-8.437H7.078v-3.49h3.047V9.41c0-3.025 1.792-4.697 4.533-4.697 1.312 0 2.686.236 2.686.236v2.975h-1.513c-1.491 0-1.956.93-1.956 1.883v2.256h3.328l-.532 3.49h-2.796v8.437C19.612 23.104 24 18.105 24 12.073z"/>
    </svg>
  );
}

function LinkedInWordmark() {
  return (
    <svg className="h-4 w-4" viewBox="0 0 24 24" fill="white" aria-hidden>
      <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433c-1.144 0-2.063-.926-2.063-2.065 0-1.138.92-2.063 2.063-2.063 1.14 0 2.064.925 2.064 2.063 0 1.139-.925 2.065-2.064 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z"/>
    </svg>
  );
}

// ── Empty state ───────────────────────────────────────────────────────────────

function EmptyState({ canManage }: { canManage: boolean }) {
  return (
    <div className="flex flex-col items-center gap-5 rounded-2xl border-2 border-dashed border-gray-200 bg-gray-50/50 py-16 text-center">
      <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-gray-100">
        <LinkIcon className="h-7 w-7 text-gray-400" aria-hidden />
      </div>
      <div>
        <p className="text-base font-semibold text-gray-900">No social accounts connected</p>
        <p className="mt-1 max-w-xs text-sm text-muted-foreground">
          Connect a Facebook Page to enable publishing automation.
        </p>
      </div>
      {canManage && <ConnectFacebookButton />}
    </div>
  );
}

// ── Health summary bar ────────────────────────────────────────────────────────

interface HealthSummaryProps {
  accounts: SocialAccount[];
}

function HealthSummary({ accounts }: HealthSummaryProps) {
  if (accounts.length === 0) return null;

  const healthy    = accounts.filter((a) => a.health_status === 'healthy').length;
  const warnings   = accounts.filter((a) => a.health_status === 'warning').length;
  const issues     = accounts.filter(
    (a) => ['expired', 'disconnected', 'permission_error', 'reconnect_required'].includes(a.health_status)
  ).length;

  return (
    <div className="flex flex-wrap items-center gap-3">
      {healthy > 0 && (
        <span className="inline-flex items-center gap-1.5 text-sm text-emerald-700">
          <CheckCircle2 size={14} aria-hidden />
          {healthy} healthy
        </span>
      )}
      {warnings > 0 && (
        <span className="inline-flex items-center gap-1.5 text-sm text-amber-700">
          <AlertCircle size={14} aria-hidden />
          {warnings} expiring soon
        </span>
      )}
      {issues > 0 && (
        <span className="inline-flex items-center gap-1.5 text-sm text-red-700">
          <ShieldAlert size={14} aria-hidden />
          {issues} require attention
        </span>
      )}
    </div>
  );
}

// ── Error banner ──────────────────────────────────────────────────────────────

function OAuthErrorBanner({ code, message }: { code: string; message: string }) {
  const descriptions: Record<string, string> = {
    oauth_denied:           'You denied Facebook access. No changes were made.',
    csrf_invalid:           'Security validation failed. Please try connecting again.',
    token_exchange_failed:  'Facebook authorization could not be completed. Check that your app is configured correctly.',
    config_error:           'Facebook integration is not configured. Contact your administrator.',
    no_organization:        'Your account is not part of any organization.',
    insufficient_permissions: 'You need admin or editor access to connect social accounts.',
    facebook_missing_permissions: 'Facebook did not return Pages. Reconnect and approve all requested Page permissions.',
    facebook_no_pages_found: 'No Facebook Pages were returned for this account.',
    facebook_rate_limited: 'Meta is rate limiting Graph API calls. Wait a moment and retry.',
    facebook_config_missing: 'Facebook integration is not configured correctly.',
  };

  const desc = descriptions[code] ?? decodeURIComponent(message);

  return (
    <div className="flex items-start gap-3 rounded-xl border border-red-200 bg-red-50 p-4">
      <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-red-600" aria-hidden />
      <div>
        <p className="text-sm font-semibold text-red-800">Connection failed</p>
        <p className="mt-0.5 text-sm text-red-700">{desc}</p>
      </div>
    </div>
  );
}

// ── Main dashboard ────────────────────────────────────────────────────────────

interface IntegrationsDashboardProps {
  /** Whether the current user can add/disconnect accounts */
  canManage: boolean;
  /** Organization name for display */
  organizationName?: string;
}

export function IntegrationsDashboard({
  canManage,
  organizationName,
}: IntegrationsDashboardProps) {
  const searchParams = useSearchParams();
  const errorCode    = searchParams.get('error');
  const errorMessage = searchParams.get('message') ?? '';
  const successMsg   = searchParams.get('connected');

  const [accounts, setAccounts] = useState<SocialAccount[]>([]);
  const [loading, setLoading]   = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const loadAccounts = useCallback(async () => {
    const res = await listSocialAccountsAction();
    if (res.ok) {
      setAccounts(res.data);
    } else {
      toast.error('Failed to load connected accounts.');
    }
    setLoading(false);
    setRefreshing(false);
  }, []);

  // Load accounts on mount
  const hasLoadedRef = useRef(false);
  
  useEffect(() => {
    if (!hasLoadedRef.current) {
      hasLoadedRef.current = true;
      void loadAccounts();
    }
  }, [loadAccounts]);

  useEffect(() => {
    if (successMsg) {
      toast.success(`${decodeURIComponent(successMsg)} connected successfully.`);
    }
  }, [successMsg]);

  function handleRefresh() {
    setRefreshing(true);
    void loadAccounts();
  }

  // ── Grouped by platform ─────────────────────────────────────────────────────
  const facebookAccounts = accounts.filter((a) => a.platform === 'facebook');
  const linkedinAccounts = accounts.filter((a) => a.platform === 'linkedin');

  return (
    <div className="space-y-6">
      {/* ── Error banner ───────────────────────────────────────────────── */}
      {errorCode && (
        <OAuthErrorBanner code={errorCode} message={errorMessage} />
      )}

      {/* ── Page header ─────────────────────────────────────────────────── */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Social Integrations</h1>
          {organizationName && (
            <p className="mt-0.5 text-sm text-muted-foreground">{organizationName}</p>
          )}
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={handleRefresh}
            disabled={loading || refreshing}
            className="gap-1.5"
          >
            <RefreshCw size={13} className={cn(refreshing && 'animate-spin')} aria-hidden />
            Refresh
          </Button>
          {canManage && (
            <div className="flex items-center gap-2">
              <ConnectFacebookButton />
              <ConnectLinkedInButton />
            </div>
          )}
        </div>
      </div>

      {/* ── Health summary ───────────────────────────────────────────────── */}
      {!loading && accounts.length > 0 && (
        <HealthSummary accounts={accounts} />
      )}

      {/* ── Loading skeleton ─────────────────────────────────────────────── */}
      {loading && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {[1, 2, 3].map((i) => (
            <div
              key={i}
              className="h-52 animate-pulse rounded-xl border bg-gray-100"
            />
          ))}
        </div>
      )}

      {/* ── Facebook section ─────────────────────────────────────────────── */}
      {!loading && (
        <>
          {/* Section header */}
          <div className="flex items-center gap-2">
            <div className="flex h-6 w-6 items-center justify-center rounded-lg bg-[#1877F2]">
              <svg className="h-3.5 w-3.5 text-white" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
                <path d="M24 12.073C24 5.405 18.627 0 12 0S0 5.405 0 12.073c0 6.032 4.388 11.031 10.125 11.927v-8.437H7.078v-3.49h3.047V9.41c0-3.025 1.792-4.697 4.533-4.697 1.312 0 2.686.236 2.686.236v2.975h-1.513c-1.491 0-1.956.93-1.956 1.883v2.256h3.328l-.532 3.49h-2.796v8.437C19.612 23.104 24 18.105 24 12.073z"/>
              </svg>
            </div>
            <h2 className="text-sm font-semibold text-gray-900">Facebook Pages</h2>
            {facebookAccounts.length > 0 && (
              <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-600">
                {facebookAccounts.length}
              </span>
            )}
          </div>

          {facebookAccounts.length === 0 ? (
            <EmptyState canManage={canManage} />
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {facebookAccounts.map((account) => (
                <ConnectedPageCard
                  key={account.id}
                  account={account}
                  canManage={canManage}
                  onRefresh={handleRefresh}
                />
              ))}
            </div>
          )}
        </>
      )}

      {/* ── LinkedIn section ─────────────────────────────────────────────── */}
      {!loading && (
        <>
          {/* Section header */}
          <div className="flex items-center gap-2">
            <div className="flex h-6 w-6 items-center justify-center rounded-lg bg-[#0A66C2]">
              <svg className="h-3.5 w-3.5 text-white" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
                <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433c-1.144 0-2.063-.926-2.063-2.065 0-1.138.92-2.063 2.063-2.063 1.14 0 2.064.925 2.064 2.063 0 1.139-.925 2.065-2.064 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z"/>
              </svg>
            </div>
            <h2 className="text-sm font-semibold text-gray-900">LinkedIn Organizations</h2>
            {linkedinAccounts.length > 0 && (
              <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-600">
                {linkedinAccounts.length}
              </span>
            )}
          </div>

          {linkedinAccounts.length === 0 ? (
            <div className="flex flex-col items-center gap-5 rounded-2xl border-2 border-dashed border-gray-200 bg-gray-50/50 py-16 text-center">
              <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-[#0A66C2]/10">
                <svg className="h-7 w-7 text-[#0A66C2]" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
                  <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433c-1.144 0-2.063-.926-2.063-2.065 0-1.138.92-2.063 2.063-2.063 1.14 0 2.064.925 2.064 2.063 0 1.139-.925 2.065-2.064 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z"/>
                </svg>
              </div>
              <div>
                <p className="text-base font-semibold text-gray-900">No LinkedIn organizations connected</p>
                <p className="mt-1 max-w-xs text-sm text-muted-foreground">
                  Connect a LinkedIn organization to enable publishing automation.
                </p>
              </div>
              {canManage && <ConnectLinkedInButton />}
            </div>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {linkedinAccounts.map((account) => (
                <ConnectedPageCard
                  key={account.id}
                  account={account}
                  canManage={canManage}
                  onRefresh={handleRefresh}
                />
              ))}
            </div>
          )}
        </>
      )}

      {/* ── Future platforms placeholder ─────────────────────────────── */}
      {!loading && (
        <div className="space-y-3">
          {[
            { name: 'Instagram', color: '#E1306C', coming: true },
            { name: 'Twitter/X', color: '#000000', coming: true },
          ].map((platform) => (
              <div
                key={platform.name}
                className="flex items-center justify-between rounded-xl border border-dashed border-gray-200 bg-gray-50/50 px-4 py-3"
              >
                <div className="flex items-center gap-3">
                  <div
                    className="flex h-8 w-8 items-center justify-center rounded-lg"
                    style={{ background: platform.color + '15' }}
                  >
                    <Wifi size={14} style={{ color: platform.color }} aria-hidden />
                  </div>
                  <div>
                    <p className="text-sm font-medium text-gray-700">{platform.name}</p>
                    <p className="text-xs text-muted-foreground">Coming soon</p>
                  </div>
                </div>
                <span className="rounded-full bg-gray-100 px-2.5 py-1 text-xs font-medium text-gray-500">
                  Planned
                </span>
              </div>
            ))}
          </div>
      )}
    </div>
  );
}
