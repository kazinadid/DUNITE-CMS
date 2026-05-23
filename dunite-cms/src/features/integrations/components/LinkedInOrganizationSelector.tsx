'use client';

// ============================================================================
// DUNITE CMS — LinkedIn Organization selector (post-OAuth org selection UI)
// ============================================================================

import {
  CheckCircle2,
  ChevronRight,
  ExternalLink,
  Loader2,
  Building2,
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
import type { PendingLinkedInOrganization } from '../types';

interface AvailableOrganization {
  id: string;           // organization URN
  name: string;
  logo_url: string | null;
  already_connected: boolean;
}

interface LinkedInOrganizationSelectorProps {
  stateId: string;
}

export function LinkedInOrganizationSelector({ stateId }: LinkedInOrganizationSelectorProps) {
  const router = useRouter();

  const [orgs, setOrgs] = useState<AvailableOrganization[]>([]);
  const [oauthOrgCount, setOauthOrgCount] = useState(0);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const connectableOrgs = useMemo(
    () => orgs.filter((o) => !o.already_connected),
    [orgs],
  );

  useEffect(() => {
    async function load() {
      try {
        const res = await getPageSelectionStateAction(stateId);
        if (!res.ok) {
          setError(res.error);
          setLoading(false);
          return;
        }

        // Transform organizations from metadata
        const metadata = res.data as { organizations?: PendingLinkedInOrganization[] };
        const organizations = (metadata.organizations || []).map((org) => ({
          id: org.urn,
          name: org.name,
          logo_url: org.logo_url,
          already_connected: false, // Will be checked backend-side
        }));
        
        setOrgs(organizations);
        setOauthOrgCount(organizations.length);

        const connectable = organizations.filter((o) => !o.already_connected);
        if (connectable.length === 1) {
          setSelected(new Set([connectable[0].id]));
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load organizations');
      } finally {
        setLoading(false);
      }
    }
    void load();
  }, [stateId]);

  function toggleOrg(orgId: string) {
    const org = orgs.find((o) => o.id === orgId);
    if (org?.already_connected) return;

    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(orgId)) next.delete(orgId);
      else next.add(orgId);
      return next;
    });
  }

  async function handleSave() {
    if (selected.size === 0) {
      toast.warning('Select at least one organization to connect.');
      return;
    }

    setSaving(true);
    
    // Reuse the same action - it handles platform detection
    const res = await selectFacebookPagesAction(stateId, Array.from(selected));

    if (res.ok) {
      if (res.data.skipped.length > 0) {
        toast.message(
          `${res.data.skipped.length} organization(s) skipped (already connected or could not save).`,
        );
      }
      
      toast.success(`${res.data.connected.length} LinkedIn organization(s) connected!`);
      router.push('/dashboard/integrations');
      router.refresh();
    } else {
      toast.error(res.error);
    }

    setSaving(false);
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-6">
        <p className="text-sm text-destructive">{error}</p>
        <Button
          variant="outline"
          className="mt-4"
          onClick={() => router.push('/dashboard/integrations')}
        >
          Back to Integrations
        </Button>
      </div>
    );
  }

  if (orgs.length === 0) {
    return (
      <div className="rounded-lg border p-6 text-center">
        <Building2 className="mx-auto mb-3 h-12 w-12 text-muted-foreground" />
        <h3 className="text-lg font-semibold">No organizations found</h3>
        <p className="mt-1 text-sm text-muted-foreground">
          You don&apos;t have admin access to any LinkedIn organizations.
        </p>
        <Button
          variant="outline"
          className="mt-4"
          onClick={() => router.push('/dashboard/integrations')}
        >
          Back to Integrations
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Summary */}
      <div className="rounded-lg border bg-card p-4">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium">
              {oauthOrgCount} LinkedIn organization{oauthOrgCount !== 1 ? 's' : ''} authorized
            </p>
            <p className="text-xs text-muted-foreground">
              {connectableOrgs.length} available to connect
            </p>
          </div>
          <ChevronRight className="h-5 w-5 text-muted-foreground" />
        </div>
      </div>

      {/* Organization List */}
      <div className="space-y-3">
        {orgs.map((org) => {
          const isSelected = selected.has(org.id);
          const isDisabled = org.already_connected;

          return (
            <button
              key={org.id}
              type="button"
              disabled={isDisabled}
              onClick={() => toggleOrg(org.id)}
              className={cn(
                'w-full rounded-lg border p-4 text-left transition-all',
                isDisabled
                  ? 'cursor-not-allowed opacity-60'
                  : 'cursor-pointer hover:border-primary/50 hover:bg-accent/50',
                isSelected && 'border-primary bg-primary/5',
              )}
            >
              <div className="flex items-start gap-3">
                {/* Logo */}
                <div className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-muted">
                  {org.logo_url ? (
                    <Image
                      src={org.logo_url}
                      alt={org.name}
                      width={48}
                      height={48}
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <Building2 className="h-6 w-6 text-muted-foreground" />
                  )}
                </div>

                {/* Info */}
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <p className="truncate font-medium">{org.name}</p>
                    {org.already_connected && (
                      <span className="inline-flex items-center rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-medium text-primary">
                        Connected
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    LinkedIn Organization
                  </p>
                </div>

                {/* Checkbox */}
                <div className="shrink-0">
                  {isSelected ? (
                    <CheckCircle2 className="h-6 w-6 text-primary" />
                  ) : (
                    <div className="h-6 w-6 rounded-full border-2 border-muted-foreground/30" />
                  )}
                </div>
              </div>
            </button>
          );
        })}
      </div>

      {/* Actions */}
      <div className="flex items-center justify-between gap-3 border-t pt-4">
        <Button
          variant="outline"
          onClick={() => router.push('/dashboard/integrations')}
          disabled={saving}
        >
          Cancel
        </Button>

        <Button
          onClick={handleSave}
          disabled={saving || selected.size === 0}
        >
          {saving ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Connecting...
            </>
          ) : (
            <>
              Connect {selected.size} {selected.size === 1 ? 'Organization' : 'Organizations'}
              <ChevronRight className="ml-2 h-4 w-4" />
            </>
          )}
        </Button>
      </div>
    </div>
  );
}
