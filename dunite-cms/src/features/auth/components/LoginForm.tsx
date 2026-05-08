'use client';

import { Loader2, LogIn } from 'lucide-react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useMemo, useState, type FormEvent } from 'react';

import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
} from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { AuthErrorBanner, AuthInfoBanner, AuthSuccessBanner } from '@/features/auth/components/AuthAlerts';
import {
  authCardClass,
  authLinkClass,
  authMutedLinkClass,
  authPrimaryButtonClass,
} from '@/features/auth/ui/authBrandClasses';
import { useAuth } from '@/hooks/useAuth';

import { PasswordInput } from './PasswordInput';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function LoginForm() {
  const router   = useRouter();
  const params   = useSearchParams();
  const { signIn } = useAuth();

  const [email, setEmail]     = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError]     = useState<string | null>(null);

  const registered = params.get('registered') === '1';
  const resetOk    = params.get('reset') === 'complete';

  const isDisabled = submitting || !EMAIL_RE.test(email.trim()) || password.length < 1;

  const emailInvalid = useMemo(() => {
    if (email.trim() === '') return false;
    return !EMAIL_RE.test(email.trim());
  }, [email]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (isDisabled) return;

    setError(null);
    setSubmitting(true);

    const { error: signInError } = await signIn(email.trim(), password);

    if (signInError) {
      setError(signInError);
      setSubmitting(false);
      return;
    }

    const next = params.get('next') ?? '/dashboard';
    router.replace(next.startsWith('/') ? next : '/dashboard');
    router.refresh();
  }

  return (
    <Card className={authCardClass()}>
      <CardHeader className="space-y-1 border-b border-gray-100/90 bg-gradient-to-r from-white to-gray-50/80 px-6 pb-5 pt-6 text-center">
        <div className="mx-auto mb-2 flex size-12 items-center justify-center rounded-2xl bg-gradient-to-br from-[#7A0000] to-[#4A0000] text-white shadow-lg shadow-[#7A0000]/25">
          <LogIn className="size-6" aria-hidden />
        </div>
        <h1 className="text-xl font-semibold tracking-tight text-gray-900 md:text-2xl">
          Welcome back
        </h1>
        <CardDescription className="text-sm text-gray-600">
          Sign in to continue to your workspace.
        </CardDescription>
      </CardHeader>

      <CardContent className="px-6 pb-6 pt-5">
        <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-5">
          {registered ? (
            <AuthSuccessBanner message="Account created. If email confirmation is on, check your inbox — otherwise you can sign in below." />
          ) : null}
          {resetOk ? (
            <AuthInfoBanner message="You can now sign in with your new password." />
          ) : null}

          <div className="flex flex-col gap-1.5">
            <label htmlFor="login-email" className="text-sm font-medium text-gray-800">
              Email
            </label>
            <Input
              id="login-email"
              type="email"
              autoComplete="email"
              inputMode="email"
              placeholder="you@company.com"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              disabled={submitting}
              className="h-11 rounded-xl border-gray-200 transition-shadow focus-visible:border-[#7A0000]/40 focus-visible:ring-[#7A0000]/20"
              aria-invalid={emailInvalid}
              aria-describedby={emailInvalid ? 'login-email-err' : undefined}
            />
            {emailInvalid ? (
              <p id="login-email-err" className="text-xs text-red-600">
                Enter a valid email address.
              </p>
            ) : null}
          </div>

          <div className="flex flex-col gap-1">
            <div className="flex items-center justify-between gap-2">
              <label htmlFor="login-password" className="text-sm font-medium text-gray-800">
                Password
              </label>
              <Link href="/forgot-password" className={authMutedLinkClass()}>
                Forgot password?
              </Link>
            </div>
            <PasswordInput
              id="login-password"
              autoComplete="current-password"
              placeholder="Enter your password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              disabled={submitting}
              className="h-11 rounded-xl border-gray-200"
            />
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
                Signing in…
              </>
            ) : (
              'Sign in'
            )}
          </Button>

          <p className="text-center text-sm text-gray-600">
            No account?{' '}
            <Link href="/signup" className={authLinkClass()}>
              Create one
            </Link>
          </p>
        </form>
      </CardContent>
    </Card>
  );
}
