import { NextRequest } from 'next/server';
import { handleLinkedInOAuthCallback } from '@/features/integrations/server/linkedin.routes';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  return handleLinkedInOAuthCallback(req);
}
