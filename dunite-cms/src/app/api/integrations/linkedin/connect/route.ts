import { NextRequest } from 'next/server';
import { startLinkedInOAuth } from '@/features/integrations/server/linkedin.routes';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  return startLinkedInOAuth(req);
}
