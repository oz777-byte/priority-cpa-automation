import type { ReactNode } from 'react';

export interface Column<Row> {
  /** Unique column key (used for sort state, search keys, React keys). */
  key: string;
  /** Hebrew header label. */
  header: string;
  /** Optional column width — e.g. 'w-32', '160px'. */
  width?: string;
  /** Alignment — defaults to right (natural for RTL). */
  align?: 'right' | 'left' | 'center';
  /** Direction — set to 'ltr' for account numbers, dates, currency. */
  dir?: 'ltr' | 'rtl';
  /** Use monospace font (for account numbers / IDs). */
  monospace?: boolean;
  /** Click header to sort. Defaults to false. */
  sortable?: boolean;
  /** Render the cell — any ReactNode. */
  cell: (row: Row) => ReactNode;
  /** Comparable value for sort + search (string or number). */
  value?: (row: Row) => string | number;
}

export interface BulkAction {
  label: string;
  onAction: (selectedIds: string[]) => void | Promise<void>;
  variant?: 'primary' | 'destructive';
}

export interface DataTableProps<Row extends { id: string }> {
  rows: Row[];
  columns: Column<Row>[];
  /** Column keys to include in client-side search. */
  searchKeys?: string[];
  searchPlaceholder?: string;
  bulkActions?: BulkAction[];
  empty?: ReactNode;
  /** Where to navigate when a row is clicked. Returns null for non-clickable rows. */
  rowHref?: (row: Row) => string | null;
  defaultSort?: { key: string; direction: 'asc' | 'desc' };
  /** Optional toolbar slot rendered on the left of the search input. */
  toolbarStart?: ReactNode;
}
