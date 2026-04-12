'use client';

export const dynamic = 'force-dynamic';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { AnimatePresence, motion } from 'framer-motion';
import { CheckCircle2, Eye, EyeOff, Loader2, X } from 'lucide-react';
import { FormEvent, useEffect, useMemo, useState } from 'react';
import { z } from 'zod';
import { createClient } from '@/lib/supabase';

const ATTEMPT_STORAGE_KEY = 'athlix_login_guard_v2';
const REMEMBER_EMAIL_KEY = 'athlix_login_remember_email_v2';
const REMEMBER_UNTIL_KEY = 'athlix_login_remember_until_v2';
const MAX_FAILED_ATTEMPTS = 5;
const LOCKOUT_DURATION_MS = 15 * 60 * 1000;
const RESEND_WAIT_SECONDS = 60;

const emailSchema = z.string().trim().email();

type AttemptState = {
  failedAttempts: number;
  lockUntil: number | null;
};

const defaultAttemptState: AttemptState = {
  failedAttempts: 0,
  lockUntil: null,
};

const normalizeAttemptState = (state: AttemptState): AttemptState => {
  if (!state.lockUntil) return state;
  if (state.lockUntil <= Date.now()) return defaultAttemptState;
  return state;
};

const isSafePath = (path: string | null) => {
  if (!path) return false;
  return path.startsWith('/') && !path.startsWith('//');
};

const getGenericAuthError = (message: string, status?: number) => {
  const normalized = message.toLowerCase();

  if (status === 429 || normalized.includes('too many requests')) {
    return 'Too many attempts. Try again in 15 minutes.';
  }

  if (normalized.includes('network') || normalized.includes('fetch')) {
    return 'Connection issue. Please try again.';
  }

  return 'Incorrect email or password. Try again.';
};

export default function LoginPage() {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [rememberMe, setRememberMe] = useState(true);
  const [showPassword, setShowPassword] = useState(false);
  const [attemptState, setAttemptState] = useState<AttemptState>(defaultAttemptState);
  const [failedHint, setFailedHint] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [oauthSubmitting, setOauthSubmitting] = useState<null | 'google' | 'apple'>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [showAlreadyExistsPrompt, setShowAlreadyExistsPrompt] = useState(false);
  const [forgotOpen, setForgotOpen] = useState(false);
  const [forgotEmail, setForgotEmail] = useState('');
  const [forgotMessage, setForgotMessage] = useState<string | null>(null);
  const [forgotCountdown, setForgotCountdown] = useState(0);
  const [showApple, setShowApple] = useState(false);
  const [shakeNonce, setShakeNonce] = useState(0);
  const [redirectPath, setRedirectPath] = useState('/dashboard');

  const lockTimeRemainingMinutes = useMemo(() => {
    if (!attemptState.lockUntil) return null;
    const remaining = attemptState.lockUntil - Date.now();
    if (remaining <= 0) return null;
    return Math.ceil(remaining / 60000);
  }, [attemptState.lockUntil]);

  const isLocked = Boolean(attemptState.lockUntil && attemptState.lockUntil > Date.now());
  const disableActions = submitting || Boolean(oauthSubmitting) || isLocked;

  const shakeCard = () => {
    setShakeNonce((current) => current + 1);
  };

  const setErrorBanner = (message: string) => {
    setSuccessMessage(null);
    setErrorMessage(message);
    shakeCard();
  };

  const markFailedAttempt = (forceLock = false) => {
    setAttemptState((previous) => {
      const normalized = normalizeAttemptState(previous);
      const failedAttempts = forceLock ? MAX_FAILED_ATTEMPTS : normalized.failedAttempts + 1;
      const lockUntil =
        failedAttempts >= MAX_FAILED_ATTEMPTS ? Date.now() + LOCKOUT_DURATION_MS : null;

      const nextState = {
        failedAttempts,
        lockUntil,
      };

      setFailedHint(failedAttempts >= 3);
      return nextState;
    });
  };

  const clearFailedAttempts = () => {
    setAttemptState(defaultAttemptState);
    setFailedHint(false);
  };

  const saveRememberPreference = (nextEmail: string) => {
    if (rememberMe) {
      localStorage.setItem(REMEMBER_EMAIL_KEY, nextEmail);
      localStorage.setItem(
        REMEMBER_UNTIL_KEY,
        String(Date.now() + 30 * 24 * 60 * 60 * 1000),
      );
      return;
    }

    localStorage.removeItem(REMEMBER_EMAIL_KEY);
    localStorage.removeItem(REMEMBER_UNTIL_KEY);
  };

  const redirectAfterSuccess = (path: string) => {
    setTimeout(() => {
      router.replace(path);
      router.refresh();
    }, 650);
  };

  const sendResetEmail = async (event?: FormEvent) => {
    event?.preventDefault();

    if (!supabase) {
      setForgotMessage('Connection issue. Please try again.');
      return;
    }

    const candidateEmail = (forgotEmail || email).trim().toLowerCase();

    if (!emailSchema.safeParse(candidateEmail).success) {
      setForgotMessage('Enter a valid email address.');
      return;
    }

    const { error } = await supabase.auth.resetPasswordForEmail(candidateEmail, {
      redirectTo: 'https://athlix-v2-1.vercel.app/auth/callback?next=/reset-password',
    });

    if (error) {
      setForgotMessage('Connection issue. Please try again.');
      return;
    }

    setForgotMessage('Reset link sent! Check your inbox.');
    setForgotCountdown(RESEND_WAIT_SECONDS);
  };

  const handleSignIn = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!supabase) {
      setErrorBanner('Connection issue. Please try again.');
      return;
    }

    const sanitizedEmail = email.trim().toLowerCase();
    const sanitizedPassword = password;

    if (!emailSchema.safeParse(sanitizedEmail).success) {
      setErrorBanner('Incorrect email or password. Try again.');
      return;
    }

    if (isLocked) {
      setErrorBanner('Too many attempts. Try again in 15 minutes.');
      return;
    }

    setShowAlreadyExistsPrompt(false);
    setErrorMessage(null);
    setForgotMessage(null);
    setSubmitting(true);

    const { error } = await supabase.auth.signInWithPassword({
      email: sanitizedEmail,
      password: sanitizedPassword,
    });

    if (error) {
      const genericMessage = getGenericAuthError(error.message || '', error.status);
      const shouldLock = genericMessage.includes('Too many attempts');
      markFailedAttempt(shouldLock);
      setPassword('');
      setSubmitting(false);
      setErrorBanner(genericMessage);
      return;
    }

    saveRememberPreference(sanitizedEmail);
    clearFailedAttempts();
    setSubmitting(false);
    setSuccessMessage('Welcome back!');
    redirectAfterSuccess(redirectPath);
  };

  const handleOAuthLogin = async (provider: 'google' | 'apple') => {
    if (!supabase) {
      setErrorBanner('Connection issue. Please try again.');
      return;
    }

    if (isLocked) {
      setErrorBanner('Too many attempts. Try again in 15 minutes.');
      return;
    }

    setErrorMessage(null);
    setOauthSubmitting(provider);

    const { error } = await supabase.auth.signInWithOAuth({
      provider,
      options: {
        redirectTo: 'https://athlix-v2-1.vercel.app/auth/callback',
      },
    });

    if (error) {
      setOauthSubmitting(null);
      setErrorBanner('Connection issue. Please try again.');
    }
  };

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);

    const requestedPath = params.get('redirect');
    setRedirectPath(isSafePath(requestedPath) ? requestedPath ?? '/dashboard' : '/dashboard');

    const persistedAttemptState = localStorage.getItem(ATTEMPT_STORAGE_KEY);
    if (persistedAttemptState) {
      try {
        const parsed = JSON.parse(persistedAttemptState) as AttemptState;
        const normalized = normalizeAttemptState(parsed);
        setAttemptState(normalized);
        setFailedHint(normalized.failedAttempts >= 3);
      } catch {
        localStorage.removeItem(ATTEMPT_STORAGE_KEY);
      }
    }

    const rememberUntil = Number(localStorage.getItem(REMEMBER_UNTIL_KEY) || '0');
    const rememberedEmail = localStorage.getItem(REMEMBER_EMAIL_KEY) || '';

    if (rememberUntil > Date.now() && rememberedEmail) {
      setEmail(rememberedEmail);
      setForgotEmail(rememberedEmail);
      setRememberMe(true);
    } else {
      localStorage.removeItem(REMEMBER_EMAIL_KEY);
      localStorage.removeItem(REMEMBER_UNTIL_KEY);
    }

    const emailFromQuery = params.get('email');
    if (emailFromQuery) {
      const trimmedEmail = emailFromQuery.trim().toLowerCase();
      setEmail(trimmedEmail);
      setForgotEmail(trimmedEmail);
    }

    if (params.get('signup') === 'already_exists') {
      setShowAlreadyExistsPrompt(true);
      setErrorMessage(null);
    }

    if (params.get('error') === 'link_expired') {
      setSuccessMessage(null);
      setErrorMessage('Your link has expired. Request a new one below.');
      setShakeNonce((current) => current + 1);
      setForgotOpen(true);
    }

    if (params.get('showForgot') === '1') {
      setForgotOpen(true);
    }

    const ua = navigator.userAgent;
    const isIOS = /iPhone|iPad|iPod/i.test(ua);
    const isSafari = /Safari/i.test(ua) && !/CriOS|FxiOS|EdgiOS/i.test(ua);
    setShowApple(isIOS && isSafari);
  }, []);

  useEffect(() => {
    localStorage.setItem(ATTEMPT_STORAGE_KEY, JSON.stringify(attemptState));
  }, [attemptState]);

  useEffect(() => {
    const timer = window.setInterval(() => {
      setAttemptState((current) => normalizeAttemptState(current));
      setForgotCountdown((current) => (current > 0 ? current - 1 : 0));
    }, 1000);

    return () => window.clearInterval(timer);
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
          <h1 className="mt-2 text-4xl font-bold leading-tight text-[#00D4FF]">ATHLIX</h1>
          <p className="mt-2 text-sm text-slate-300">Track. Recover. Perform.</p>
        </div>

        <motion.section
          animate={shakeNonce > 0 ? { x: [0, -8, 8, -6, 6, 0] } : { x: 0 }}
          transition={{ duration: 0.32, ease: 'easeOut' }}
          className="rounded-3xl border border-cyan-400/18 bg-[rgba(15,20,30,0.85)] p-5 backdrop-blur-xl"
        >
          <AnimatePresence>
            {showAlreadyExistsPrompt ? (
              <motion.div
                key="already-exists"
                initial={{ opacity: 0, y: -8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                className="mb-4 rounded-2xl border border-amber-400/30 bg-amber-400/10 p-3 text-sm text-amber-100"
              >
                <p>
                  An account with this email already exists. Sign in instead?
                </p>
                <button
                  type="button"
                  onClick={() => {
                    setShowAlreadyExistsPrompt(false);
                    setErrorMessage(null);
                  }}
                  className="mt-2 inline-flex min-h-11 items-center rounded-xl bg-amber-200 px-3 py-2 text-sm font-semibold text-amber-950"
                >
                  Sign In
                </button>
              </motion.div>
            ) : null}
          </AnimatePresence>

          <AnimatePresence>
            {errorMessage ? (
              <motion.div
                key="error-banner"
                initial={{ opacity: 0, y: -8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                className="mb-4 flex items-start justify-between gap-3 rounded-2xl border border-rose-500/35 bg-rose-500/15 p-3 text-sm text-rose-100"
                role="alert"
                aria-live="assertive"
              >
                <span>{errorMessage}</span>
                <button
                  type="button"
                  onClick={() => setErrorMessage(null)}
                  className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-rose-100/80 transition hover:bg-rose-500/20"
                  aria-label="Dismiss error"
                >
                  <X className="h-4 w-4" />
                </button>
              </motion.div>
            ) : null}
          </AnimatePresence>

          {isLocked ? (
            <div className="mb-4 rounded-2xl border border-rose-500/30 bg-rose-500/10 p-3 text-sm text-rose-100">
              Too many attempts. Try again in {lockTimeRemainingMinutes || 15} minutes.
            </div>
          ) : null}

          {successMessage ? (
            <motion.div
              initial={{ opacity: 0, y: -8 }}
              animate={{ opacity: 1, y: 0 }}
              className="mb-4 flex items-center gap-2 rounded-2xl border border-emerald-500/30 bg-emerald-500/10 p-3 text-sm text-emerald-100"
            >
              <CheckCircle2 className="h-4 w-4" />
              {successMessage}
            </motion.div>
          ) : null}

          <form onSubmit={handleSignIn} className="space-y-4" noValidate>
            <div>
              <label htmlFor="email" className="mb-1.5 block text-sm font-medium text-slate-200">Email</label>
              <input
                id="email"
                type="email"
                inputMode="email"
                autoComplete="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                onBlur={() => {
                  const trimmed = email.trim().toLowerCase();
                  setEmail(trimmed);
                  if (!forgotEmail) setForgotEmail(trimmed);
                }}
                disabled={disableActions}
                className="min-h-[52px] w-full rounded-2xl border border-slate-700/80 bg-[#0b1220] px-4 text-base text-white outline-none transition focus:border-cyan-400 focus:shadow-[0_0_0_3px_rgba(0,212,255,0.2)]"
                aria-label="Email"
              />
            </div>

            <div>
              <label htmlFor="password" className="mb-1.5 block text-sm font-medium text-slate-200">Password</label>
              <div className="relative">
                <input
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="current-password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  disabled={disableActions}
                  className="min-h-[52px] w-full rounded-2xl border border-slate-700/80 bg-[#0b1220] px-4 pr-12 text-base text-white outline-none transition focus:border-cyan-400 focus:shadow-[0_0_0_3px_rgba(0,212,255,0.2)]"
                  aria-label="Password"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((value) => !value)}
                  className="absolute right-2 top-1/2 inline-flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-xl text-slate-300 transition hover:bg-white/10"
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                  disabled={disableActions}
                >
                  {showPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
                </button>
              </div>
            </div>

            <div className="flex items-center justify-between gap-3">
              <label className="inline-flex min-h-11 items-center gap-2 text-sm text-slate-300">
                <input
                  type="checkbox"
                  checked={rememberMe}
                  onChange={(event) => setRememberMe(event.target.checked)}
                  disabled={disableActions}
                  className="h-4 w-4 rounded border-slate-600 bg-[#0b1220] text-cyan-400"
                />
                Remember me (30 days)
              </label>
              <button
                type="button"
                onClick={() => {
                  setForgotOpen((value) => !value);
                  setForgotMessage(null);
                  setForgotEmail((current) => current || email.trim().toLowerCase());
                }}
                className="min-h-11 text-sm font-medium text-cyan-300 underline-offset-4 hover:underline"
              >
                Forgot password?
              </button>
            </div>

            {failedHint ? (
              <p className="text-sm text-slate-300">
                Forgot your password? Use the reset option below.
              </p>
            ) : null}

            <button
              type="submit"
              disabled={disableActions}
              className="inline-flex min-h-[52px] w-full items-center justify-center gap-2 rounded-2xl bg-[#00D4FF] px-4 text-base font-semibold text-slate-950 transition hover:bg-[#2cdcff] disabled:cursor-not-allowed disabled:bg-cyan-900 disabled:text-slate-300"
            >
              {submitting ? (
                <>
                  <Loader2 className="h-5 w-5 animate-spin" />
                  Signing in...
                </>
              ) : successMessage ? (
                <>
                  <CheckCircle2 className="h-5 w-5" />
                  Welcome back!
                </>
              ) : (
                'Sign In'
              )}
            </button>
          </form>

          <AnimatePresence>
            {forgotOpen ? (
              <motion.form
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                transition={{ duration: 0.22, ease: 'easeOut' }}
                onSubmit={sendResetEmail}
                className="mt-4 overflow-hidden rounded-2xl border border-slate-700/70 bg-[#0b1220]/70 p-3"
              >
                <label htmlFor="forgot-email" className="mb-2 block text-sm font-medium text-slate-200">
                  Reset your password
                </label>
                <input
                  id="forgot-email"
                  type="email"
                  autoComplete="email"
                  inputMode="email"
                  value={forgotEmail}
                  onChange={(event) => setForgotEmail(event.target.value)}
                  onBlur={() => setForgotEmail(forgotEmail.trim().toLowerCase())}
                  className="min-h-[52px] w-full rounded-2xl border border-slate-700/80 bg-[#090f1a] px-4 text-base text-white outline-none transition focus:border-cyan-400 focus:shadow-[0_0_0_3px_rgba(0,212,255,0.2)]"
                  placeholder="you@example.com"
                />
                <button
                  type="submit"
                  className="mt-3 inline-flex min-h-[48px] w-full items-center justify-center rounded-2xl border border-slate-500/70 px-4 text-sm font-medium text-slate-100 transition hover:bg-white/10"
                >
                  Send reset link
                </button>
                {forgotMessage ? (
                  <p className="mt-2 text-sm text-slate-300" aria-live="polite">
                    {forgotMessage}
                  </p>
                ) : null}
                <button
                  type="button"
                  onClick={() => sendResetEmail()}
                  disabled={forgotCountdown > 0}
                  className="mt-2 min-h-11 text-sm text-cyan-300 disabled:text-slate-500"
                >
                  {forgotCountdown > 0
                    ? `Resend available in ${forgotCountdown}s`
                    : 'Resend email'}
                </button>
              </motion.form>
            ) : null}
          </AnimatePresence>

          <div className="my-5 flex items-center gap-3 text-xs uppercase tracking-[0.2em] text-slate-500">
            <span className="h-px flex-1 bg-slate-700" />
            <span>or continue with</span>
            <span className="h-px flex-1 bg-slate-700" />
          </div>

          <div className="space-y-3">
            <button
              type="button"
              onClick={() => handleOAuthLogin('google')}
              disabled={disableActions}
              className="inline-flex min-h-[52px] w-full items-center justify-center gap-2 rounded-2xl bg-white px-4 text-base font-semibold text-slate-900 transition hover:bg-slate-100 disabled:opacity-60"
            >
              {oauthSubmitting === 'google' ? <Loader2 className="h-5 w-5 animate-spin" /> : <span className="font-bold text-[#DB4437]">G</span>}
              Continue with Google
            </button>

            {showApple ? (
              <button
                type="button"
                onClick={() => handleOAuthLogin('apple')}
                disabled={disableActions}
                className="inline-flex min-h-[52px] w-full items-center justify-center gap-2 rounded-2xl bg-black px-4 text-base font-semibold text-white transition hover:bg-[#111] disabled:opacity-60"
              >
                {oauthSubmitting === 'apple' ? <Loader2 className="h-5 w-5 animate-spin" /> : <span className="text-lg"></span>}
                Continue with Apple
              </button>
            ) : null}
          </div>

          <div className="mt-5 text-center text-sm text-slate-300">
            Don&apos;t have an account?{' '}
            <Link
              href={`/signup${redirectPath && redirectPath !== '/dashboard' ? `?redirect=${encodeURIComponent(redirectPath)}` : ''}`}
              className="font-semibold text-cyan-300 underline-offset-4 hover:underline"
            >
              Sign up
            </Link>
          </div>

          <div className="mt-4 text-center text-xs text-slate-500">
            <Link href="/legacy-app/privacy.html" className="hover:text-slate-300 hover:underline">Privacy Policy</Link>
            {' · '}
            <Link href="/legacy-app/terms.html" className="hover:text-slate-300 hover:underline">Terms</Link>
          </div>
        </motion.section>
      </div>
    </main>
  );
}
