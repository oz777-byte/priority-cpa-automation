import { ListTree } from 'lucide-react';
import { requireUser } from '@/lib/auth';
import { loadCompanyForUser } from '@/lib/company-context';
import { getAdminClient } from '@/lib/supabase/admin';
import { AccountsPanel, type AccountRow, type AccountType } from './accounts-panel';

export const dynamic = 'force-dynamic';

interface DBAccount {
  id: string;
  code: string;
  name: string;
  type: AccountType;
  parent_account_id: string | null;
  is_active: boolean;
  is_system: boolean;
  notes: string | null;
}

export default async function AccountsPage({
  params,
}: {
  params: { companyId: string };
}) {
  const me = await requireUser();
  const company = await loadCompanyForUser(me.id, me.email, params.companyId);
  const admin = getAdminClient();

  const { data } = await admin
    .from('accounts')
    .select('id, code, name, type, parent_account_id, is_active, is_system, notes')
    .eq('company_id', company.id)
    .order('code', { ascending: true });

  const accounts = (data ?? []) as DBAccount[];
  const codeById = new Map(accounts.map((a) => [a.id, a.code]));

  const rows: AccountRow[] = accounts.map((a) => ({
    id: a.id,
    code: a.code,
    name: a.name,
    type: a.type,
    parent_account_id: a.parent_account_id,
    parent_code: a.parent_account_id ? codeById.get(a.parent_account_id) ?? null : null,
    is_active: a.is_active,
    is_system: a.is_system,
    notes: a.notes,
  }));

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-lg font-semibold text-ink-900 flex items-center gap-2">
          <ListTree size={18} className="text-brand-500" />
          תרשים החשבונות
        </h2>
        <p className="text-sm text-ink-600 mt-0.5">
          תרשים החשבונות (Chart of Accounts) של {company.name}. חשבונות בסיסיים
          נטענים אוטומטית בעת יצירת חברה — סמן כלא-פעילים מה שאינך משתמש בו,
          והוסף חשבונות נוספים לפי הצורך.
        </p>
      </div>

      <AccountsPanel rows={rows} companyId={company.id} />

      <div className="bg-ink-50/40 border border-ink-100 rounded-lg p-3 text-xs text-ink-600 leading-relaxed">
        <strong>מוסכמת קידוד ישראלית:</strong> 100-199 נכסים שוטפים · 140-149
        נכסי קבע · 200-299 התחייבויות וספקים · 205-2 מע"מ תשומות · 220-0 מע"מ
        עסקאות · 500-599 הוצאות · 600-699 שכר · 700-799 הכנסות · 800-999 הון.
      </div>
    </div>
  );
}
