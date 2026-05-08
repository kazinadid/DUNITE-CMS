import { AuthBrand } from '@/features/auth/components/AuthBrand';
import { AuthShell } from '@/features/auth/components/AuthShell';
import { ForgotPasswordForm } from '@/features/auth';

export const metadata = {
  title: 'Reset password — DUNITE CMS',
  description: 'Reset your DUNITE CMS password',
};

export default function ForgotPasswordPage() {
  return (
    <AuthShell>
      <AuthBrand subtitle="Account recovery" />
      <ForgotPasswordForm />
    </AuthShell>
  );
}
