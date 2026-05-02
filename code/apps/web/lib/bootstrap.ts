import { getAdminClient } from '@/lib/supabase/admin';

/**
 * Ensures the user has a firm + membership. Idempotent.
 * Returns the firm_id the user belongs to.
 */
export async function ensureUserFirm(userId: string, email: string): Promise<string> {
  const admin = getAdminClient();

  // Already linked?
  const { data: existing } = await admin
    .from('user_firms')
    .select('firm_id')
    .eq('user_id', userId)
    .limit(1)
    .maybeSingle();

  if (existing) return existing.firm_id as string;

  // Create firm + link.
  const firmName = email.split('@')[0] ?? 'משרד';
  const { data: firm, error: firmError } = await admin
    .from('firms')
    .insert({ name: firmName, owner_user_id: userId })
    .select('id')
    .single();
  if (firmError || !firm) {
    throw new Error(`Failed to create firm: ${firmError?.message ?? 'unknown'}`);
  }

  const { error: linkError } = await admin
    .from('user_firms')
    .insert({ user_id: userId, firm_id: firm.id, role: 'owner' });
  if (linkError) {
    throw new Error(`Failed to link user to firm: ${linkError.message}`);
  }

  await admin.from('users').update({ default_firm_id: firm.id }).eq('id', userId);

  return firm.id as string;
}
