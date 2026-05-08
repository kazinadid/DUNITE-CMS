'use client';

import { KeyRound, Loader2 } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useMemo, useState, type FormEvent } from 'react';

import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
} from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { AuthErrorBanner, AuthSuccessBanner } from '@/features/auth/components/AuthAlerts';
import { requestPasswordReset } from '@/features/auth/services/authService';
import {
  authCardClass,
  authLinkClass,
  authPrimaryButtonClass,
} from '@/features/auth/ui/authBrandClasses';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Password recovery request — uses Supabase `resetPasswordForEmail` (same project config).
 * Does not reveal whether the email exists (generic success copy).
 */
export function ForgotPasswordForm() {
  const router = useRouter();
  const [email, setEmail]       = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError]       = useState<string | null>(null);
  const [sent, setSent]         = useState(false);

  const emailInvalid = useMemo(() => {
    if (email.trim() === '') return false;
    return !EMAIL_RE.test(email.trim());
  }, [email]);

  const isDisabled = submitting || !EMAIL_RE.test(email.trim());

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (isDisabled) return;

    setError(null);
    setSubmitting(true);

    const { error: resetError } = await requestPasswordReset(email.trim());

    if (resetError) {
      setError(resetError);
      setSubmitting(false);
      return;
    }

    setSent(true);
    setSubmitting(false);
  }

  if (sent) {
    return (
      <Card className={authCardClass()}>
        <CardHeader className="space-y-2 border-b border-gray-100/90 px-6 pb-5 pt-6 text-center">
          <h1 className="text-xl font-semibold tracking-tight text-gray-900">Check your email</h1>
          <CardDescription className="text-sm text-gray-600">
            If an account exists for <strong className="text-gray-800">{email}</strong>, we sent a link
            to reset your password. You can close this tab.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4 px-6 pb-6 pt-4">
          <AuthSuccessBanner message="Request received. Follow the link in the email to finish resetting your password." />
          <Button
            type="button"
            variant="outline"
            className="h-11 w-full rounded-xl border-gray-200"
            onClick={() => router.push('/login')}
          >
            Back to sign in
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className={authCardClass()}>
      <CardHeader className="space-y-1 border-b border-gray-100/90 bg-gradient-to-r from-white to-gray-50/80 px-6 pb-5 pt-6 text-center">
        <div className="mx-auto mb-2 flex size-12 items-center justify-center rounded-2xl bg-gradient-to-br from-[#7A0000] to-[#4A0000] text-white shadow-lg shadow-[#7A0000]/25">
          <KeyRound className="size-6" aria-hidden />
        </div>
        <h1 className="text-xl font-semibold tracking-tight text-gray-900 md:text-2xl">
          Reset password
        </h1>
        <CardDescription className="text-sm text-gray-600">
          We&apos;ll email you a secure link to choose a new password.
        </CardDescription>
      </CardHeader>

      <CardContent className="px-6 pb-6 pt-5">
        <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-5">
          <div className="flex flex-col gap-1.5">
            <label htmlFor="forgot-email" className="text-sm font-medium text-gray-800">
              Email
            </label>
            <Input
              id="forgot-email"
              type="email"
              autoComplete="email"
              inputMode="email"
              placeholder="you@company.com"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              disabled={submitting}
              className="h-11 rounded-xl border-gray-200"
              aria-invalid={emailInvalid}
            />
            {emailInvalid ? (
              <p className="text-xs text-red-600">Enter a valid email address.</p>
            ) : null}
          </div>

          {error ? <AuthErrorBanner message={error} /> : null}

          <Button
            type="submit"
            size="lg"
            disabled={isDisabled}
            className={authPrimaryButtonClass()}
          >
            {submitting ? (
              <>
                <Loader2 className="size-4 animate-spin" aria-hidden />
                Sending…
              </>
            ) : (
              'Send reset link'
            )}
          </Button>

          <p className="text-center text-sm text-gray-600">
            Remember your password?{' '}
            <Link href="/login" className={authLinkClass()}>
              Sign in
            </Link>
          </p>
        </form>
      </CardContent>
    </Card>
  );
}
