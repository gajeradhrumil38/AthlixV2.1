import { redirect } from 'next/navigation';
import Link from 'next/link';
import { getAuthenticatedUser } from '@/lib/db';
import { createServerSupabaseClient } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

export default async function DashboardPage() {
  const user = await getAuthenticatedUser();

  if (!user) {
    redirect('/login');
  }

  const supabase = await createServerSupabaseClient();
  const [profileResult, workoutsResult, templatesResult, recordsResult, bodyWeightResult] = await Promise.all([
    supabase.from('profiles').select('full_name').eq('id', user.id).maybeSingle(),
    supabase.from('workouts').select('id', { count: 'exact', head: true }).eq('user_id', user.id),
    supabase.from('templates').select('id', { count: 'exact', head: true }).eq('user_id', user.id),
    supabase.from('personal_records').select('id', { count: 'exact', head: true }).eq('user_id', user.id),
    supabase.from('body_weight_logs').select('id', { count: 'exact', head: true }).eq('user_id', user.id),
  ]);

  const displayName = profileResult.data?.full_name?.trim() || user.email?.split('@')[0] || 'Athlete';
  const stats = [
    { label: 'Workouts Logged', value: workoutsResult.count ?? 0 },
    { label: 'Templates', value: templatesResult.count ?? 0 },
    { label: 'Personal Records', value: recordsResult.count ?? 0 },
    { label: 'Weight Logs', value: bodyWeightResult.count ?? 0 },
  ];

  return (
    <main className="min-h-screen bg-slate-950 px-4 py-8 text-slate-100 sm:px-6 lg:px-8">
      <div className="mx-auto w-full max-w-6xl space-y-6">
        <section className="rounded-2xl border border-slate-800 bg-slate-900/70 p-5 shadow-xl backdrop-blur sm:p-6">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.32em] text-cyan-400">Athlix</p>
              <h1 className="mt-2 text-2xl font-semibold text-white sm:text-3xl">Welcome back, {displayName}</h1>
              <p className="mt-2 text-sm text-slate-400">
                You are signed in and your account session is active.
              </p>
            </div>

            <form action="/auth/signout" method="post">
              <button
                type="submit"
                className="inline-flex items-center justify-center rounded-lg border border-slate-700 bg-slate-900 px-4 py-2 text-sm font-medium text-slate-100 transition hover:bg-slate-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-500"
              >
                Sign out
              </button>
            </form>
          </div>
        </section>

        <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {stats.map((stat) => (
            <article
              key={stat.label}
              className="rounded-xl border border-slate-800 bg-slate-900/60 p-4 shadow-md"
            >
              <p className="text-sm text-slate-400">{stat.label}</p>
              <p className="mt-1 text-2xl font-semibold text-cyan-300">{stat.value}</p>
            </article>
          ))}
        </section>

        <section className="grid grid-cols-1 gap-4 lg:grid-cols-3">
          <article className="rounded-xl border border-slate-800 bg-slate-900/60 p-4 lg:col-span-2">
            <h2 className="text-lg font-semibold text-white">Quick actions</h2>
            <p className="mt-1 text-sm text-slate-400">
              Continue your progress with these common actions.
            </p>
            <div className="mt-4 flex flex-wrap gap-3">
              <Link
                href="/"
                className="rounded-lg bg-cyan-500 px-4 py-2 text-sm font-semibold text-slate-950 transition hover:bg-cyan-400"
              >
                Go to Home
              </Link>
              <Link
                href="/api/health"
                className="rounded-lg border border-slate-700 bg-slate-900 px-4 py-2 text-sm font-medium text-slate-200 transition hover:bg-slate-800"
              >
                API Health
              </Link>
            </div>
          </article>

          <article className="rounded-xl border border-slate-800 bg-slate-900/60 p-4">
            <h2 className="text-lg font-semibold text-white">Account</h2>
            <dl className="mt-3 space-y-2 text-sm">
              <div>
                <dt className="text-slate-400">Email</dt>
                <dd className="break-all text-slate-100">{user.email}</dd>
              </div>
              <div>
                <dt className="text-slate-400">User ID</dt>
                <dd className="break-all font-mono text-xs text-slate-300">{user.id}</dd>
              </div>
            </dl>
          </article>
        </section>
      </div>
    </main>
  );
}
