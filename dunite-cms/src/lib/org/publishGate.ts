import 'server-only';

import { createSupabaseServiceRoleClient } from '@/lib/supabase/server';

export interface OrgPublishGate {
  userId: string;
  organizationId: string;
  /** organization_members.role: admin | editor | viewer */
  orgRole: string;
  /** organizations.owner_id === userId */
  isOrgOwner: boolean;
  isSuperAdmin: boolean;
  /** public.users.role */
  globalRole: string;
}

export async function resolveOrgPublishGate(
  userId: string,
): Promise<OrgPublishGate | null> {
  const supabase = createSupabaseServiceRoleClient();

  const { data: mem } = await supabase
    .from('organization_members')
    .select('organization_id, role')
    .eq('user_id', userId)
    .order('joined_at', { ascending: true })
    .limit(1)
    .maybeSingle();

  if (!mem?.organization_id) return null;

  const { data: org } = await supabase
    .from('organizations')
    .select('owner_id')
    .eq('id', mem.organization_id)
    .maybeSingle();

  const { data: userRow } = await supabase
    .from('users')
    .select('role, platform_role')
    .eq('id', userId)
    .maybeSingle();

  return {
    userId,
    organizationId: mem.organization_id as string,
    orgRole:        mem.role as string,
    isOrgOwner:     org?.owner_id === userId,
    isSuperAdmin:   userRow?.platform_role === 'super_admin',
    globalRole:     (userRow?.role as string) ?? 'viewer',
  };
}

/** Immediate “publish now” to Facebook Graph — org admin / org owner / global admin / platform super-admin. */
export function canFacebookPublishImmediately(g: OrgPublishGate): boolean {
  return (
    g.isSuperAdmin ||
    g.globalRole === 'admin' ||
    g.isOrgOwner ||
    g.orgRole === 'admin'
  );
}

export function canFacebookScheduleOrRetry(g: OrgPublishGate): boolean {
  return canFacebookPublishImmediately(g) || g.orgRole === 'editor';
}

/** Spec-aligned helpers for API / future UI composition. */
export function canPublishPosts(g: OrgPublishGate): boolean {
  return canFacebookScheduleOrRetry(g);
}

export const canSchedulePosts = canFacebookScheduleOrRetry;

export const canRetryFailedPosts = canFacebookScheduleOrRetry;

export function canManageSocialAccounts(g: OrgPublishGate): boolean {
  return (
    g.isSuperAdmin ||
    g.globalRole === 'admin' ||
    g.orgRole === 'admin' ||
    g.isOrgOwner
  );
}

/** Editors + viewers can view Facebook analytics KPIs scoped to membership. */
export function canViewFacebookAnalytics(g: OrgPublishGate): boolean {
  return (
    g.isSuperAdmin ||
    g.globalRole === 'admin' ||
    ['admin', 'editor', 'viewer'].includes(g.orgRole)
  );
}

export function canExportFacebookAnalytics(g: OrgPublishGate): boolean {
  return (
    g.isSuperAdmin ||
    g.globalRole === 'admin' ||
    g.isOrgOwner ||
    g.orgRole === 'admin'
  );
}

export function canManageFacebookAnalyticsSync(g: OrgPublishGate): boolean {
  return canExportFacebookAnalytics(g);
}

/** Platform super-admin: cross-tenant monitoring hooks (UI + future global APIs). */
export function isPlatformSuperAdmin(g: OrgPublishGate): boolean {
  return g.isSuperAdmin === true;
}

/**
 * Organization admin (or owner) — manual analytics refresh, sync center, reconnect flows.
 * Editors/viewers are read-only for analytics data; viewers rely on same read gate with tighter export rules.
 */
export function isOrganizationAnalyticsAdmin(g: OrgPublishGate): boolean {
  return g.isOrgOwner || g.orgRole === 'admin';
}

/** Read-only analytics (charts, post/page breakdowns). */
export function canReadFacebookAnalyticsDetails(g: OrgPublishGate): boolean {
  return canViewFacebookAnalytics(g);
}
