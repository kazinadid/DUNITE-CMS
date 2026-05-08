import { AuthBrand } from '@/features/auth/components/AuthBrand';
import { AuthShell } from '@/features/auth/components/AuthShell';
import { SignupForm } from '@/features/auth';

export const metadata = {
  title: 'Create account — DUNITE CMS',
  description: 'Create a DUNITE CMS workspace account',
};

export default function SignupPage() {
  return (
    <AuthShell>
      <AuthBrand subtitle="Create account" />
      <SignupForm />
    </AuthShell>
  );
}
