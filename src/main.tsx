import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import './index.css';
import { supabase } from './lib/supabase';

/**
 * Bootstrap: if running inside the Next.js /dashboard iframe, wait for the
 * parent to inject the Supabase session via postMessage BEFORE we render
 * React. This guarantees AuthContext.getCurrentUserAsync() finds a valid
 * user on first call, preventing the "black screen / redirect to /auth" bug.
 *
 * If running standalone (direct URL or not in an iframe), the wait is skipped
 * entirely and the app renders immediately.
 */
async function bootstrap() {
  // ── Step 1: Rescue Supabase auth tokens from the URL hash ───────────────
  // Supabase email links land as:
  //   https://app.url/legacy-app/#access_token=XXX&refresh_token=YYY&type=recovery
  // HashRouter would misinterpret this as a route. We must grab the tokens,
  // set the session, store the recovery flag, then rewrite the hash to "#/"
  // before React even touches the URL.
  const rawHash = window.location.hash.slice(1); // strip leading #
  if (rawHash.includes('access_token=')) {
    try {
      const hp = new URLSearchParams(rawHash);
      const accessToken = hp.get('access_token');
      const refreshToken = hp.get('refresh_token');
      const authType = hp.get('type'); // 'recovery' | 'signup' | 'email_change'

      if (accessToken && refreshToken) {
        await supabase.auth.setSession({ access_token: accessToken, refresh_token: refreshToken });
      }

      if (authType === 'recovery') {
        sessionStorage.setItem('athlix:password_recovery', '1');
      }
    } catch (e) {
      console.warn('Failed to parse Supabase auth redirect:', e);
    }

    // Rewrite hash so HashRouter routes to "/" cleanly
    window.history.replaceState(null, '', window.location.pathname + window.location.search + '#/');
  }

  // ── Step 2: Iframe session injection (Next.js dashboard embed) ──────────
  const isInIframe = window.self !== window.top;

  if (isInIframe) {
    await new Promise<void>((resolve) => {
      const fallback = window.setTimeout(resolve, 1000);

      const handler = async (event: MessageEvent) => {
        if (event.origin !== window.location.origin) return;
        if ((event.data as { type?: string })?.type !== 'ATHLIX_SESSION') return;

        window.clearTimeout(fallback);
        window.removeEventListener('message', handler);

        const { accessToken, refreshToken } = event.data as {
          type: string;
          accessToken: string;
          refreshToken: string;
        };

        if (accessToken && refreshToken) {
          await supabase.auth.setSession({ access_token: accessToken, refresh_token: refreshToken });
        }

        resolve();
      };

      window.addEventListener('message', handler);
    });
  }

  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <App />
    </StrictMode>,
  );
}

bootstrap();
