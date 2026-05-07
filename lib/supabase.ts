import { createBrowserClient, createServerClient } from '@supabase/ssr';
import { createClient as createSupabaseAdminClient } from '@supabase/supabase-js';
import type { Database } from './database.types';

const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const MISSING_SUPABASE_ENV_MESSAGE =
  'Missing Supabase public env vars. Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY (or NEXT_PUBLIC_SUPABASE_ANON_KEY).';

export const getPublicSupabaseEnv = () => {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const publicKey =
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

  if (!url || !publicKey) {
    throw new Error(MISSING_SUPABASE_ENV_MESSAGE);
  }

  return { url, publicKey };
};

export function createClient() {
  const { url, publicKey } = getPublicSupabaseEnv();

  return createBrowserClient<Database>(url, publicKey, {
    auth: {
      flowType: 'pkce',
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: true,
    },
  });
}

export const createBrowserSupabaseClient = createClient;

/**
 * A separate client used ONLY for resetPasswordForEmail.
 * Uses implicit flow (no PKCE) so the reset link contains a token_hash
 * instead of a code+verifier pair. This means the link works in any browser
 * or email client — not just the one that requested the reset.
 * (PKCE reset links fail when opened in a different browser/app because
 * the code_verifier cookie doesn't travel with the user.)
 */
export function createPasswordResetClient() {
  const { url, publicKey } = getPublicSupabaseEnv();

  return createBrowserClient<Database>(url, publicKey, {
    auth: {
      flowType: 'implicit',
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}

export async function createServerSupabaseClient() {
  const { cookies } = await import('next/headers');
  const cookieStore = cookies();
  const env = getPublicSupabaseEnv();

  return createServerClient<Database>(env.url, env.publicKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet: any[]) {
        try {
          cookiesToSet.forEach(({ name, value, options }) => {
            cookieStore.set(name, value, options);
          });
        } catch {
          // Called during Server Component rendering, middleware handles refresh cookies.
        }
      },
    },
    auth: {
      flowType: 'pkce',
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: true,
    },
  });
}

export async function createRouteHandlerSupabaseClient() {
  const { cookies } = await import('next/headers');
  const cookieStore = cookies();
  const env = getPublicSupabaseEnv();

  return createServerClient<Database>(env.url, env.publicKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet: any[]) {
        cookiesToSet.forEach(({ name, value, options }) => {
          cookieStore.set(name, value, options);
        });
      },
    },
    auth: {
      flowType: 'pkce',
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: true,
    },
  });
}

export function createServiceRoleSupabaseClient() {
  if (!supabaseServiceRoleKey) {
    throw new Error('Missing SUPABASE_SERVICE_ROLE_KEY');
  }

  const env = getPublicSupabaseEnv();

  return createSupabaseAdminClient<Database>(env.url, supabaseServiceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}
