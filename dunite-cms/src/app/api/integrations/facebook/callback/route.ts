import { NextRequest } from 'next/server';
import { handleFacebookOAuthCallback } from '@/features/integrations/server/facebook.routes';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  return handleFacebookOAuthCallback(req);
}
