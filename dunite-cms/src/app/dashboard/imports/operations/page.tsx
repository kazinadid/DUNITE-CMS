import { requireUser } from '@/features/auth/server';
import { ImportOperationsDashboard } from '@/features/imports/operations/ImportOperationsDashboard';

export const dynamic = 'force-dynamic';

export default async function ImportOperationsPage() {
  const auth = await requireUser();
  return <ImportOperationsDashboard role={auth.role} />;
}
