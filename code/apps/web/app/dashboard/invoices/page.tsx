import Link from 'next/link';
import { redirect } from 'next/navigation';
import {
  CanonicalInvoiceSchema,
  type CanonicalInvoice,
} from '@priority-cpa/invoice-schema';
import { validateInvoice } from '@priority-cpa/je-validator';
import { requireUser } from '@/lib/auth';
import { getCurrentCompany } from '@/lib/current-company';
import { getAdminClient } from '@/lib/supabase/admin';
import { buildValidationContext, type CompanySettings } from '@/lib/company-config';

export const dynamic = 'force-dynamic';

interface DBInvoice {
  id: string;
  status: string;
  canonical: unknown;
  created_at: string;
}

export default async function InvoicesPage() {
  const me = await requireUser();
  const company = await getCurrentCompany(me.id, me.email);
  if (!company) redirect('/dashboard/companies');

  const admin = getAdminClient();
  const { data: rows } = await admin
    .from('invoices_inbox')
    .select('id, status, canonical, created_at')
    .eq('company_id', company.id)
    .order('created_at', { ascending: false });

  const settings = (company.settings ?? {}) as CompanySettings;

  // Pre-fetch supplier codes for validation context
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
  const ctx = buildValidationContext(
    company.id,
    settings,
    knownAccounts,
    supplierCodes,
  );

  const invoices = ((rows ?? []) as DBInvoice[]).map((row) => {
    const parsed = CanonicalInvoiceSchema.safeParse(row.canonical);
    return {
      id: row.id,
      status: row.status,
      canonical: parsed.success ? parsed.data : null,
    };
  });

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <div className="flex items-end justify-between">
        <div>
          <h1 className="text-2xl font-bold text-ink-900">תור החשבוניות</h1>
          <p className="text-ink-600 mt-1 text-sm">
            חברה: {company.name}
          </p>
        </div>
        <form action="/api/movein" method="post">
          <button
            type="submit"
            disabled={invoices.length === 0}
            className="px-4 py-2 bg-accent-600 text-white rounded-lg text-sm hover:bg-accent-500 disabled:opacity-50"
          >
            הפק MOVEIN.DAT לכל המאושרות
          </button>
        </form>
      </div>

      {invoices.length === 0 ? (
        <EmptyState companyName={company.name} />
      ) : (
        <div className="bg-white border border-ink-200 rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-ink-50 border-b border-ink-200 text-ink-600">
              <tr>
                <th className="text-right p-3 font-medium">ספק</th>
                <th className="text-right p-3 font-medium">מס׳ חשבונית</th>
                <th className="text-right p-3 font-medium">תאריך</th>
                <th className="text-right p-3 font-medium">סכום</th>
                <th className="text-right p-3 font-medium">סטטוס</th>
                <th className="text-right p-3 font-medium"></th>
              </tr>
            </thead>
            <tbody>
              {invoices.map((inv) => (
                <Row key={inv.id} inv={inv} ctx={ctx} />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function EmptyState({ companyName }: { companyName: string }) {
  return (
    <div className="bg-white border border-ink-200 rounded-xl p-8 text-center space-y-3">
      <h2 className="text-lg font-semibold text-ink-900">אין חשבוניות עדיין</h2>
      <p className="text-sm text-ink-600">
        כדי לראות איך המערכת עובדת מקצה לקצה, אפשר לטעון 2 חשבוניות לדוגמה
        (וירטהיים וצרפתי) ל-{companyName}.
      </p>
      <Link
        href="/dashboard/companies"
        className="inline-block px-4 py-2 bg-accent-600 text-white rounded-lg text-sm"
      >
        עבור לניהול חברות לטעינת POC
      </Link>
    </div>
  );
}

function Row({
  inv,
  ctx,
}: {
  inv: { id: string; status: string; canonical: CanonicalInvoice | null };
  ctx: ReturnType<typeof buildValidationContext>;
}) {
  if (!inv.canonical) {
    return (
      <tr className="border-b border-ink-100 last:border-0">
        <td colSpan={6} className="p-3 text-red-700">
          חשבונית פגומה — לא ניתן לפענח
        </td>
      </tr>
    );
  }
  const c = inv.canonical;
  const result = validateInvoice(c, ctx);
  const status = inv.status === 'approved'
    ? 'approved'
    : inv.status === 'exported'
      ? 'exported'
      : !result.passed
        ? 'fail'
        : result.warnings.length > 0
          ? 'warn'
          : 'pass';

  return (
    <tr className="border-b border-ink-100 last:border-0">
      <td className="p-3 text-ink-900">{c.supplier.name}</td>
      <td className="p-3 text-ink-700" dir="ltr">{c.invoice.number}</td>
      <td className="p-3 text-ink-700" dir="ltr">{c.invoice.date}</td>
      <td className="p-3 text-ink-900 font-medium">{c.totals.total.toFixed(2)} ₪</td>
      <td className="p-3"><StatusPill status={status} /></td>
      <td className="p-3">
        <Link
          href={`/dashboard/invoices/${inv.id}`}
          className="text-accent-600 hover:underline"
        >
          פתח
        </Link>
      </td>
    </tr>
  );
}

function StatusPill({
  status,
}: {
  status: 'pass' | 'warn' | 'fail' | 'approved' | 'exported';
}) {
  const config = {
    pass: { bg: 'bg-green-100', text: 'text-green-800', label: 'מוכן' },
    warn: { bg: 'bg-amber-100', text: 'text-amber-800', label: 'בדיקה' },
    fail: { bg: 'bg-red-100', text: 'text-red-800', label: 'חסום' },
    approved: { bg: 'bg-emerald-100', text: 'text-emerald-800', label: 'אושר' },
    exported: { bg: 'bg-blue-100', text: 'text-blue-800', label: 'יוצא' },
  }[status];
  return (
    <span className={`inline-block px-2 py-1 rounded text-xs ${config.bg} ${config.text}`}>
      {config.label}
    </span>
  );
}
