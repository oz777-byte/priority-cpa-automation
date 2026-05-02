'use client';

import { Download } from 'lucide-react';
import { DataTable, type Column } from '@/components/data-table';

export type LoadStatus = 'pending' | 'loaded' | 'transferred_to_journal' | 'error';
export type ExportFormat = '180' | 'flexible';

export interface BatchListRow {
  id: string;
  batchNumber: string;
  exportedAt: string; // ISO
  recordCount: number;
  format: ExportFormat;
  loadStatus: LoadStatus;
}

const STATUS_LABELS: Record<LoadStatus, { bg: string; text: string; label: string }> = {
  pending: { bg: 'bg-amber-100', text: 'text-amber-800', label: 'ממתין' },
  loaded: { bg: 'bg-blue-100', text: 'text-blue-800', label: 'נטען' },
  transferred_to_journal: {
    bg: 'bg-emerald-100',
    text: 'text-emerald-800',
    label: 'הועבר ליומן',
  },
  error: { bg: 'bg-red-100', text: 'text-red-800', label: 'שגיאה' },
};

const FORMAT_LABELS: Record<ExportFormat, { bg: string; text: string }> = {
  '180': { bg: 'bg-ink-100', text: 'text-ink-700' },
  flexible: { bg: 'bg-purple-100', text: 'text-purple-800' },
};

export function ExportsTable({
  rows,
  companyId,
  empty,
}: {
  rows: BatchListRow[];
  companyId: string;
  empty?: React.ReactNode;
}) {
  const columns: Column<BatchListRow>[] = [
    {
      key: 'batchNumber',
      header: 'מס׳ אצווה',
      dir: 'ltr',
      monospace: true,
      sortable: true,
      cell: (r) => <span className="text-ink-900">{r.batchNumber}</span>,
      value: (r) => r.batchNumber,
    },
    {
      key: 'exportedAt',
      header: 'תאריך',
      dir: 'ltr',
      sortable: true,
      cell: (r) => (
        <span className="text-ink-700">
          {r.exportedAt ? r.exportedAt.slice(0, 16).replace('T', ' ') : '—'}
        </span>
      ),
      value: (r) => r.exportedAt,
    },
    {
      key: 'recordCount',
      header: 'רשומות',
      sortable: true,
      cell: (r) => <span className="text-ink-900 tabular-nums">{r.recordCount}</span>,
      value: (r) => r.recordCount,
    },
    {
      key: 'format',
      header: 'פורמט',
      sortable: true,
      cell: (r) => {
        const f = FORMAT_LABELS[r.format];
        return (
          <span
            className={`inline-block px-2 py-0.5 rounded text-[10px] font-medium font-mono ${f.bg} ${f.text}`}
            dir="ltr"
          >
            {r.format === 'flexible' ? 'FLEXIBLE' : '180'}
          </span>
        );
      },
      value: (r) => r.format,
    },
    {
      key: 'loadStatus',
      header: 'סטטוס בפריוריטי',
      sortable: true,
      cell: (r) => {
        const s = STATUS_LABELS[r.loadStatus];
        return (
          <span className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${s.bg} ${s.text}`}>
            {s.label}
          </span>
        );
      },
      value: (r) => r.loadStatus,
    },
    {
      key: 'download',
      header: 'הורדה',
      align: 'left',
      cell: (r) => (
        <a
          href={`/api/movein?companyId=${companyId}&batch=${r.id}`}
          download
          className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-accent-600 text-white rounded-md text-xs font-medium hover:bg-accent-500"
        >
          <Download size={13} />
          הורד
        </a>
      ),
    },
  ];

  return (
    <DataTable<BatchListRow>
      rows={rows}
      columns={columns}
      searchKeys={['batchNumber']}
      searchPlaceholder="חיפוש לפי מס׳ אצווה..."
      defaultSort={{ key: 'exportedAt', direction: 'desc' }}
      empty={empty}
    />
  );
}
