import { requireWriter } from '@/features/auth/server';

import { ComposeForm } from './ComposeForm';

export default async function ComposePage() {
  await requireWriter(); // viewer → /dashboard
  return <ComposeForm />;
}
