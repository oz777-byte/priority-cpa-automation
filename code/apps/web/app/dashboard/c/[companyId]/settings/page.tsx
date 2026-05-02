import { Settings, AlertCircle } from 'lucide-react';
import { ComingSoon } from '@/components/coming-soon';
import { requireUser } from '@/lib/auth';
import { loadCompanyForUser } from '@/lib/company-context';
import type { CompanySettings } from '@/lib/company-config';

export const dynamic = 'force-dynamic';

export default async function CompanySettingsPage({
  params,
}: {
  params: { companyId: string };
}) {
  const me = await requireUser();
  const company = await loadCompanyForUser(me.id, me.email, params.companyId);
  const settings = (company.settings ?? {}) as CompanySettings;

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-ink-900 flex items-center gap-2">
          <Settings size={18} className="text-brand-500" />
          הגדרות חברה
        </h2>
        <p className="text-sm text-ink-600 mt-0.5">
          הגדרות של {company.name} — חשבונות חשבונאיים, מטבע, סוג תנועה.
        </p>
      </div>

      <section className="bg-white border border-ink-200 rounded-xl p-5 space-y-4">
        <h3 className="text-sm font-semibold text-ink-900">פרטים חשבונאיים</h3>
        <dl className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
          <ReadOnlyField label="שם החברה" value={company.name} />
          <ReadOnlyField label="מספר עוסק" value={company.tax_id} dir="ltr" />
          <ReadOnlyField label="גרסת פריוריטי" value={company.priority_version ?? '—'} dir="ltr" />
          <ReadOnlyField label="סטטוס" value={statusLabel(company.status)} />
          <ReadOnlyField label="חשבון הוצאה ברירת מחדל" value={settings.expense_account ?? '502-0'} dir="ltr" />
          <ReadOnlyField label='חשבון מע"מ תשומות' value={settings.vat_input_account ?? '205-2'} dir="ltr" />
          <ReadOnlyField label="סוג תנועה" value={settings.transaction_type ?? 'מ'} />
          <ReadOnlyField label="קידומת פרטים" value={settings.details_prefix ?? 'קניות'} />
        </dl>
        <div className="text-xs text-ink-400 flex items-center gap-1.5 pt-2 border-t border-ink-100">
          <AlertCircle size={12} />
          לעת עתה הערכים נקבעו בעת יצירת החברה. עריכת הגדרות חברה תתאפשר בקרוב.
        </div>
      </section>

      <ComingSoon
        title="עוד הגדרות בקרוב"
        description="מסך זה יורחב להגדרות מלאות של החברה."
        features={[
          'עריכת שם, ע.מ ופרטי קשר.',
          'הגדרת חשבונות ברירת מחדל לפי סוג הוצאה (קניות, שירותים, חומרי גלם).',
          'הגדרת מרכזי עלות (פרויקטים, מחלקות).',
          'הגדרות מטבע חוץ — חשבונות USD/EUR נפרדים.',
          'מקור שערי חליפין: בנק ישראל אוטומטי / הזנה ידנית.',
          'הקצאת רף — חוק 2024+ (מתי חובה מספר הקצאה).',
          'PCN874 — הגדרות דיווח מע"מ מקוון.',
          'השעיה / ארכוב של החברה.',
        ]}
      />
    </div>
  );
}

function statusLabel(status: string): string {
  return { active: 'פעיל', paused: 'מושהה', archived: 'בארכיון' }[status] ?? status;
}

function ReadOnlyField({
  label,
  value,
  dir,
}: {
  label: string;
  value: string;
  dir?: 'ltr' | 'rtl';
}) {
  return (
    <div>
      <dt className="text-xs text-ink-600 mb-1">{label}</dt>
      <dd className="px-3 py-2 bg-ink-50 border border-ink-200 rounded text-ink-900" dir={dir}>
        {value}
      </dd>
    </div>
  );
}
