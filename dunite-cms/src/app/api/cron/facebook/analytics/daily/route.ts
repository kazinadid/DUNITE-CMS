import { handleFacebookAnalyticsDailyHttp } from '@/lib/social/facebook/analytics/cronHttpDaily';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  return handleFacebookAnalyticsDailyHttp(request);
}
