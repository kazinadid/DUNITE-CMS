'use client';

import { AlertCircle, CheckCircle2, Loader2, UserPlus } from 'lucide-react';
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
import { AuthErrorBanner } from '@/features/auth/components/AuthAlerts';
import {
  authCardClass,
  authLinkClass,
  authPrimaryButtonClass,
} from '@/features/auth/ui/authBrandClasses';
import { SIGNUP_PASSWORD_MIN_LENGTH } from '@/features/auth/types';
import { useAuth } from '@/hooks/useAuth';

import { PasswordInput } from './PasswordInput';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function getPasswordStrength(pw: string): 'weak' | 'fair' | 'strong' | null {
  if (!pw) return null;
  const hasLetter = /[a-zA-Z]/.test(pw);
  const hasNumber = /[0-9]/.test(pw);
  const hasSpecial = /[^a-zA-Z0-9]/.test(pw);
  const score = (hasLetter ? 1 : 0) + (hasNumber ? 1 : 0) + (hasSpecial ? 1 : 0);
  if (pw.length < SIGNUP_PASSWORD_MIN_LENGTH) return 'weak';
  if (score === 1) return 'weak';
  if (score === 2) return 'fair';
  return 'strong';
}

const strengthMeta = {
  weak:   { label: 'Weak',   bars: 1, color: 'bg-red-500' },
  fair:   { label: 'Fair',   bars: 2, color: 'bg-amber-400' },
  strong: { label: 'Strong', bars: 3, color: 'bg-emerald-500' },
} as const;

export function SignupForm() {
  const router   = useRouter();
  const { signUp } = useAuth();

  const [fullName, setFullName] = useState('');
  const [email, setEmail]         = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm]   = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError]         = useState<string | null>(null);

  const passwordsMatch =
    password !== '' && confirm !== '' && password === confirm;
  const strength = getPasswordStrength(password);

  const emailInvalid = useMemo(() => {
    if (email.trim() === '') return false;
    return !EMAIL_RE.test(email.trim());
  }, [email]);

  const nameInvalid = useMemo(() => {
    if (fullName.trim() === '') return false;
    return fullName.trim().length < 2;
  }, [fullName]);

  const isDisabled =
    submitting ||
    fullName.trim().length < 2 ||
    !EMAIL_RE.test(email.trim()) ||
    password.length < SIGNUP_PASSWORD_MIN_LENGTH ||
    password !== confirm;

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (isDisabled) return;

    setError(null);
    setSubmitting(true);

    const result = await signUp({
      email:    email.trim(),
      password,
      fullName: fullName.trim(),
    });

    if (result.error) {
      setError(result.error);
      setSubmitting(false);
      return;
    }

    if (result.hasSession) {
      router.replace('/dashboard');
      router.refresh();
      return;
    }

    router.replace('/login?registered=1');
    router.refresh();
  }

  return (
    <Card className={authCardClass()}>
      <CardHeader className="space-y-1 border-b border-gray-100/90 bg-gradient-to-r from-white to-gray-50/80 px-6 pb-5 pt-6 text-center">
        <div className="mx-auto mb-2 flex size-12 items-center justify-center rounded-2xl bg-gradient-to-br from-[#7A0000] to-[#4A0000] text-white shadow-lg shadow-[#7A0000]/25">
          <UserPlus className="size-6" aria-hidden />
        </div>
        <h1 className="text-xl font-semibold tracking-tight text-gray-900 md:text-2xl">
          Create your account
        </h1>
        <CardDescription className="text-sm text-gray-600">
          You&apos;ll start with viewer access — admins can promote roles as needed.
        </CardDescription>
      </CardHeader>

      <CardContent className="px-6 pb-6 pt-5">
        <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-5">
          <div className="flex flex-col gap-1.5">
            <label htmlFor="signup-name" className="text-sm font-medium text-gray-800">
              Full name
            </label>
            <Input
              id="signup-name"
              type="text"
              autoComplete="name"
              placeholder="Ada Lovelace"
              required
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              disabled={submitting}
              className="h-11 rounded-xl border-gray-200"
              aria-invalid={nameInvalid}
            />
            {nameInvalid ? (
              <p className="text-xs text-red-600">Please enter at least 2 characters.</p>
            ) : null}
          </div>

          <div className="flex flex-col gap-1.5">
            <label htmlFor="signup-email" className="text-sm font-medium text-gray-800">
              Work email
            </label>
            <Input
              id="signup-email"
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

          <div className="flex flex-col gap-2">
            <PasswordInput
              id="signup-password"
              label="Password"
              autoComplete="new-password"
              placeholder={`At least ${SIGNUP_PASSWORD_MIN_LENGTH} characters`}
              required
              minLength={SIGNUP_PASSWORD_MIN_LENGTH}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              disabled={submitting}
              className="h-11 rounded-xl border-gray-200"
            />
            <p className="text-xs text-gray-500">
              Use at least {SIGNUP_PASSWORD_MIN_LENGTH} characters — mix letters, numbers, and symbols
              for a stronger password.
            </p>
            {strength ? (
              <div className="flex items-center gap-2">
                <div className="flex flex-1 gap-1">
                  {([1, 2, 3] as const).map((bar) => (
                    <div
                      key={bar}
                      className={[
                        'h-1 flex-1 rounded-full transition-colors duration-300',
                        bar <= strengthMeta[strength].bars
                          ? strengthMeta[strength].color
                          : 'bg-gray-200',
                      ].join(' ')}
                    />
                  ))}
                </div>
                <span className="text-xs text-gray-500">{strengthMeta[strength].label}</span>
              </div>
            ) : null}
          </div>

          <PasswordInput
            id="signup-confirm"
            label="Confirm password"
            autoComplete="new-password"
            placeholder="Repeat password"
            required
            minLength={SIGNUP_PASSWORD_MIN_LENGTH}
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            disabled={submitting}
            className="h-11 rounded-xl border-gray-200"
          />
          {confirm ? (
            <p
              className={[
                'flex items-center gap-1.5 text-xs',
                passwordsMatch ? 'text-emerald-600' : 'text-red-600',
              ].join(' ')}
            >
              {passwordsMatch ? (
                <>
                  <CheckCircle2 className="size-3.5 shrink-0" aria-hidden />
                  Passwords match
                </>
              ) : (
                <>
                  <AlertCircle className="size-3.5 shrink-0" aria-hidden />
                  Passwords must match
                </>
              )}
            </p>
          ) : null}

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
                Creating account…
              </>
            ) : (
              'Create account'
            )}
          </Button>

          <p className="text-center text-sm text-gray-600">
            Already registered?{' '}
            <Link href="/login" className={authLinkClass()}>
              Sign in
            </Link>
          </p>
        </form>
      </CardContent>
    </Card>
  );
}
