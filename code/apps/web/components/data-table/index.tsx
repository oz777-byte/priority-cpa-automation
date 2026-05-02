'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { ArrowDown, ArrowUp, Search, X } from 'lucide-react';
import type { Column, DataTableProps } from './types';

export type { Column, DataTableProps, BulkAction } from './types';

interface SortState {
  key: string;
  direction: 'asc' | 'desc';
}

export function DataTable<Row extends { id: string }>(
  props: DataTableProps<Row>,
) {
  const {
    rows,
    columns,
    searchKeys,
    searchPlaceholder = 'חיפוש...',
    bulkActions,
    empty,
    rowHref,
    defaultSort,
    toolbarStart,
  } = props;

  const [query, setQuery] = useState('');
  const [sort, setSort] = useState<SortState | null>(defaultSort ?? null);
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const colByKey = useMemo(
    () => Object.fromEntries(columns.map((c) => [c.key, c])) as Record<string, Column<Row>>,
    [columns],
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q || !searchKeys || searchKeys.length === 0) return rows;
    return rows.filter((r) =>
      searchKeys.some((k) => {
        const col = colByKey[k];
        if (!col?.value) return false;
        return String(col.value(r)).toLowerCase().includes(q);
      }),
    );
  }, [rows, query, searchKeys, colByKey]);

  const sorted = useMemo(() => {
    if (!sort) return filtered;
    const col = colByKey[sort.key];
    if (!col?.value) return filtered;
    const dir = sort.direction === 'asc' ? 1 : -1;
    return [...filtered].sort((a, b) => {
      const va = col.value!(a);
      const vb = col.value!(b);
      if (typeof va === 'number' && typeof vb === 'number') return (va - vb) * dir;
      return String(va).localeCompare(String(vb)) * dir;
    });
  }, [filtered, sort, colByKey]);

  // Selection only counts visible rows
  const visibleIds = useMemo(() => sorted.map((r) => r.id), [sorted]);
  const allSelected =
    visibleIds.length > 0 && visibleIds.every((id) => selected.has(id));
  const someSelected = !allSelected && visibleIds.some((id) => selected.has(id));
  const selectableMode = !!bulkActions && bulkActions.length > 0;

  function toggleAll() {
    setSelected((prev) => {
      const next = new Set(prev);
      if (allSelected) {
        for (const id of visibleIds) next.delete(id);
      } else {
        for (const id of visibleIds) next.add(id);
      }
      return next;
    });
  }

  function toggleOne(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function handleSort(key: string) {
    setSort((prev) => {
      if (prev?.key !== key) return { key, direction: 'asc' };
      if (prev.direction === 'asc') return { key, direction: 'desc' };
      return null;
    });
  }

  const selectedIds = useMemo(
    () => visibleIds.filter((id) => selected.has(id)),
    [visibleIds, selected],
  );

  return (
    <div className="space-y-3">
      {/* Toolbar */}
      <div className="flex items-center gap-2 flex-wrap">
        {toolbarStart}
        {searchKeys && searchKeys.length > 0 && (
          <div className="relative flex-1 min-w-[200px] max-w-md">
            <Search
              size={14}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-ink-400 pointer-events-none"
            />
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={searchPlaceholder}
              className="w-full pr-9 pl-3 py-2 border border-ink-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-accent-500"
            />
          </div>
        )}
        <div className="text-xs text-ink-400 mr-auto tabular-nums">
          {sorted.length} {sorted.length === 1 ? 'שורה' : 'שורות'}
          {query && rows.length !== sorted.length && (
            <> · מתוך {rows.length}</>
          )}
        </div>
      </div>

      {/* Bulk action bar */}
      {selectableMode && selectedIds.length > 0 && (
        <div className="flex items-center justify-between gap-3 px-4 py-2 bg-accent-500/10 border border-accent-500/20 rounded-lg">
          <div className="text-sm text-accent-700 font-medium tabular-nums">
            {selectedIds.length} נבחרו
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setSelected(new Set())}
              className="text-xs text-ink-600 hover:text-ink-900 flex items-center gap-1"
            >
              <X size={12} />
              ביטול בחירה
            </button>
            {bulkActions!.map((a) => (
              <button
                key={a.label}
                onClick={() => a.onAction(selectedIds)}
                className={
                  a.variant === 'destructive'
                    ? 'px-3 py-1.5 text-xs font-medium bg-red-600 text-white rounded-md hover:bg-red-500'
                    : 'px-3 py-1.5 text-xs font-medium bg-accent-600 text-white rounded-md hover:bg-accent-500'
                }
              >
                {a.label}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Table */}
      {sorted.length === 0 ? (
        <div className="border border-ink-200 rounded-xl p-8 bg-white">
          {empty ?? (
            <div className="text-center text-sm text-ink-500">
              {query ? 'אין שורות שתואמות את החיפוש' : 'אין שורות לתצוגה'}
            </div>
          )}
        </div>
      ) : (
        <div className="border border-ink-200 rounded-xl overflow-hidden bg-white">
          <table className="w-full text-sm">
            <thead className="bg-ink-50 border-b border-ink-200 text-ink-600 sticky top-0">
              <tr>
                {selectableMode && (
                  <th className="w-10 px-3 py-2.5 text-right">
                    <input
                      type="checkbox"
                      checked={allSelected}
                      ref={(el) => {
                        if (el) el.indeterminate = someSelected;
                      }}
                      onChange={toggleAll}
                      className="rounded border-ink-300 text-accent-600 focus:ring-accent-500"
                      aria-label="בחר את כל השורות"
                    />
                  </th>
                )}
                {columns.map((c) => (
                  <th
                    key={c.key}
                    className={`px-3 py-2.5 font-medium ${
                      c.align === 'left'
                        ? 'text-left'
                        : c.align === 'center'
                          ? 'text-center'
                          : 'text-right'
                    } ${c.width ?? ''}`}
                  >
                    {c.sortable ? (
                      <button
                        onClick={() => handleSort(c.key)}
                        className="inline-flex items-center gap-1 hover:text-ink-900"
                      >
                        {c.header}
                        {sort?.key === c.key &&
                          (sort.direction === 'asc' ? (
                            <ArrowUp size={11} />
                          ) : (
                            <ArrowDown size={11} />
                          ))}
                      </button>
                    ) : (
                      <span>{c.header}</span>
                    )}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {sorted.map((row) => (
                <DataRow
                  key={row.id}
                  row={row}
                  columns={columns}
                  selectableMode={selectableMode}
                  selected={selected.has(row.id)}
                  onToggleSelect={() => toggleOne(row.id)}
                  href={rowHref?.(row) ?? null}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function cellAlignClass(c: Column<unknown>): string {
  if (c.align === 'left') return 'text-left';
  if (c.align === 'center') return 'text-center';
  return 'text-right';
}

function DataRow<Row extends { id: string }>({
  row,
  columns,
  selectableMode,
  selected,
  onToggleSelect,
  href,
}: {
  row: Row;
  columns: Column<Row>[];
  selectableMode: boolean;
  selected: boolean;
  onToggleSelect: () => void;
  href: string | null;
}) {
  const trClass = `border-b border-ink-100 last:border-0 hover:bg-ink-50/40 ${
    selected ? 'bg-accent-500/5' : ''
  }`;

  return (
    <tr className={trClass}>
      {selectableMode && (
        <td className="w-10 px-3 py-2.5">
          <input
            type="checkbox"
            checked={selected}
            onChange={onToggleSelect}
            onClick={(e) => e.stopPropagation()}
            className="rounded border-ink-300 text-accent-600 focus:ring-accent-500"
            aria-label="בחר שורה"
          />
        </td>
      )}
      {columns.map((c) => {
        const v = c.value?.(row);
        const cellClass = `${cellAlignClass(c as Column<unknown>)} ${
          c.monospace ? 'font-mono' : ''
        } ${typeof v === 'number' ? 'tabular-nums' : ''}`;
        const content = c.cell(row);
        return (
          <td key={c.key} className={`p-0 ${cellClass}`} dir={c.dir}>
            {href ? (
              <Link href={href} className="block px-3 py-2.5">
                {content}
              </Link>
            ) : (
              <div className="px-3 py-2.5">{content}</div>
            )}
          </td>
        );
      })}
    </tr>
  );
}
