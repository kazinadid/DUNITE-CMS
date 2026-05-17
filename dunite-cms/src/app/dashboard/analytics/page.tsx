import { requireUser } from '@/features/auth/server';
import { AnalyticsDashboardClient } from '@/features/analytics/components/AnalyticsDashboardClient';

export const dynamic = 'force-dynamic';

export default async function AnalyticsPage() {
  const auth = await requireUser();
  return <AnalyticsDashboardClient userRole={auth.role} />;
}
