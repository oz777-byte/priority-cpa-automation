'use client';

import { DataTable, type Column } from '@/components/data-table';

export type SalesInvoiceStatus =
  | 'draft'
  | 'queued'
  | 'approved'
  | 'exported'
  | 'cancelled'
  | 'error';

export type SalesDocType =
  | 'tax_invoice'
  | 'invoice_receipt'
  | 'proforma'
  | 'receipt'
  | 'credit_note';

export interface SalesInvoiceRow {
  id: string;
  customerName: string;
  customerTaxId: string;
  invoiceNumber: string;
  date: string;
  total: number;
  currency: string;
  docType: SalesDocType;
  status: SalesInvoiceStatus;
}

const STATUS: Record<SalesInvoiceStatus, { bg: string; text: string; label: string }> = {
  draft: { bg: 'bg-ink-100', text: 'text-ink-700', label: 'טיוטה' },
  queued: { bg: 'bg-amber-100', text: 'text-amber-800', label: 'ממתין' },
  approved: { bg: 'bg-blue-100', text: 'text-blue-800', label: 'אושר' },
  exported: { bg: 'bg-emerald-100', text: 'text-emerald-800', label: 'יוצא' },
  cancelled: { bg: 'bg-ink-100', text: 'text-ink-500', label: 'בוטל' },
  error: { bg: 'bg-red-100', text: 'text-red-800', label: 'שגיאה' },
};

const DOC_TYPE: Record<SalesDocType, { bg: string; text: string; label: string }> = {
  tax_invoice: { bg: 'bg-blue-50', text: 'text-blue-700', label: 'חשבונית מס' },
  invoice_receipt: { bg: 'bg-emerald-50', text: 'text-emerald-700', label: 'מס-קבלה' },
  proforma: { bg: 'bg-purple-50', text: 'text-purple-700', label: 'עסקה' },
  receipt: { bg: 'bg-teal-50', text: 'text-teal-700', label: 'קבלה' },
  credit_note: { bg: 'bg-rose-50', text: 'text-rose-700', label: 'זיכוי' },
};

export function SalesInvoicesTable({
  rows,
  companyId,
  emptyState,
}: {
  rows: SalesInvoiceRow[];
  companyId: string;
  emptyState?: React.ReactNode;
}) {
  const columns: Column<SalesInvoiceRow>[] = [
    {
      key: 'customer',
      header: 'לקוח',
      sortable: true,
      cell: (r) => (
        <div>
          <div className="text-ink-900">{r.customerName}</div>
          {r.customerTaxId && (
            <div className="text-[11px] text-ink-500 mt-0.5" dir="ltr">
              {r.customerTaxId}
            </div>
          )}
        </div>
      ),
      value: (r) => r.customerName,
    },
    {
      key: 'invoiceNumber',
      header: 'מס׳ חשבונית',
      dir: 'ltr',
      monospace: true,
      sortable: true,
      cell: (r) => <span className="text-ink-700">{r.invoiceNumber}</span>,
      value: (r) => r.invoiceNumber,
    },
    {
      key: 'date',
      header: 'תאריך',
      dir: 'ltr',
      sortable: true,
      cell: (r) => <span className="text-ink-700">{r.date}</span>,
      value: (r) => r.date,
    },
    {
      key: 'docType',
      header: 'סוג',
      sortable: true,
      cell: (r) => {
        const d = DOC_TYPE[r.docType];
        return (
          <span
            className={`inline-block px-2 py-0.5 rounded text-[10px] font-medium ${d.bg} ${d.text}`}
          >
            {d.label}
          </span>
        );
      },
      value: (r) => r.docType,
    },
    {
      key: 'total',
      header: 'סך הכול',
      sortable: true,
      cell: (r) => (
        <span className="text-ink-900 font-medium tabular-nums">
          {r.total.toLocaleString('he-IL', {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2,
          })}{' '}
          {r.currency === 'ILS' ? '₪' : r.currency}
        </span>
      ),
      value: (r) => r.total,
    },
    {
      key: 'status',
      header: 'סטטוס',
      sortable: true,
      cell: (r) => {
        const s = STATUS[r.status];
        return (
          <span className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${s.bg} ${s.text}`}>
            {s.label}
          </span>
        );
      },
      value: (r) => r.status,
    },
  ];

  return (
    <DataTable<SalesInvoiceRow>
      rows={rows}
      columns={columns}
      searchKeys={['customer', 'invoiceNumber']}
      searchPlaceholder='חיפוש לפי לקוח או מס׳ חשבונית...'
      defaultSort={{ key: 'date', direction: 'desc' }}
      rowHref={(r) => `/dashboard/c/${companyId}/sales-invoices/${r.id}`}
      empty={emptyState}
    />
  );
}
