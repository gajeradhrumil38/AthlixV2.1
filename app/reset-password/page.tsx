'use client';

export const dynamic = 'force-dynamic';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Eye, EyeOff, Loader2, CheckCircle2 } from 'lucide-react';
import { FormEvent, useMemo, useState } from 'react';
import { createClient } from '@/lib/supabase';

const getPasswordStrength = (value: string) => {
  const lengthScore = value.length >= 8 ? 1 : 0;
  const hasNumber = /\d/.test(value) ? 1 : 0;
  const hasSymbol = /[^A-Za-z0-9]/.test(value) ? 1 : 0;
  const hasUpper = /[A-Z]/.test(value) ? 1 : 0;
  const score = lengthScore + hasNumber + hasSymbol + hasUpper;

  if (score <= 1) return { tone: 'bg-orange-400', width: '33%', label: 'Weak' };
  if (score <= 3) return { tone: 'bg-yellow-400', width: '66%', label: 'Good' };
  return { tone: 'bg-emerald-400', width: '100%', label: 'Strong' };
};

export default function ResetPasswordPage() {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);

  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const strength = useMemo(() => getPasswordStrength(newPassword), [newPassword]);

  const updatePassword = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!supabase) {
      setErrorMessage('Connection issue. Please try again.');
      return;
    }

    if (newPassword.length < 8) {
      setErrorMessage('Password must be at least 8 characters.');
      return;
    }

    if (newPassword !== confirmPassword) {
      setErrorMessage('Passwords do not match.');
      return;
    }

    setLoading(true);
    setErrorMessage(null);

    const { error } = await supabase.auth.updateUser({
      password: newPassword,
    });

    if (error) {
      setLoading(false);
      setErrorMessage('Link expired. Request a new reset email.');
      return;
    }

    setLoading(false);
    setSuccessMessage('Password updated! Redirecting to dashboard...');

    setTimeout(() => {
      router.replace('/dashboard');
      router.refresh();
    }, 3000);
  };

  return (
    <main className="min-h-screen w-full overflow-x-hidden bg-[#070d16] px-4 py-8 text-slate-100" style={{ paddingBottom: 'max(env(safe-area-inset-bottom), 16px)' }}>
      <div className="mx-auto flex min-h-[calc(100dvh-32px)] w-full max-w-[400px] flex-col justify-center py-4">
        <section className="rounded-3xl border border-cyan-400/18 bg-[rgba(15,20,30,0.85)] p-6 backdrop-blur-xl">
          <h1 className="text-2xl font-bold text-white">Set a new password</h1>
          <p className="mt-2 text-sm text-slate-300">Create a secure password to finish account recovery.</p>

          {errorMessage ? (
            <div className="mt-4 rounded-2xl border border-rose-500/35 bg-rose-500/15 p-3 text-sm text-rose-100" role="alert" aria-live="assertive">
              {errorMessage}
            </div>
          ) : null}

          {successMessage ? (
            <div className="mt-4 flex items-center gap-2 rounded-2xl border border-emerald-500/30 bg-emerald-500/10 p-3 text-sm text-emerald-100" aria-live="polite">
              <CheckCircle2 className="h-4 w-4" />
              {successMessage}
            </div>
          ) : null}

          <form onSubmit={updatePassword} className="mt-5 space-y-4" noValidate>
            <div>
              <label htmlFor="new-password" className="mb-1.5 block text-sm font-medium text-slate-200">New password</label>
              <div className="relative">
                <input
                  id="new-password"
                  type={showNewPassword ? 'text' : 'password'}
                  autoComplete="new-password"
                  value={newPassword}
                  onChange={(event) => setNewPassword(event.target.value)}
                  disabled={loading}
                  className="min-h-[52px] w-full rounded-2xl border border-slate-700/80 bg-[#0b1220] px-4 pr-12 text-base text-white outline-none transition focus:border-cyan-400 focus:shadow-[0_0_0_3px_rgba(0,212,255,0.2)]"
                />
                <button
                  type="button"
                  onClick={() => setShowNewPassword((value) => !value)}
                  className="absolute right-2 top-1/2 inline-flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-xl text-slate-300 transition hover:bg-white/10"
                  aria-label={showNewPassword ? 'Hide password' : 'Show password'}
                >
                  {showNewPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
                </button>
              </div>
              <div className="mt-2 h-2 w-full rounded-full bg-slate-700/80">
                <div className={`h-2 rounded-full ${strength.tone}`} style={{ width: strength.width }} />
              </div>
              <p className="mt-1 text-xs text-slate-300">Strength: {strength.label}</p>
            </div>

            <div>
              <label htmlFor="confirm-password" className="mb-1.5 block text-sm font-medium text-slate-200">Confirm password</label>
              <div className="relative">
                <input
                  id="confirm-password"
                  type={showConfirmPassword ? 'text' : 'password'}
                  autoComplete="new-password"
                  value={confirmPassword}
                  onChange={(event) => setConfirmPassword(event.target.value)}
                  disabled={loading}
                  className="min-h-[52px] w-full rounded-2xl border border-slate-700/80 bg-[#0b1220] px-4 pr-12 text-base text-white outline-none transition focus:border-cyan-400 focus:shadow-[0_0_0_3px_rgba(0,212,255,0.2)]"
                />
                <button
                  type="button"
                  onClick={() => setShowConfirmPassword((value) => !value)}
                  className="absolute right-2 top-1/2 inline-flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-xl text-slate-300 transition hover:bg-white/10"
                  aria-label={showConfirmPassword ? 'Hide password' : 'Show password'}
                >
                  {showConfirmPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
                </button>
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="inline-flex min-h-[52px] w-full items-center justify-center gap-2 rounded-2xl bg-[#00D4FF] px-4 text-base font-semibold text-slate-950 transition hover:bg-[#2cdcff] disabled:cursor-not-allowed disabled:bg-cyan-900 disabled:text-slate-300"
            >
              {loading ? (
                <>
                  <Loader2 className="h-5 w-5 animate-spin" />
                  Updating...
                </>
              ) : (
                'Update password'
              )}
            </button>
          </form>

          <p className="mt-4 text-sm text-slate-400">
            Link expired?{' '}
            <Link href="/login?showForgot=1" className="text-cyan-300 underline-offset-4 hover:underline">
              Request a new reset email.
            </Link>
          </p>
        </section>
      </div>
    </main>
  );
}
