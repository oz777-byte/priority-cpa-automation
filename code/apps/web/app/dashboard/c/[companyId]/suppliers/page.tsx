import { Users } from 'lucide-react';
import { ComingSoon } from '@/components/coming-soon';
import { requireUser } from '@/lib/auth';
import { loadCompanyForUser } from '@/lib/company-context';

export const dynamic = 'force-dynamic';

export default async function SuppliersPage({
  params,
}: {
  params: { companyId: string };
}) {
  const me = await requireUser();
  await loadCompanyForUser(me.id, me.email, params.companyId);

  return (
    <ComingSoon
      icon={Users}
      title="ניהול ספקים"
      description="מאסטר הספקים של החברה: הוספה, עריכה, מיזוג כפולים, ניהול aliases ללמידה אוטומטית של חתימות חשבוניות חדשות."
      features={[
        'ייבוא מאסטר ספקים מפריוריטי בלחיצה (דרך API או xlsx).',
        'התאמה אוטומטית של ספק חדש מהחשבונית למאסטר (5-layer cascade: tax_id → alias → fuzzy → AI).',
        'ניהול aliases — שמות תרגומים שהמערכת לומדת מהאישורים שלך.',
        'איתור כפילויות (אותו ע.מ עם 2 רשומות נפרדות) ומיזוג בלחיצה.',
        'הגדרת חשבון ברירת מחדל לכל ספק (חשבון הוצאה, מרכז עלות).',
      ]}
      eta="Phase 2 (כחודש)"
    />
  );
}
