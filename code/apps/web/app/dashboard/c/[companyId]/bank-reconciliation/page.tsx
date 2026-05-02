import { Wallet } from 'lucide-react';
import { ComingSoon } from '@/components/coming-soon';
import { requireUser } from '@/lib/auth';
import { loadCompanyForUser } from '@/lib/company-context';

export const dynamic = 'force-dynamic';

export default async function BankReconciliationPage({
  params,
}: {
  params: { companyId: string };
}) {
  const me = await requireUser();
  await loadCompanyForUser(me.id, me.email, params.companyId);

  return (
    <ComingSoon
      icon={Wallet}
      title="התאמות בנק ואשראי"
      description="חיבור לבנק ולכרטיסי האשראי של החברה, התאמה אוטומטית של תשלומים לחשבוניות, וזיהוי הוצאות לא-מתועדות."
      features={[
        'חיבור Open Banking לחשבונות הבנק של החברה (לאומי, פועלים, דיסקונט, מזרחי, הבינלאומי).',
        'משיכת תנועות אשראי מ-CardCom / Tranzila / Cal / Max / Isracard.',
        'התאמה אוטומטית: כל תשלום משויך לחשבונית הספק התואמת (לפי סכום + תאריך + ספק).',
        'זיהוי תשלומים בלי חשבונית — בקשה אוטומטית מהספק.',
        'זיהוי חשבוניות בלי תשלום — התראה לפני סוף החודש.',
        'התאמת מטבע חוץ — שערי חליפין יומיים מבנק ישראל.',
        'יצירת JE-ים אוטומטיים עבור עמלות בנק, ריבית, והעברות פנימיות.',
      ]}
    />
  );
}
