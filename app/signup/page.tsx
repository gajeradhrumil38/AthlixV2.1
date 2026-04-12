'use client';

export const dynamic = 'force-dynamic';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { CheckCircle2, Eye, EyeOff, Loader2 } from 'lucide-react';
import { FormEvent, useEffect, useMemo, useState } from 'react';
import { z } from 'zod';
import { createClient } from '@/lib/supabase';

const emailSchema = z.string().trim().email();
const fullNameSchema = z.string().trim().min(2).max(80);

const isSafePath = (path: string | null) => {
  if (!path) return false;
  return path.startsWith('/') && !path.startsWith('//');
};

const getPasswordStrength = (value: string) => {
  const lengthScore = value.length >= 8 ? 1 : 0;
  const hasNumber = /\d/.test(value) ? 1 : 0;
  const hasSymbol = /[^A-Za-z0-9]/.test(value) ? 1 : 0;
  const hasUpper = /[A-Z]/.test(value) ? 1 : 0;
  const score = lengthScore + hasNumber + hasSymbol + hasUpper;

  if (score <= 1) {
    return { level: 'Weak', tone: 'bg-orange-400', helper: 'Add numbers or symbols', width: '33%' };
  }

  if (score <= 3) {
    return { level: 'Good', tone: 'bg-yellow-400', helper: 'Add an uppercase letter for stronger security', width: '66%' };
  }

  return { level: 'Strong', tone: 'bg-emerald-400', helper: 'Great password strength', width: '100%' };
};

export default function SignupPage() {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);

  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [acceptedTerms, setAcceptedTerms] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [alreadyExists, setAlreadyExists] = useState(false);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [redirectPath, setRedirectPath] = useState('/dashboard');

  const passwordStrength = useMemo(() => getPasswordStrength(password), [password]);

  const goToSignInWithEmail = () => {
    const encodedEmail = encodeURIComponent(email.trim().toLowerCase());
    const redirectQuery =
      redirectPath && redirectPath !== '/dashboard'
        ? `&redirect=${encodeURIComponent(redirectPath)}`
        : '';
    router.replace(`/login?signup=already_exists&email=${encodedEmail}${redirectQuery}`);
  };

  const handleSignup = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!supabase) {
      setErrorMessage('Connection issue. Please try again.');
      return;
    }

    const sanitizedName = fullName.trim();
    const sanitizedEmail = email.trim().toLowerCase();

    if (!fullNameSchema.safeParse(sanitizedName).success) {
      setErrorMessage('Enter your full name.');
      return;
    }

    if (!emailSchema.safeParse(sanitizedEmail).success) {
      setErrorMessage('Enter a valid email address.');
      return;
    }

    if (password.length < 8) {
      setErrorMessage('Use at least 8 characters for your password.');
      return;
    }

    if (!acceptedTerms) {
      setErrorMessage('You must agree to Terms & Privacy Policy.');
      return;
    }

    setLoading(true);
    setAlreadyExists(false);
    setErrorMessage(null);

    const { error } = await supabase.auth.signUp({
      email: sanitizedEmail,
      password,
      options: {
        data: { full_name: sanitizedName },
        emailRedirectTo: 'https://athlix-v2-1.vercel.app/auth/callback',
      },
    });

    if (error) {
      const message = (error.message || '').toLowerCase();
      if (message.includes('already registered') || error.code === 'user_already_exists') {
        setAlreadyExists(true);
        setErrorMessage(null);
        setLoading(false);
        return;
      }

      if (message.includes('network') || message.includes('fetch')) {
        setErrorMessage('Connection issue. Please try again.');
      } else {
        setErrorMessage('Unable to create your account right now. Please try again.');
      }
      setLoading(false);
      return;
    }

    setSuccessMessage('Account created. Sending you to email confirmation...');
    setLoading(false);
    router.replace(`/verify-email?email=${encodeURIComponent(sanitizedEmail)}`);
  };

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const queryEmail = params.get('email');
    const requestedPath = params.get('redirect');

    setRedirectPath(isSafePath(requestedPath) ? requestedPath ?? '/dashboard' : '/dashboard');

    if (queryEmail) {
      setEmail(queryEmail.trim().toLowerCase());
    }
  }, []);

  useEffect(() => {
    if (!supabase) return;

    let cancelled = false;
    supabase.auth.getUser().then(({ data }) => {
      if (cancelled) return;
      if (data.user) {
        router.replace(redirectPath);
      }
    });

    return () => {
      cancelled = true;
    };
  }, [router, redirectPath, supabase]);

  return (
    <main className="min-h-screen w-full overflow-x-hidden bg-[#070d16] px-4 py-8 text-slate-100 sm:px-6" style={{ paddingBottom: 'max(env(safe-area-inset-bottom), 16px)' }}>
      <div className="mx-auto flex min-h-[calc(100dvh-32px)] w-full max-w-[400px] flex-col justify-center py-4">
        <div className="mb-6 text-center">
          <p className="text-sm font-semibold uppercase tracking-[0.36em] text-[#00D4FF]">Athlix</p>
          <h1 className="mt-2 text-4xl font-bold leading-tight text-[#00D4FF]">Create account</h1>
          <p className="mt-2 text-sm text-slate-300">Track. Recover. Perform.</p>
        </div>

        <section className="rounded-3xl border border-cyan-400/18 bg-[rgba(15,20,30,0.85)] p-5 backdrop-blur-xl">
          {alreadyExists ? (
            <div className="mb-4 rounded-2xl border border-amber-400/30 bg-amber-400/10 p-3 text-sm text-amber-100">
              <p>
                An account with this email already exists. Sign in instead?
              </p>
              <button
                type="button"
                onClick={goToSignInWithEmail}
                className="mt-2 inline-flex min-h-11 items-center rounded-xl bg-amber-200 px-3 py-2 text-sm font-semibold text-amber-950"
              >
                Sign In
              </button>
            </div>
          ) : null}

          {errorMessage ? (
            <div className="mb-4 rounded-2xl border border-rose-500/35 bg-rose-500/15 p-3 text-sm text-rose-100" role="alert" aria-live="assertive">
              {errorMessage}
            </div>
          ) : null}

          {successMessage ? (
            <div className="mb-4 flex items-center gap-2 rounded-2xl border border-emerald-500/30 bg-emerald-500/10 p-3 text-sm text-emerald-100" aria-live="polite">
              <CheckCircle2 className="h-4 w-4" />
              {successMessage}
            </div>
          ) : null}

          <form onSubmit={handleSignup} className="space-y-4" noValidate>
            <div>
              <label htmlFor="full-name" className="mb-1.5 block text-sm font-medium text-slate-200">Full name</label>
              <input
                id="full-name"
                type="text"
                autoComplete="name"
                inputMode="text"
                value={fullName}
                onChange={(event) => setFullName(event.target.value)}
                onBlur={() => setFullName(fullName.trim())}
                disabled={loading}
                className="min-h-[52px] w-full rounded-2xl border border-slate-700/80 bg-[#0b1220] px-4 text-base text-white outline-none transition focus:border-cyan-400 focus:shadow-[0_0_0_3px_rgba(0,212,255,0.2)]"
              />
            </div>

            <div>
              <label htmlFor="signup-email" className="mb-1.5 block text-sm font-medium text-slate-200">Email</label>
              <input
                id="signup-email"
                type="email"
                autoComplete="email"
                inputMode="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                onBlur={() => setEmail(email.trim().toLowerCase())}
                disabled={loading}
                className="min-h-[52px] w-full rounded-2xl border border-slate-700/80 bg-[#0b1220] px-4 text-base text-white outline-none transition focus:border-cyan-400 focus:shadow-[0_0_0_3px_rgba(0,212,255,0.2)]"
              />
            </div>

            <div>
              <label htmlFor="signup-password" className="mb-1.5 block text-sm font-medium text-slate-200">Password</label>
              <div className="relative">
                <input
                  id="signup-password"
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="new-password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  disabled={loading}
                  className="min-h-[52px] w-full rounded-2xl border border-slate-700/80 bg-[#0b1220] px-4 pr-12 text-base text-white outline-none transition focus:border-cyan-400 focus:shadow-[0_0_0_3px_rgba(0,212,255,0.2)]"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((value) => !value)}
                  disabled={loading}
                  className="absolute right-2 top-1/2 inline-flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-xl text-slate-300 transition hover:bg-white/10"
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                >
                  {showPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
                </button>
              </div>
              <div className="mt-2 h-2 w-full rounded-full bg-slate-700/80">
                <div className={`h-2 rounded-full ${passwordStrength.tone}`} style={{ width: passwordStrength.width }} />
              </div>
              <p className="mt-1 text-xs text-slate-300">
                {passwordStrength.level === 'Strong' ? 'Strong password ✓' : passwordStrength.helper}
              </p>
            </div>

            <label className="inline-flex min-h-11 items-start gap-2 text-sm text-slate-300">
              <input
                type="checkbox"
                checked={acceptedTerms}
                onChange={(event) => setAcceptedTerms(event.target.checked)}
                disabled={loading}
                className="mt-1 h-4 w-4 rounded border-slate-600 bg-[#0b1220] text-cyan-400"
              />
              <span>
                I agree to{' '}
                <Link href="/legacy-app/terms.html" className="text-cyan-300 underline-offset-4 hover:underline">
                  Terms
                </Link>
                {' '}and{' '}
                <Link href="/legacy-app/privacy.html" className="text-cyan-300 underline-offset-4 hover:underline">
                  Privacy Policy
                </Link>
              </span>
            </label>

            <button
              type="submit"
              disabled={loading}
              className="inline-flex min-h-[52px] w-full items-center justify-center gap-2 rounded-2xl bg-[#00D4FF] px-4 text-base font-semibold text-slate-950 transition hover:bg-[#2cdcff] disabled:cursor-not-allowed disabled:bg-cyan-900 disabled:text-slate-300"
            >
              {loading ? (
                <>
                  <Loader2 className="h-5 w-5 animate-spin" />
                  Creating account...
                </>
              ) : (
                'Create account'
              )}
            </button>
          </form>

          <p className="mt-5 text-center text-sm text-slate-300">
            Already have an account?{' '}
            <Link
              href={`/login${redirectPath && redirectPath !== '/dashboard' ? `?redirect=${encodeURIComponent(redirectPath)}` : ''}`}
              className="font-semibold text-cyan-300 underline-offset-4 hover:underline"
            >
              Sign in
            </Link>
          </p>
        </section>
      </div>
    </main>
  );
}
