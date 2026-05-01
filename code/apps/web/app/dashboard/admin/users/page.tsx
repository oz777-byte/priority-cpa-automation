import { requireAdmin } from '@/lib/auth';
import { getAdminClient } from '@/lib/supabase/admin';
import { UsersAdminPanel } from './users-panel';

export const dynamic = 'force-dynamic';

interface Row {
  id: string;
  email: string;
  role: 'admin' | 'member';
  created_at: string;
  last_sign_in_at: string | null;
}

export default async function AdminUsersPage() {
  const me = await requireAdmin();
  const admin = getAdminClient();

  const { data: appUsers } = await admin
    .from('users')
    .select('id, email, role, created_at')
    .order('created_at', { ascending: true });

  const { data: authPage } = await admin.auth.admin.listUsers({ page: 1, perPage: 50 });
  const lastSignIn = new Map<string, string | null>();
  for (const u of authPage?.users ?? []) {
    lastSignIn.set(u.id, u.last_sign_in_at ?? null);
  }

  const rows: Row[] = (appUsers ?? []).map((u) => ({
    id: u.id as string,
    email: (u.email as string) ?? '',
    role: (u.role as 'admin' | 'member') ?? 'member',
    created_at: (u.created_at as string) ?? '',
    last_sign_in_at: lastSignIn.get(u.id as string) ?? null,
  }));

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <header>
        <h1 className="text-2xl font-bold text-ink-900">ניהול משתמשים</h1>
        <p className="text-ink-600 mt-1 text-sm">
          מקסימום 5 משתמשים בחשבון. כרגע רשומים: {rows.length} מתוך 5.
        </p>
      </header>

      <UsersAdminPanel rows={rows} currentUserId={me.id} />
    </div>
  );
}
