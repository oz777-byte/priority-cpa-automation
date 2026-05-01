import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { readAdminEnv, readSupabaseEnv } from './env.js';

type EnvSource = Record<string, string | undefined>;

const COMMON_OPTIONS = {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
  },
} as const;

/**
 * Admin client — uses the secret key. Bypasses RLS.
 * Server-side ONLY. Never instantiate from a browser bundle.
 */
export function createAdminClient(envSource?: EnvSource): SupabaseClient {
  const env = readAdminEnv(envSource);
  return createClient(env.SUPABASE_URL, env.SUPABASE_SECRET_KEY, COMMON_OPTIONS);
}

/**
 * Anon client — uses the publishable key. Subject to RLS.
 * Safe for browser bundles. Auth state is provided via {@link withAuth}.
 */
export function createAnonClient(envSource?: EnvSource): SupabaseClient {
  const env = readSupabaseEnv(envSource);
  return createClient(env.SUPABASE_URL, env.SUPABASE_PUBLISHABLE_KEY, COMMON_OPTIONS);
}

/**
 * Anon client with a user JWT. RLS sees the user as `auth.uid() = <jwt sub>`.
 * Use this for per-request server-side calls in Edge Functions / API handlers.
 */
export function createUserClient(jwt: string, envSource?: EnvSource): SupabaseClient {
  const env = readSupabaseEnv(envSource);
  return createClient(env.SUPABASE_URL, env.SUPABASE_PUBLISHABLE_KEY, {
    ...COMMON_OPTIONS,
    global: { headers: { Authorization: `Bearer ${jwt}` } },
  });
}

export type { SupabaseClient } from '@supabase/supabase-js';
