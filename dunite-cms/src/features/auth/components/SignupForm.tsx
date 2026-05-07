'use client';

import { AlertCircle, CheckCircle2, Loader2, UserPlus } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';

import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { useAuth } from '@/hooks/useAuth';

import { PasswordInput } from './PasswordInput';

function getPasswordStrength(pw: string): 'weak' | 'fair' | 'strong' | null {
  if (!pw) return null;
  const hasLetter = /[a-zA-Z]/.test(pw);
  const hasNumber = /[0-9]/.test(pw);
  const hasSpecial = /[^a-zA-Z0-9]/.test(pw);
  const score = (hasLetter ? 1 : 0) + (hasNumber ? 1 : 0) + (hasSpecial ? 1 : 0);
  if (pw.length < 6) return 'weak';
  if (score === 1) return 'weak';
  if (score === 2) return 'fair';
  return 'strong';
}

const strengthMeta = {
  weak:   { label: 'Weak',   bars: 1, color: 'bg-destructive' },
  fair:   { label: 'Fair',   bars: 2, color: 'bg-amber-400'   },
  strong: { label: 'Strong', bars: 3, color: 'bg-emerald-500' },
} as const;

export function SignupForm() {
  const router = useRouter();
  const { signUp } = useAuth();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  const passwordsMatch = password !== '' && confirm !== '' && password === confirm;
  const strength = getPasswordStrength(password);
  const isDisabled =
    submitting ||
    email.trim() === '' ||
    password.length < 6 ||
    password !== confirm;

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (isDisabled) return;

    setError(null);
    setInfo(null);
    setSubmitting(true);

    const { error: signUpError } = await signUp(email.trim(), password);

    if (signUpError) {
      setError(signUpError);
      setSubmitting(false);
      return;
    }

    setInfo('Account created! Check your inbox if confirmation is required.');
    setSubmitting(false);
    router.replace('/dashboard');
    router.refresh();
  }

  return (
    <Card className="w-full max-w-md shadow-xl ring-0">
      <CardHeader className="space-y-1 pb-6 text-center">
        <div className="mx-auto mb-3 flex size-12 items-center justify-center rounded-xl bg-primary/8">
          <UserPlus className="size-6 text-primary" />
        </div>
        <CardTitle className="text-2xl font-semibold tracking-tight">
          Create your account
        </CardTitle>
        <CardDescription className="text-sm text-muted-foreground">
          Sign up to get started — free forever
        </CardDescription>
      </CardHeader>

      <CardContent>
        <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-5">
          {/* Email */}
          <div className="flex flex-col gap-1.5">
            <label
              htmlFor="email"
              className="text-sm font-medium leading-none"
            >
              Email address
            </label>
            <Input
              id="email"
              type="email"
              autoComplete="email"
              placeholder="you@example.com"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              disabled={submitting}
              className="h-10"
            />
          </div>

          {/* Password + strength meter */}
          <div className="flex flex-col gap-2">
            <PasswordInput
              id="password"
              label="Password"
              autoComplete="new-password"
              placeholder="••••••••"
              required
              minLength={6}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              disabled={submitting}
              className="h-10"
            />

            {/* Strength meter */}
            {strength && (
              <div className="flex items-center gap-2">
                <div className="flex flex-1 gap-1">
                  {([1, 2, 3] as const).map((bar) => (
                    <div
                      key={bar}
                      className={[
                        'h-1 flex-1 rounded-full transition-colors',
                        bar <= strengthMeta[strength].bars
                          ? strengthMeta[strength].color
                          : 'bg-muted',
                      ].join(' ')}
                    />
                  ))}
                </div>
                <span className="text-xs text-muted-foreground">
                  {strengthMeta[strength].label}
                </span>
              </div>
            )}
          </div>

          {/* Confirm password */}
          <div className="flex flex-col gap-1.5">
            <PasswordInput
              id="confirm"
              label="Confirm password"
              autoComplete="new-password"
              placeholder="••••••••"
              required
              minLength={6}
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              disabled={submitting}
              className="h-10"
            />
            {/* Match indicator */}
            {confirm && (
              <p
                className={[
                  'flex items-center gap-1.5 text-xs',
                  passwordsMatch ? 'text-emerald-600' : 'text-destructive',
                ].join(' ')}
              >
                {passwordsMatch ? (
                  <>
                    <CheckCircle2 className="size-3.5" aria-hidden />
                    Passwords match
                  </>
                ) : (
                  <>
                    <AlertCircle className="size-3.5" aria-hidden />
                    Passwords do not match
                  </>
                )}
              </p>
            )}
          </div>

          {/* Error */}
          {error && (
            <div
              role="alert"
              className="flex items-start gap-2.5 rounded-lg border border-destructive/25 bg-destructive/8 px-3.5 py-3 text-sm text-destructive"
            >
              <AlertCircle className="mt-px size-4 shrink-0" aria-hidden />
              <span>{error}</span>
            </div>
          )}

          {/* Success / info */}
          {info && (
            <div
              role="status"
              className="flex items-start gap-2.5 rounded-lg border border-emerald-200 bg-emerald-50 px-3.5 py-3 text-sm text-emerald-700 dark:border-emerald-800/50 dark:bg-emerald-900/20 dark:text-emerald-400"
            >
              <CheckCircle2 className="mt-px size-4 shrink-0" aria-hidden />
              <span>{info}</span>
            </div>
          )}

          {/* Submit */}
          <Button
            type="submit"
            size="lg"
            disabled={isDisabled}
            className="mt-1 w-full gap-2"
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

          {/* Footer link */}
          <p className="text-center text-sm text-muted-foreground">
            Already have an account?{' '}
            <Link
              href="/login"
              className="font-medium text-foreground underline-offset-4 hover:underline"
            >
              Sign in
            </Link>
          </p>
        </form>
      </CardContent>
    </Card>
  );
}
