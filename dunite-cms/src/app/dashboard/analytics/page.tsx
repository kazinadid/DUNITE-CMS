import { redirect } from 'next/navigation';

export const dynamic = 'force-dynamic';

export default function AnalyticsIndexRedirectPage() {
  redirect('/dashboard/analytics/overview');
}
