import Link from 'next/link';
import { Plus, ArrowRight } from 'lucide-react';
import { requireUser } from '@/lib/auth';
import { loadCompanyForUser } from '@/lib/company-context';
import { createInvoiceManuallyAction } from './actions';
import { NewInvoiceForm, type FormDefaults } from './new-invoice-form';

export const dynamic = 'force-dynamic';

async function submitForm(formData: FormData): Promise<void> {
  'use server';
  const r = await createInvoiceManuallyAction(formData);
  if (!r.ok) {
    throw new Error(r.error ?? 'שגיאה ביצירת חשבונית');
  }
}

export default async function NewInvoicePage({
  params,
}: {
  params: { companyId: string };
}) {
  const me = await requireUser();
  const company = await loadCompanyForUser(me.id, me.email, params.companyId);
  const today = new Date().toISOString().slice(0, 10);

  const initialDefaults: FormDefaults = {
    supplierName: '',
    supplierTaxId: '',
    supplierInternalCode: '',
    invoiceNumber: '',
    invoiceDate: today,
    currency: 'ILS',
    subtotal: '',
    total: '',
  };

  return (
    <div className="max-w-2xl mx-auto space-y-5">
      <div className="flex items-center justify-between">
        <Link
          href={`/dashboard/c/${company.id}/invoices`}
          className="text-sm text-accent-600 hover:underline flex items-center gap-1"
        >
          <ArrowRight size={14} />
          חזרה לרשימת החשבוניות
        </Link>
      </div>

      <div className="flex items-start gap-3">
        <div className="w-10 h-10 rounded-lg bg-accent-500/10 text-accent-600 flex items-center justify-center flex-shrink-0">
          <Plus size={18} />
        </div>
        <div>
          <h2 className="text-lg font-semibold text-ink-900">
            הוספת חשבונית ל-{company.name}
          </h2>
          <p className="text-sm text-ink-600 mt-0.5">
            גרור PDF לחילוץ אוטומטי, או הזן ידנית. בכל מקרה — בדוק את הערכים לפני שמירה.
          </p>
        </div>
      </div>

      <NewInvoiceForm
        companyId={company.id}
        today={today}
        initialDefaults={initialDefaults}
        submitAction={submitForm}
      />
    </div>
  );
}
