import { redirect } from 'next/navigation';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { getAdminClient } from '@/lib/supabase/admin';

export type AppRole = 'admin' | 'member';

export interface AppUser {
  id: string;
  email: string;
  role: AppRole;
}

/** Returns the authenticated user with their app-level role, or null. */
export async function getAppUser(): Promise<AppUser | null> {
  const supabase = createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  // Use admin client to read public.users (bypasses RLS bootstrap chicken-egg).
  const admin = getAdminClient();
  const { data, error } = await admin
    .from('users')
    .select('id, email, role')
    .eq('id', user.id)
    .maybeSingle();
  if (error || !data) {
    return { id: user.id, email: user.email ?? '', role: 'member' };
  }
  return {
    id: data.id as string,
    email: (data.email as string) ?? user.email ?? '',
    role: (data.role as AppRole) ?? 'member',
  };
}

/** Redirects to /login if no session. */
export async function requireUser(): Promise<AppUser> {
  const user = await getAppUser();
  if (!user) redirect('/login');
  return user;
}

/** Redirects to /dashboard if not admin. */
export async function requireAdmin(): Promise<AppUser> {
  const user = await requireUser();
  if (user.role !== 'admin') redirect('/dashboard');
  return user;
}
