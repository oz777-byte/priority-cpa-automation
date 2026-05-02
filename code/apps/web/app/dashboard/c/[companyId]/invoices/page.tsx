import Link from 'next/link';
import { Inbox, FileEdit, Plus } from 'lucide-react';
import { CanonicalInvoiceSchema } from '@priority-cpa/invoice-schema';
import { validateInvoice } from '@priority-cpa/je-validator';
import { requireUser } from '@/lib/auth';
import { loadCompanyForUser } from '@/lib/company-context';
import { getAdminClient } from '@/lib/supabase/admin';
import { buildValidationContext, type CompanySettings } from '@/lib/company-config';
import { InvoicesTable, type InvoiceListRow, type InvoiceStatus } from './invoices-table';

export const dynamic = 'force-dynamic';

interface DBInvoice {
  id: string;
  status: string;
  canonical: unknown;
  created_at: string;
}

export default async function CompanyInvoicesPage({
  params,
}: {
  params: { companyId: string };
}) {
  const me = await requireUser();
  const company = await loadCompanyForUser(me.id, me.email, params.companyId);
  const admin = getAdminClient();

  const { data: rows } = await admin
    .from('invoices_inbox')
    .select('id, status, canonical, created_at')
    .eq('company_id', company.id)
    .order('created_at', { ascending: false });

  const settings = (company.settings ?? {}) as CompanySettings;
  const { data: suppliers } = await admin
    .from('suppliers')
    .select('internal_code')
    .eq('company_id', company.id);
  const supplierCodes = (suppliers ?? []).map((s) => s.internal_code as string);
  const knownAccounts = new Set<string>([
    settings.expense_account ?? '502-0',
    settings.vat_input_account ?? '205-2',
    ...supplierCodes,
  ]);
  const ctx = buildValidationContext(company.id, settings, knownAccounts, supplierCodes);

  const tableRows: InvoiceListRow[] = ((rows ?? []) as DBInvoice[])
    .map((row) => {
      const parsed = CanonicalInvoiceSchema.safeParse(row.canonical);
      if (!parsed.success) return null;
      const c = parsed.data;
      const result = validateInvoice(c, ctx);
      const status: InvoiceStatus =
        row.status === 'exported'
          ? 'exported'
          : row.status === 'approved'
            ? 'approved'
            : !result.passed
              ? 'fail'
              : result.warnings.length > 0
                ? 'warn'
                : 'pass';
      return {
        id: row.id,
        supplierName: c.supplier.name,
        invoiceNumber: c.invoice.number,
        date: c.invoice.date,
        totalIls: c.totals.total,
        status,
      } satisfies InvoiceListRow;
    })
    .filter((r): r is InvoiceListRow => r !== null);

  return (
    <div className="space-y-5">
      <div className="flex items-end justify-between gap-3 flex-wrap">
        <div>
          <h2 className="text-lg font-semibold text-ink-900">חשבוניות</h2>
          <p className="text-sm text-ink-600 mt-0.5">
            כל החשבוניות של {company.name}. כדי לערוך פקודת יומן ולייצא, עבור
            ל&quot;פקודות יומן&quot;.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Link
            href={`/dashboard/c/${company.id}/invoices/new`}
            className="flex items-center gap-1.5 px-4 py-2 bg-accent-600 text-white rounded-lg text-sm font-medium hover:bg-accent-500"
          >
            <Plus size={14} />
            הוסף חשבונית
          </Link>
          <Link
            href={`/dashboard/c/${company.id}/journal-entries`}
            className="flex items-center gap-1.5 text-sm text-accent-600 hover:underline"
          >
            <FileEdit size={14} />
            לעורך פקודות יומן
          </Link>
        </div>
      </div>

      <InvoicesTable
        rows={tableRows}
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
        <Inbox size={20} className="text-ink-400" />
      </div>
      <div className="space-y-1">
        <h3 className="font-semibold text-ink-900">אין חשבוניות עדיין</h3>
        <p className="text-sm text-ink-600 max-w-md mx-auto">
          הוסף את החשבונית הראשונה ידנית, או טען חשבוניות לדוגמה דרך עמוד ניהול
          החברות.
        </p>
      </div>
      <div className="flex justify-center gap-3">
        <Link
          href={`/dashboard/c/${companyId}/invoices/new`}
          className="inline-flex items-center gap-1.5 px-4 py-2 bg-accent-600 text-white rounded-lg text-sm hover:bg-accent-500"
        >
          <Plus size={14} />
          הוסף חשבונית
        </Link>
        <Link
          href="/dashboard/companies"
          className="inline-block px-4 py-2 text-ink-600 hover:bg-ink-50 border border-ink-200 rounded-lg text-sm"
        >
          לעמוד החברות
        </Link>
      </div>
    </div>
  );
}
