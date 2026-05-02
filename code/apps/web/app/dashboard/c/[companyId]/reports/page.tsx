import { BarChart3 } from 'lucide-react';
import { ComingSoon } from '@/components/coming-soon';
import { requireUser } from '@/lib/auth';
import { loadCompanyForUser } from '@/lib/company-context';

export const dynamic = 'force-dynamic';

export default async function CompanyReportsPage({
  params,
}: {
  params: { companyId: string };
}) {
  const me = await requireUser();
  await loadCompanyForUser(me.id, me.email, params.companyId);

  return (
    <ComingSoon
      icon={BarChart3}
      title="דוחות חברה"
      description="ראייה על הפעילות של החברה — חתך לפי ספק, סוג הוצאה, תאריך, ו-KPIs להעברה ללקוח."
      features={[
        'דוח הוצאות חודשי / רבעוני / שנתי לפי ספק וקטגוריה.',
        'דוח מע"מ תשומות מצטבר.',
        'התראות על חשבוניות בלי הקצאה (חוק 2024+).',
        'גרף זמן: כמה זמן לקח לאשר כל JE (לטיוב התהליך).',
        'ייצוא ל-Excel / PDF להעברה ללקוח.',
      ]}
      eta="Phase 3 (חודשיים)"
    />
  );
}
