'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { SupabaseAuditStore } from '@priority-cpa/audit-logger';
import { requireAdmin } from '@/lib/auth';
import { getAdminClient } from '@/lib/supabase/admin';
import { generateTemporaryPassword } from '@/lib/password';

const EmailSchema = z.string().email();
const RoleSchema = z.enum(['admin', 'member']);
const UserIdSchema = z.string().uuid();

export interface InviteResult {
  ok: boolean;
  error?: string;
  email?: string;
  temporaryPassword?: string;
}

export async function inviteUserAction(formData: FormData): Promise<InviteResult> {
  const me = await requireAdmin();
  const admin = getAdminClient();
  const audit = new SupabaseAuditStore(admin);

  const emailRaw = formData.get('email');
  const roleRaw = formData.get('role') ?? 'member';

  const emailParse = EmailSchema.safeParse(emailRaw);
  if (!emailParse.success) return { ok: false, error: 'אימייל לא תקין' };
  const roleParse = RoleSchema.safeParse(roleRaw);
  if (!roleParse.success) return { ok: false, error: 'תפקיד לא תקין' };

  const email = emailParse.data.trim().toLowerCase();
  const role = roleParse.data;

  // Pre-flight: count current users (cheaper than listUsers, returns just a count).
  const { count } = await admin
    .from('users')
    .select('*', { count: 'exact', head: true });
  if ((count ?? 0) >= 5) {
    return { ok: false, error: 'הגעת למכסת 5 משתמשים. הסר משתמש קיים קודם.' };
  }

  const password = generateTemporaryPassword();
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  if (error || !data.user) {
    return { ok: false, error: error?.message ?? 'יצירת משתמש נכשלה' };
  }

  // The DB trigger creates public.users with default role 'member'.
  // If admin role requested, update it.
  if (role === 'admin') {
    await admin.from('users').update({ role: 'admin' }).eq('id', data.user.id);
  }

  await audit.log({
    companyId: '',
    userId: me.id,
    action: 'user.invite',
    entityType: 'user',
    entityId: data.user.id,
    payload: { email, role, invited_by: me.email },
  });

  revalidatePath('/dashboard/admin/users');
  return { ok: true, email, temporaryPassword: password };
}

export async function removeUserAction(formData: FormData): Promise<{ ok: boolean; error?: string }> {
  const me = await requireAdmin();
  const admin = getAdminClient();
  const audit = new SupabaseAuditStore(admin);

  const targetIdParse = UserIdSchema.safeParse(formData.get('userId'));
  if (!targetIdParse.success) return { ok: false, error: 'מזהה משתמש לא תקין' };
  const targetId = targetIdParse.data;

  if (targetId === me.id) {
    return { ok: false, error: 'אינך יכול למחוק את עצמך' };
  }

  // Snapshot the row for the audit payload before deletion.
  const { data: targetRow } = await admin
    .from('users')
    .select('id, email, role')
    .eq('id', targetId)
    .maybeSingle();

  const { error } = await admin.auth.admin.deleteUser(targetId);
  if (error) return { ok: false, error: error.message };

  await audit.log({
    companyId: '',
    userId: me.id,
    action: 'user.remove',
    entityType: 'user',
    entityId: targetId,
    payload: {
      removed_email: targetRow?.email ?? '(unknown)',
      removed_role: targetRow?.role ?? '(unknown)',
      removed_by: me.email,
    },
  });

  revalidatePath('/dashboard/admin/users');
  return { ok: true };
}

export async function setUserRoleAction(formData: FormData): Promise<{ ok: boolean; error?: string }> {
  const me = await requireAdmin();
  const admin = getAdminClient();
  const audit = new SupabaseAuditStore(admin);

  const targetIdParse = UserIdSchema.safeParse(formData.get('userId'));
  const roleParse = RoleSchema.safeParse(formData.get('role'));
  if (!targetIdParse.success) return { ok: false, error: 'מזהה משתמש לא תקין' };
  if (!roleParse.success) return { ok: false, error: 'תפקיד לא תקין' };

  const targetId = targetIdParse.data;
  const role = roleParse.data;

  if (targetId === me.id && role !== 'admin') {
    return { ok: false, error: 'אינך יכול להוריד את התפקיד של עצמך' };
  }

  const { error } = await admin.from('users').update({ role }).eq('id', targetId);
  if (error) return { ok: false, error: error.message };

  await audit.log({
    companyId: '',
    userId: me.id,
    action: 'user.role_change',
    entityType: 'user',
    entityId: targetId,
    payload: { new_role: role, changed_by: me.email },
  });

  revalidatePath('/dashboard/admin/users');
  return { ok: true };
}
