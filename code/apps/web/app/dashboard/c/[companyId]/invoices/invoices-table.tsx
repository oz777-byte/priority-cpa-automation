'use client';

import { DataTable, type Column } from '@/components/data-table';

export type InvoiceStatus = 'pass' | 'warn' | 'fail' | 'approved' | 'exported';

export interface InvoiceListRow {
  id: string;
  supplierName: string;
  invoiceNumber: string;
  date: string;
  totalIls: number;
  status: InvoiceStatus;
}

const STATUS_LABELS: Record<InvoiceStatus, { bg: string; text: string; label: string }> = {
  pass: { bg: 'bg-emerald-100', text: 'text-emerald-800', label: 'מוכן' },
  warn: { bg: 'bg-amber-100', text: 'text-amber-800', label: 'בדיקה' },
  fail: { bg: 'bg-red-100', text: 'text-red-800', label: 'חסום' },
  approved: { bg: 'bg-blue-100', text: 'text-blue-800', label: 'אושר' },
  exported: { bg: 'bg-purple-100', text: 'text-purple-800', label: 'יוצא' },
};

export function InvoicesTable({
  rows,
  companyId,
  emptyState,
}: {
  rows: InvoiceListRow[];
  companyId: string;
  emptyState?: React.ReactNode;
}) {
  const columns: Column<InvoiceListRow>[] = [
    {
      key: 'supplier',
      header: 'ספק',
      sortable: true,
      cell: (r) => <span className="text-ink-900">{r.supplierName}</span>,
      value: (r) => r.supplierName,
    },
    {
      key: 'invoiceNumber',
      header: 'מס׳ חשבונית',
      dir: 'ltr',
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
      key: 'total',
      header: 'סכום',
      sortable: true,
      cell: (r) => (
        <span className="text-ink-900 font-medium">
          {r.totalIls.toLocaleString('he-IL', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ₪
        </span>
      ),
      value: (r) => r.totalIls,
    },
    {
      key: 'status',
      header: 'סטטוס',
      sortable: true,
      cell: (r) => {
        const c = STATUS_LABELS[r.status];
        return (
          <span className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${c.bg} ${c.text}`}>
            {c.label}
          </span>
        );
      },
      value: (r) => r.status,
    },
  ];

  return (
    <DataTable<InvoiceListRow>
      rows={rows}
      columns={columns}
      searchKeys={['supplier', 'invoiceNumber']}
      searchPlaceholder="חיפוש לפי ספק או מס׳ חשבונית..."
      defaultSort={{ key: 'date', direction: 'desc' }}
      rowHref={(r) => `/dashboard/c/${companyId}/invoices/${r.id}`}
      empty={emptyState}
    />
  );
}
