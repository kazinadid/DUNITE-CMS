import { requireWriter } from '@/features/auth/server';

import { ComposeForm } from './ComposeForm';

export default async function ComposePage() {
  const auth = await requireWriter();
  return <ComposeForm userRole={auth.role} />;
}
