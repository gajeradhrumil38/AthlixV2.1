import { createBrowserClient } from '@supabase/ssr';

const env = import.meta.env as Record<string, string | undefined>;

const supabaseUrl =
  env.VITE_SUPABASE_URL ||
  env.NEXT_PUBLIC_SUPABASE_URL;

const supabaseAnonKey =
  env.VITE_SUPABASE_ANON_KEY ||
  env.VITE_SUPABASE_PUBLISHABLE_KEY ||
  env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
  env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

// CRITICAL: Use createBrowserClient (from @supabase/ssr) instead of vanilla
// createClient. @supabase/ssr stores the session in COOKIES — which matches
// how the Next.js app stores it. If we used vanilla createClient (localStorage),
// the Vite app in the /dashboard iframe would never find the session that the
// Next.js login established, causing an instant redirect to /auth (black screen).
export const hasSupabaseConfig = Boolean(supabaseUrl && supabaseAnonKey);

const missingSupabaseEnvMessage =
  'Missing Supabase env vars for legacy app: set VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY (or VITE_SUPABASE_ANON_KEY).';

type BrowserSupabaseClient = ReturnType<typeof createBrowserClient>;

const createMissingConfigClient = (): BrowserSupabaseClient =>
  new Proxy(
    {},
    {
      get() {
        throw new Error(missingSupabaseEnvMessage);
      },
    },
  ) as BrowserSupabaseClient;

export const supabase = hasSupabaseConfig
  ? createBrowserClient(supabaseUrl as string, supabaseAnonKey as string, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
      },
    })
  : createMissingConfigClient();
