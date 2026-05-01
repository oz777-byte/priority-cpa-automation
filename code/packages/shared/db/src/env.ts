import { z } from 'zod';

export const SupabaseEnvSchema = z.object({
  SUPABASE_URL: z.string().url(),
  SUPABASE_PUBLISHABLE_KEY: z.string().min(20),
  SUPABASE_SECRET_KEY: z.string().min(20).optional(),
});

export type SupabaseEnv = z.infer<typeof SupabaseEnvSchema>;

export interface PartialSupabaseEnv {
  SUPABASE_URL?: string;
  SUPABASE_PUBLISHABLE_KEY?: string;
  SUPABASE_SECRET_KEY?: string;
}

export function readSupabaseEnv(source: Record<string, string | undefined> = process.env): SupabaseEnv {
  return SupabaseEnvSchema.parse({
    SUPABASE_URL: source.SUPABASE_URL,
    SUPABASE_PUBLISHABLE_KEY: source.SUPABASE_PUBLISHABLE_KEY,
    SUPABASE_SECRET_KEY: source.SUPABASE_SECRET_KEY,
  });
}

export interface SupabaseAdminEnv extends SupabaseEnv {
  SUPABASE_SECRET_KEY: string;
}

export function readAdminEnv(source: Record<string, string | undefined> = process.env): SupabaseAdminEnv {
  const env = readSupabaseEnv(source);
  const secretKey = env.SUPABASE_SECRET_KEY;
  if (!secretKey) {
    throw new Error('SUPABASE_SECRET_KEY is required for admin operations');
  }
  return { ...env, SUPABASE_SECRET_KEY: secretKey };
}
