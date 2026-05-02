import { requireAdmin } from '@/lib/auth';
import { ensureUserFirm } from '@/lib/bootstrap';
import { getAdminClient } from '@/lib/supabase/admin';
import { UsersAdminPanel, type UserListRow, type FirmRole } from './users-panel';

export const dynamic = 'force-dynamic';

const FIRM_USER_LIMIT = 5;

export default async function AdminUsersPage() {
  const me = await requireAdmin();
  const admin = getAdminClient();
  const myFirmId = await ensureUserFirm(me.id, me.email);

  // Pull memberships scoped to my firm + the user profile.
  const { data: memberships } = await admin
    .from('user_firms')
    .select('user_id, role, created_at, users(email)')
    .eq('firm_id', myFirmId);

  // Supabase returns the joined relation as an array even for to-one joins.
  type MembershipRaw = {
    user_id: string;
    role: FirmRole;
    created_at: string;
    users: { email: string } | { email: string }[] | null;
  };

  function emailOf(u: MembershipRaw['users']): string | null {
    if (!u) return null;
    if (Array.isArray(u)) return u[0]?.email ?? null;
    return u.email;
  }

  const memberRows = (memberships ?? []) as unknown as MembershipRaw[];

  // Fold in last_sign_in_at from the auth admin API.
  const { data: authPage } = await admin.auth.admin.listUsers({
    page: 1,
    perPage: 200,
  });
  const lastSignIn = new Map<string, string | null>();
  for (const u of authPage?.users ?? []) {
    lastSignIn.set(u.id, u.last_sign_in_at ?? null);
  }

  const rows: UserListRow[] = memberRows
    .map((m) => {
      const email = emailOf(m.users);
      if (!email) return null;
      return {
        id: m.user_id,
        email,
        firmRole: m.role,
        memberSince: m.created_at,
        lastSignIn: lastSignIn.get(m.user_id) ?? null,
      } satisfies UserListRow;
    })
    .filter((r): r is UserListRow => r !== null)
    .sort((a, b) => a.email.localeCompare(b.email));

  const { data: firmRow } = await admin
    .from('firms')
    .select('name')
    .eq('id', myFirmId)
    .maybeSingle();
  const firmName = (firmRow?.name as string | null) ?? 'המשרד שלי';

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <header>
        <h1 className="text-2xl font-bold text-ink-900">ניהול משתמשי המשרד</h1>
        <p className="text-ink-600 mt-1 text-sm">
          משתמשי {firmName}: {rows.length} מתוך {FIRM_USER_LIMIT}.
          הזמנת משתמש מקשרת אותו אוטומטית למשרד שלך — הוא יראה את כל החברות שאתה רואה.
        </p>
      </header>

      <UsersAdminPanel rows={rows} currentUserId={me.id} atLimit={rows.length >= FIRM_USER_LIMIT} />
    </div>
  );
}
