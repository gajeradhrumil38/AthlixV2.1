import { redirect } from 'next/navigation';
import { getAuthenticatedUser } from '@/lib/db';
import { LegacyDashboardApp } from '@/components/legacy/legacy-dashboard-app';

export const dynamic = 'force-dynamic';

export default async function DashboardPage() {
  const user = await getAuthenticatedUser();

  if (!user) {
    redirect('/login');
  }

  return <LegacyDashboardApp />;
}
