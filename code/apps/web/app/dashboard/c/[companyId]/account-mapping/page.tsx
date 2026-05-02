import { GitBranch } from 'lucide-react';
import { ComingSoon } from '@/components/coming-soon';
import { requireUser } from '@/lib/auth';
import { loadCompanyForUser } from '@/lib/company-context';

export const dynamic = 'force-dynamic';

export default async function AccountMappingPage({
  params,
}: {
  params: { companyId: string };
}) {
  const me = await requireUser();
  await loadCompanyForUser(me.id, me.email, params.companyId);

  return (
    <ComingSoon
      icon={GitBranch}
      title="כללי מיפוי חשבונות"
      description="מנוע כללים שמחליט אוטומטית לאיזה חשבון בכרטסת ילך כל סוג הוצאה. מאפשר התאמה ספציפית לכל חברה — בלי לכתוב קוד."
      features={[
        'הוספת כלל: "כל חשבונית מספק X → חשבון 502-1 + מרכז עלות PROJ-A".',
        'סדר עדיפויות: כללים ספציפיים גוברים על general defaults.',
        'מצב learn — המערכת מציעה כללים על בסיס דפוסי האישור שלך.',
        'יבוא/ייצוא של רשימת כללים בין חברות דומות.',
        'preview: ראה איך כל הכללים יחולו על 10 חשבוניות אחרונות לפני שמירה.',
      ]}
      eta="Phase 2 (כחודש)"
    />
  );
}
