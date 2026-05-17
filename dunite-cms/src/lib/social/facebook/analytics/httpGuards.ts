import { type NextRequest } from 'next/server';

import { createAuthenticatedSupabaseServerClient } from '@/lib/supabase/server';
import {
  type OrgPublishGate,
  canExportFacebookAnalytics,
  canManageFacebookAnalyticsSync,
  canViewFacebookAnalytics,
  resolveOrgPublishGate,
} from '@/lib/org/publishGate';
import { failJson } from '@/lib/social/http/apiResponse';
export type FacebookAnalyticsGateResult =
  | { ok: true; userId: string; gate: OrgPublishGate }
  | { ok: false; response: ReturnType<typeof failJson> };

export async function resolveFacebookAnalyticsGate(): Promise<FacebookAnalyticsGateResult> {
  try {
    const auth = await createAuthenticatedSupabaseServerClient();
    const gate = await resolveOrgPublishGate(auth.user.id);

    if (!gate || !canViewFacebookAnalytics(gate)) {
      return { ok: false, response: failJson('Insufficient permissions.', 403, 'forbidden') };
    }

    return { ok: true, userId: auth.user.id, gate };
  } catch {
    return { ok: false, response: failJson('Not authenticated.', 401, 'unauthorized') };
  }
}

export type FacebookAnalyticsApiCapabilities = {
  export: boolean;
  manageSync: boolean;
};

export function facebookAnalyticsCapabilities(gate: OrgPublishGate): FacebookAnalyticsApiCapabilities {
  return {
    export:     canExportFacebookAnalytics(gate),
    manageSync: canManageFacebookAnalyticsSync(gate),
  };
}

export function parseSearch(req: NextRequest): URLSearchParams {
  return new URL(req.url).searchParams;
}
