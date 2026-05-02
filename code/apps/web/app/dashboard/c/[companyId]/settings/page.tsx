import { Settings, Banknote, Percent, AlertCircle, Mail } from 'lucide-react';
import { requireUser } from '@/lib/auth';
import { loadCompanyForUser } from '@/lib/company-context';
import { CompanySettings, DEFAULT_SETTINGS } from '@/lib/company-config';
import { updateCompanySettingsAction } from './actions';
import { InboxAddressBox } from './inbox-address-box';

export const dynamic = 'force-dynamic';

export default async function CompanySettingsPage({
  params,
}: {
  params: { companyId: string };
}) {
  const me = await requireUser();
  const company = await loadCompanyForUser(me.id, me.email, params.companyId);
  const settings = (company.settings ?? {}) as CompanySettings;

  const inboxDomain = process.env.INBOUND_EMAIL_DOMAIN ?? 'inbox.app.oz-nihul.com';
  const inboxAddress = company.inbox_token
    ? `${company.inbox_token}@${inboxDomain}`
    : null;

  async function submitForm(formData: FormData): Promise<void> {
    'use server';
    const r = await updateCompanySettingsAction(formData);
    if (!r.ok) {
      throw new Error(r.error ?? 'שמירת הגדרות נכשלה');
    }
  }

  return (
    <div className="max-w-3xl space-y-5">
      <div>
        <h2 className="text-lg font-semibold text-ink-900 flex items-center gap-2">
          <Settings size={18} className="text-brand-500" />
          הגדרות חברה
        </h2>
        <p className="text-sm text-ink-600 mt-0.5">
          ההגדרות של {company.name} משפיעות על כל פקודת יומן שתיווצר. ערכים
          ריקים מקבלים ברירת מחדל ישראלית סטנדרטית.
        </p>
      </div>

      {/* Read-only company facts */}
      <section className="bg-white border border-ink-200 rounded-xl p-5 space-y-3">
        <h3 className="text-xs uppercase tracking-wider text-ink-500 font-semibold">
          זהות החברה
        </h3>
        <div className="grid grid-cols-2 gap-4 text-sm">
          <ReadOnly label="שם" value={company.name} />
          <ReadOnly label="מספר עוסק" value={company.tax_id} dir="ltr" />
          <ReadOnly label="גרסת פריוריטי" value={company.priority_version ?? '—'} dir="ltr" />
          <ReadOnly label="סטטוס" value={statusLabel(company.status)} />
        </div>
        <div className="text-xs text-ink-400 flex items-center gap-1.5 pt-1">
          <AlertCircle size={11} />
          לעריכת שם/ע.מ — ניהול חברות ← פתיחת חברה
        </div>
      </section>

      {inboxAddress && (
        <section className="bg-white border border-ink-200 rounded-xl p-5 space-y-3">
          <div className="flex items-start gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-accent-500/10 text-accent-600 flex items-center justify-center flex-shrink-0">
              <Mail size={15} />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-ink-900">
                כתובת לקליטת חשבוניות במייל
              </h3>
              <p className="text-xs text-ink-600 mt-0.5 leading-relaxed">
                העבר את הכתובת הזו לספקים, או הגדר filter ב-Gmail שיעביר אליה
                כל מייל שמכיל "חשבונית". כל PDF במייל הנכנס יזוהה אוטומטית
                (OCR) ויהפוך לטיוטת חשבונית.
              </p>
            </div>
          </div>
          <InboxAddressBox address={inboxAddress} />
          <div className="text-[11px] text-ink-400 leading-relaxed">
            הקליטה דורשת חיבור של ספק מייל (SendGrid Inbound Parse / Postmark /
            Mailgun) לדומיין <code dir="ltr">{inboxDomain}</code>. עד שהחיבור
            יוגדר, הכתובת מוצגת אך לא תקבל מיילים בפועל.
          </div>
        </section>
      )}

      <form action={submitForm} className="space-y-5">
        <input type="hidden" name="companyId" value={company.id} />

        <FormSection
          icon={Settings}
          title="ברירות מחדל לפקודות יומן"
          description="הערכים האלו משמשים בכל JE שנבנה אוטומטית מחשבונית."
        >
          <div className="grid grid-cols-2 gap-3">
            <Field
              name="expense_account"
              label="חשבון הוצאה ברירת מחדל"
              defaultValue={settings.expense_account}
              placeholder={DEFAULT_SETTINGS.expense_account}
              dir="ltr"
              hint="לדוגמה: 502-0 (קניות חומרים)"
            />
            <Field
              name="vat_input_account"
              label='חשבון מע"מ תשומות'
              defaultValue={settings.vat_input_account}
              placeholder={DEFAULT_SETTINGS.vat_input_account}
              dir="ltr"
              hint='ברירת מחדל ישראלית: 205-2'
            />
            <Field
              name="transaction_type"
              label="סוג תנועה"
              defaultValue={settings.transaction_type}
              placeholder={DEFAULT_SETTINGS.transaction_type}
              hint='קוד פריוריטי, לדוגמה: "מ" לחשבונית מס'
              maxLength={3}
            />
            <SelectField
              name="currency"
              label="מטבע ראשי"
              defaultValue={settings.currency ?? DEFAULT_SETTINGS.currency}
              options={['ILS', 'USD', 'EUR', 'GBP']}
            />
            <Field
              name="details_prefix"
              label="קידומת פרטים"
              defaultValue={settings.details_prefix}
              placeholder={DEFAULT_SETTINGS.details_prefix}
              hint='נכלל בשדה הפרטים של כל JE — לדוגמה: "קניות"'
              maxLength={30}
            />
          </div>
        </FormSection>

        <FormSection
          icon={Banknote}
          title="חשבונות תשלום"
          description='לחשבוניות בתשלום מיידי — JE יזקוף לחשבון התשלום במקום לחשבון הספק.
            השאר ריק אם החברה לא משלמת בדרך הזו.'
        >
          <div className="grid grid-cols-3 gap-3">
            <Field
              name="payment_account_cash"
              label="מזומן"
              defaultValue={settings.payment_account_cash}
              placeholder='100-0'
              dir="ltr"
            />
            <Field
              name="payment_account_card"
              label="כרטיס אשראי"
              defaultValue={settings.payment_account_card}
              placeholder='125-0'
              dir="ltr"
            />
            <Field
              name="payment_account_bank"
              label="העברה בנקאית"
              defaultValue={settings.payment_account_bank}
              placeholder='121-0'
              dir="ltr"
              hint='בנק ראשי לתשלומי העברה'
            />
          </div>
        </FormSection>

        <FormSection
          icon={Percent}
          title="חשבונות מיוחדים"
          description="חשבונות ייעודיים לתרחישים חשבונאיים מורכבים."
        >
          <div className="grid grid-cols-2 gap-3">
            <Field
              name="withholding_account"
              label="ניכוי מס במקור — רשות המסים"
              defaultValue={settings.withholding_account}
              placeholder='175-0'
              dir="ltr"
              hint='זכות בכל JE עם withholding_percent. ללא זה — אזהרה'
            />
            <Field
              name="non_deductible_account"
              label='הוצאה לא מנוכה (מע"מ מעורב)'
              defaultValue={settings.non_deductible_account}
              placeholder='502-1'
              dir="ltr"
              hint='לרכב 2/3, אש"ל 1/4, וכו׳'
            />
          </div>
        </FormSection>

        <div className="flex justify-end gap-3 pt-2">
          <button
            type="submit"
            className="px-5 py-2 bg-accent-600 text-white rounded-lg text-sm font-medium hover:bg-accent-500"
          >
            שמור הגדרות
          </button>
        </div>
      </form>
    </div>
  );
}

function statusLabel(status: string): string {
  return ({ active: 'פעיל', paused: 'מושהה', archived: 'בארכיון' } as Record<
    string,
    string
  >)[status] ?? status;
}

function ReadOnly({
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
      <div className="text-xs text-ink-600 mb-1">{label}</div>
      <div className="px-3 py-2 bg-ink-50 border border-ink-200 rounded text-sm text-ink-900" dir={dir}>
        {value}
      </div>
    </div>
  );
}

function FormSection({
  icon: Icon,
  title,
  description,
  children,
}: {
  icon: typeof Settings;
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="bg-white border border-ink-200 rounded-xl p-5 space-y-4">
      <div className="flex items-start gap-2.5">
        <div className="w-8 h-8 rounded-lg bg-accent-500/10 text-accent-600 flex items-center justify-center flex-shrink-0">
          <Icon size={15} />
        </div>
        <div>
          <h3 className="text-sm font-semibold text-ink-900">{title}</h3>
          {description && (
            <p className="text-xs text-ink-600 mt-0.5 leading-relaxed">
              {description}
            </p>
          )}
        </div>
      </div>
      <div className="pt-1">{children}</div>
    </section>
  );
}

function Field({
  name,
  label,
  defaultValue,
  placeholder,
  dir,
  hint,
  maxLength,
}: {
  name: string;
  label: string;
  defaultValue?: string | undefined;
  placeholder?: string | undefined;
  dir?: 'ltr' | 'rtl' | undefined;
  hint?: string | undefined;
  maxLength?: number | undefined;
}) {
  return (
    <div>
      <label className="block text-xs font-medium text-ink-700 mb-1">{label}</label>
      <input
        name={name}
        defaultValue={defaultValue ?? ''}
        placeholder={placeholder}
        dir={dir}
        maxLength={maxLength}
        className="w-full px-3 py-2 border border-ink-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-accent-500"
      />
      {hint && <div className="text-[11px] text-ink-400 mt-1">{hint}</div>}
    </div>
  );
}

function SelectField({
  name,
  label,
  defaultValue,
  options,
}: {
  name: string;
  label: string;
  defaultValue?: string;
  options: string[];
}) {
  return (
    <div>
      <label className="block text-xs font-medium text-ink-700 mb-1">{label}</label>
      <select
        name={name}
        defaultValue={defaultValue}
        className="w-full px-3 py-2 border border-ink-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-accent-500 bg-white"
      >
        {options.map((o) => (
          <option key={o} value={o}>
            {o}
          </option>
        ))}
      </select>
    </div>
  );
}
