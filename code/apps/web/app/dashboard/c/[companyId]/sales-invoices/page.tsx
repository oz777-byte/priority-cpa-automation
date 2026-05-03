import Link from 'next/link';
import { FileText, Plus } from 'lucide-react';
import { SalesInvoiceSchema } from '@priority-cpa/invoice-schema';
import { requireUser } from '@/lib/auth';
import { loadCompanyForUser } from '@/lib/company-context';
import { getAdminClient } from '@/lib/supabase/admin';
import {
  SalesInvoicesTable,
  type SalesInvoiceRow,
  type SalesDocType,
  type SalesInvoiceStatus,
} from './sales-invoices-table';

export const dynamic = 'force-dynamic';

interface DBRow {
  id: string;
  status: SalesInvoiceStatus;
  doc_type: SalesDocType;
  canonical: unknown;
}

export default async function SalesInvoicesPage({
  params,
}: {
  params: { companyId: string };
}) {
  const me = await requireUser();
  const company = await loadCompanyForUser(me.id, me.email, params.companyId);
  const admin = getAdminClient();

  const { data } = await admin
    .from('sales_invoices')
    .select('id, status, doc_type, canonical')
    .eq('company_id', company.id)
    .order('created_at', { ascending: false });

  const rows: SalesInvoiceRow[] = ((data ?? []) as DBRow[])
    .map((r): SalesInvoiceRow | null => {
      const parsed = SalesInvoiceSchema.safeParse(r.canonical);
      if (!parsed.success) return null;
      const c = parsed.data;
      return {
        id: r.id,
        customerName: c.customer.name,
        customerTaxId: c.customer.tax_id,
        invoiceNumber: c.invoice.number,
        date: c.invoice.date,
        total: c.totals.total,
        currency: c.invoice.currency,
        docType: r.doc_type,
        status: r.status,
      };
    })
    .filter((r): r is SalesInvoiceRow => r !== null);

  return (
    <div className="space-y-5">
      <div className="flex items-end justify-between gap-3 flex-wrap">
        <div>
          <h2 className="text-lg font-semibold text-ink-900 flex items-center gap-2">
            <FileText size={18} className="text-brand-500" />
            חשבוניות מכירה
          </h2>
          <p className="text-sm text-ink-600 mt-0.5">
            כל המסמכים שהוצאת ללקוחות {company.name} — חשבוניות מס, חשבוניות
            עסקה, קבלות, וזיכויים. JE נוצר אוטומטית בעת היצירה.
          </p>
        </div>
        <Link
          href={`/dashboard/c/${company.id}/sales-invoices/new`}
          className="flex items-center gap-1.5 px-4 py-2 bg-accent-600 text-white rounded-lg text-sm font-medium hover:bg-accent-500"
        >
          <Plus size={14} />
          חשבונית מכירה חדשה
        </Link>
      </div>

      <SalesInvoicesTable
        rows={rows}
        companyId={company.id}
        emptyState={<EmptyState companyId={company.id} />}
      />
    </div>
  );
}

function EmptyState({ companyId }: { companyId: string }) {
  return (
    <div className="text-center space-y-4 py-4">
      <div className="w-12 h-12 mx-auto rounded-full bg-ink-50 flex items-center justify-center">
        <FileText size={20} className="text-ink-400" />
      </div>
      <div className="space-y-1">
        <h3 className="font-semibold text-ink-900">אין עדיין חשבוניות מכירה</h3>
        <p className="text-sm text-ink-600 max-w-md mx-auto">
          הוצא חשבונית ראשונה ללקוח. ה-JE ייווצר אוטומטית לפי סוג המסמך
          (חשבונית מס / מס-קבלה / זיכוי וכו׳).
        </p>
      </div>
      <Link
        href={`/dashboard/c/${companyId}/sales-invoices/new`}
        className="inline-flex items-center gap-1.5 px-4 py-2 bg-accent-600 text-white rounded-lg text-sm hover:bg-accent-500"
      >
        <Plus size={14} />
        הוסף חשבונית מכירה
      </Link>
    </div>
  );
}
