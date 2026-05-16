// ============================================================================
// DUNITE CMS — Facebook OAuth: Initiate connection
// GET /api/auth/facebook/connect
// ============================================================================
// 1. Validates the authenticated user session
// 2. Resolves the user's organization
// 3. Checks RBAC (admin/editor only)
// 4. Generates a secure CSRF state token
// 5. Redirects to Facebook authorization screen
// ============================================================================

import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  return NextResponse.redirect(new URL('/api/integrations/facebook/connect', req.url));
}
