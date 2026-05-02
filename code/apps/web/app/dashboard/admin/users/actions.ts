'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { SupabaseAuditStore } from '@priority-cpa/audit-logger';
import { requireAdmin } from '@/lib/auth';
import { ensureUserFirm } from '@/lib/bootstrap';
import { getAdminClient } from '@/lib/supabase/admin';
import { generateTemporaryPassword } from '@/lib/password';

const EmailSchema = z.string().email();
const RoleSchema = z.enum(['admin', 'member']);
const FirmRoleSchema = z.enum(['owner', 'admin', 'member', 'auditor']);
const UserIdSchema = z.string().uuid();

const FIRM_USER_LIMIT = 5;

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

  const myFirmId = await ensureUserFirm(me.id, me.email);

  const emailParse = EmailSchema.safeParse(formData.get('email'));
  if (!emailParse.success) return { ok: false, error: 'אימייל לא תקין' };
  const roleParse = RoleSchema.safeParse(formData.get('role') ?? 'member');
  if (!roleParse.success) return { ok: false, error: 'תפקיד לא תקין' };

  const email = emailParse.data.trim().toLowerCase();
  const role = roleParse.data;

  // Per-firm seat cap (counts active memberships in the inviter's firm).
  const { count: firmMemberCount } = await admin
    .from('user_firms')
    .select('*', { count: 'exact', head: true })
    .eq('firm_id', myFirmId);
  if ((firmMemberCount ?? 0) >= FIRM_USER_LIMIT) {
    return {
      ok: false,
      error: `הגעת למכסת ${FIRM_USER_LIMIT} משתמשים במשרד. הסר משתמש קיים קודם.`,
    };
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
  const newUserId = data.user.id;

  // The new-user trigger has just created a fresh firm + ownership for the
  // invited user. Move them into the inviter's firm and clean up.
  if (role === 'admin') {
    await admin.from('users').update({ role: 'admin' }).eq('id', newUserId);
  }

  // Find (and remember) the auto-created firm so we can dispose of it.
  const { data: autoFirm } = await admin
    .from('firms')
    .select('id')
    .eq('owner_user_id', newUserId)
    .maybeSingle();

  // Link new user to the inviter's firm. Firm role mirrors the system role:
  // 'admin' → 'admin', everyone else → 'member'.
  const firmRole = role === 'admin' ? 'admin' : 'member';
  const { error: linkErr } = await admin
    .from('user_firms')
    .upsert(
      { user_id: newUserId, firm_id: myFirmId, role: firmRole },
      { onConflict: 'user_id,firm_id' },
    );
  if (linkErr) {
    return { ok: false, error: `קישור למשרד נכשל: ${linkErr.message}` };
  }

  await admin
    .from('users')
    .update({ default_firm_id: myFirmId })
    .eq('id', newUserId);

  // Delete the auto-created firm if it has no companies (it shouldn't,
  // since the user just signed up). Membership cascades on firm delete.
  if (autoFirm?.id && (autoFirm.id as string) !== myFirmId) {
    const { count: companyCount } = await admin
      .from('companies')
      .select('*', { count: 'exact', head: true })
      .eq('firm_id', autoFirm.id);
    if ((companyCount ?? 0) === 0) {
      await admin
        .from('user_firms')
        .delete()
        .eq('user_id', newUserId)
        .eq('firm_id', autoFirm.id);
      await admin.from('firms').delete().eq('id', autoFirm.id);
    }
  }

  await audit.log({
    companyId: '',
    userId: me.id,
    action: 'user.invite',
    entityType: 'user',
    entityId: newUserId,
    payload: {
      email,
      role,
      firm_role: firmRole,
      firm_id: myFirmId,
      invited_by: me.email,
    },
  });

  revalidatePath('/dashboard/admin/users');
  return { ok: true, email, temporaryPassword: password };
}

export async function removeUserAction(
  formData: FormData,
): Promise<{ ok: boolean; error?: string }> {
  const me = await requireAdmin();
  const admin = getAdminClient();
  const audit = new SupabaseAuditStore(admin);

  const targetIdParse = UserIdSchema.safeParse(formData.get('userId'));
  if (!targetIdParse.success) return { ok: false, error: 'מזהה משתמש לא תקין' };
  const targetId = targetIdParse.data;

  if (targetId === me.id) {
    return { ok: false, error: 'אינך יכול להסיר את עצמך' };
  }

  const myFirmId = await ensureUserFirm(me.id, me.email);

  // Snapshot the row + firm role for the audit payload.
  const { data: targetRow } = await admin
    .from('users')
    .select('id, email, role')
    .eq('id', targetId)
    .maybeSingle();

  // Soft remove: just delete the user_firms link. The auth user stays
  // (they may belong to other firms; if not, they'll auto-bootstrap a
  // fresh firm at next login).
  const { error } = await admin
    .from('user_firms')
    .delete()
    .eq('user_id', targetId)
    .eq('firm_id', myFirmId);
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
      removed_from_firm: myFirmId,
      removed_by: me.email,
    },
  });

  revalidatePath('/dashboard/admin/users');
  return { ok: true };
}

export async function setUserRoleAction(
  formData: FormData,
): Promise<{ ok: boolean; error?: string }> {
  const me = await requireAdmin();
  const admin = getAdminClient();
  const audit = new SupabaseAuditStore(admin);

  const targetIdParse = UserIdSchema.safeParse(formData.get('userId'));
  const roleParse = FirmRoleSchema.safeParse(formData.get('role'));
  if (!targetIdParse.success) return { ok: false, error: 'מזהה משתמש לא תקין' };
  if (!roleParse.success) return { ok: false, error: 'תפקיד לא תקין' };

  const targetId = targetIdParse.data;
  const newFirmRole = roleParse.data;

  if (targetId === me.id && newFirmRole !== 'owner' && newFirmRole !== 'admin') {
    return { ok: false, error: 'אינך יכול להוריד את התפקיד של עצמך' };
  }

  const myFirmId = await ensureUserFirm(me.id, me.email);

  const { error } = await admin
    .from('user_firms')
    .update({ role: newFirmRole })
    .eq('user_id', targetId)
    .eq('firm_id', myFirmId);
  if (error) return { ok: false, error: error.message };

  // Mirror admin/member onto the system-level users.role for backwards
  // compatibility with requireAdmin and similar helpers.
  if (newFirmRole === 'admin' || newFirmRole === 'owner') {
    await admin.from('users').update({ role: 'admin' }).eq('id', targetId);
  } else {
    await admin.from('users').update({ role: 'member' }).eq('id', targetId);
  }

  await audit.log({
    companyId: '',
    userId: me.id,
    action: 'user.role_change',
    entityType: 'user',
    entityId: targetId,
    payload: { firm_id: myFirmId, new_role: newFirmRole, changed_by: me.email },
  });

  revalidatePath('/dashboard/admin/users');
  return { ok: true };
}
