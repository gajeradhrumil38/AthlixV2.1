'use client';

export const dynamic = 'force-dynamic';

import { useRouter } from 'next/navigation';
import { Mail, Loader2, RefreshCw } from 'lucide-react';
import { useMemo, useState, useEffect } from 'react';
import { createClient } from '@/lib/supabase';

const RESEND_SECONDS = 60;

export default function VerifyEmailPage() {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);

  const [email, setEmail] = useState('');
  const [countdown, setCountdown] = useState(RESEND_SECONDS);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const openMailHref = useMemo(() => {
    if (typeof navigator === 'undefined') return 'mailto:';

    const ua = navigator.userAgent;
    if (/iPhone|iPad|iPod/i.test(ua)) {
      return 'message://';
    }

    if (/Android/i.test(ua)) {
      return 'intent://#Intent;action=android.intent.action.MAIN;category=android.intent.category.APP_EMAIL;end';
    }

    return 'mailto:';
  }, []);

  const resendEmail = async () => {
    if (!supabase || !email || countdown > 0 || busy) return;

    setBusy(true);
    setMessage(null);

    const { error } = await supabase.auth.resend({
      type: 'signup',
      email,
      options: {
        emailRedirectTo: 'https://athlix-v2-1.vercel.app/auth/callback',
      },
    });

    if (error) {
      setBusy(false);
      setMessage('Unable to resend right now. Please try again.');
      return;
    }

    setBusy(false);
    setMessage('Email resent!');
    setCountdown(RESEND_SECONDS);
  };

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const queryEmail = (params.get('email') || '').trim().toLowerCase();
    if (!queryEmail) {
      router.replace('/signup');
      return;
    }
    setEmail(queryEmail);
  }, [router]);

  useEffect(() => {
    if (!email) {
      return;
    }

    const timer = window.setInterval(() => {
      setCountdown((current) => (current > 0 ? current - 1 : 0));
    }, 1000);

    return () => window.clearInterval(timer);
  }, [email, router]);

  return (
    <main className="min-h-screen w-full overflow-x-hidden bg-[#070d16] px-4 py-8 text-slate-100" style={{ paddingBottom: 'max(env(safe-area-inset-bottom), 16px)' }}>
      <div className="mx-auto flex min-h-[calc(100dvh-32px)] w-full max-w-[400px] flex-col justify-center py-4">
        <section className="rounded-3xl border border-cyan-400/18 bg-[rgba(15,20,30,0.85)] p-6 text-center backdrop-blur-xl">
          <div className="mx-auto mb-4 flex h-20 w-20 items-center justify-center rounded-full bg-cyan-400/15 text-cyan-300">
            <Mail className="h-10 w-10 animate-pulse" />
          </div>

          <h1 className="text-2xl font-bold text-white">Check your inbox</h1>
          <p className="mt-2 text-sm text-slate-300">
            We sent a confirmation link to <span className="font-semibold text-cyan-300">{email}</span>
          </p>
          <p className="mt-2 text-xs text-slate-400">
            Tap the link in the email to activate your account and go straight to your dashboard.
          </p>

          <a
            href={openMailHref}
            className="mt-6 inline-flex min-h-[52px] w-full items-center justify-center rounded-2xl bg-[#00D4FF] px-4 text-base font-semibold text-slate-950"
          >
            Open Mail App
          </a>

          <button
            type="button"
            onClick={resendEmail}
            disabled={countdown > 0 || busy}
            className="mt-3 inline-flex min-h-[48px] w-full items-center justify-center gap-2 rounded-2xl border border-slate-600 bg-slate-900/50 px-4 text-sm font-medium text-slate-100 disabled:opacity-50"
          >
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
            {countdown > 0 ? `Resend email in ${countdown}s` : 'Resend email'}
          </button>

          <button
            type="button"
            onClick={() => router.replace(`/signup?email=${encodeURIComponent(email)}`)}
            className="mt-3 inline-flex min-h-[44px] items-center justify-center text-sm text-cyan-300 underline-offset-4 hover:underline"
          >
            Wrong email? Go back
          </button>

          {message ? (
            <p className="mt-2 text-sm text-slate-300" aria-live="polite">{message}</p>
          ) : null}

          <p className="mt-6 text-xs text-slate-500">
            Can&apos;t find it? Check your spam or junk folder and mark it as &quot;Not spam&quot;.
          </p>
        </section>
      </div>
    </main>
  );
}
