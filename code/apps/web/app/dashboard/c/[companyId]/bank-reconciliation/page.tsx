import { Wallet } from 'lucide-react';
import { requireUser } from '@/lib/auth';
import { loadCompanyForUser } from '@/lib/company-context';
import { getAdminClient } from '@/lib/supabase/admin';
import { BankPanel, type BankTxnRow, type TxnStatus } from './bank-panel';

export const dynamic = 'force-dynamic';

interface DBTxn {
  id: string;
  txn_date: string;
  bank_name: string | null;
  bank_account_number: string | null;
  description: string;
  reference: string | null;
  amount_ils: number;
  balance_after: number | null;
  status: TxnStatus;
  source: 'csv' | 'manual' | 'open_banking';
}

export default async function BankReconciliationPage({
  params,
}: {
  params: { companyId: string };
}) {
  const me = await requireUser();
  const company = await loadCompanyForUser(me.id, me.email, params.companyId);

  const admin = getAdminClient();
  const { data } = await admin
    .from('bank_transactions')
    .select(
      'id, txn_date, bank_name, bank_account_number, description, reference, amount_ils, balance_after, status, source',
    )
    .eq('company_id', company.id)
    .order('txn_date', { ascending: false })
    .order('created_at', { ascending: false })
    .limit(2000);

  const rows: BankTxnRow[] = ((data ?? []) as DBTxn[]).map((t) => ({
    id: t.id,
    txn_date: t.txn_date,
    bank_name: t.bank_name,
    bank_account_number: t.bank_account_number,
    description: t.description,
    reference: t.reference,
    amount_ils: Number(t.amount_ils),
    balance_after: t.balance_after !== null ? Number(t.balance_after) : null,
    status: t.status,
    source: t.source,
  }));

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-lg font-semibold text-ink-900 flex items-center gap-2">
          <Wallet size={18} className="text-brand-500" />
          התאמת בנק ואשראי
        </h2>
        <p className="text-sm text-ink-600 mt-0.5">
          תנועות בנק / כרטיס אשראי של {company.name}. ייבוא CSV מבנקים ישראליים
          (הפועלים / לאומי / דיסקונט וכו׳), הוספת תנועות ידניות, סימון תנועות
          כ-"הותאם" כשהן מקושרות לפקודת יומן.
        </p>
      </div>

      <BankPanel rows={rows} companyId={company.id} />

      <div className="bg-ink-50/40 border border-ink-100 rounded-lg p-3 text-xs text-ink-600 leading-relaxed">
        <strong>התאמה אוטומטית</strong> — לחץ על הכפתור בסרגל לסריקת כל התנועות
        הלא-מותאמות. המערכת מקשרת אוטומטית כשסכום התנועה תואם JE עם תאריך
        חשבונית בחלון של 7 ימים. אם יש יותר מ-JE אחד תואם, התנועה נשארת ידנית.
      </div>
    </div>
  );
}
