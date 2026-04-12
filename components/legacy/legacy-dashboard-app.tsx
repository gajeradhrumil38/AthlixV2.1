'use client';

export function LegacyDashboardApp() {
  return (
    <main className="min-h-screen bg-black">
      <iframe
        title="Athlix Application"
        src="/legacy-app/index.html"
        className="h-screen w-full border-0"
      />
    </main>
  );
}
