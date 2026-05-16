// ============================================================================
// DUNITE CMS — Facebook OAuth: Callback handler
// GET /api/auth/facebook/callback?code=...&state=...
// ============================================================================
// 1. Validates CSRF state token (anti-replay + CSRF protection)
// 2. Exchanges authorization code for short-lived token
// 3. Upgrades to long-lived token (server-side)
// 4. Fetches and normalizes authorized Pages (encrypts page tokens immediately)
// 5. Stores encrypted tokens + pages in oauth_state metadata
// 6. Redirects to page selection UI
// ============================================================================

import { NextRequest } from 'next/server';
import { handleFacebookOAuthCallback } from '@/features/integrations/server/facebook.routes';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  return handleFacebookOAuthCallback(req);
}
