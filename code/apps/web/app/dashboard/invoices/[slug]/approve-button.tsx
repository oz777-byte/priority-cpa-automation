'use client';

import { useState, useTransition } from 'react';
import { approveInvoiceAction } from '../actions';

export function ApproveButton({ invoiceId }: { invoiceId: string }) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function onClick() {
    setError(null);
    const fd = new FormData();
    fd.set('invoiceId', invoiceId);
    start(async () => {
      const r = await approveInvoiceAction(fd);
      if (!r.ok) setError(r.error ?? 'שגיאה');
    });
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <button
        onClick={onClick}
        disabled={pending}
        className="px-4 py-2 bg-accent-600 text-white rounded-lg text-sm hover:bg-accent-500 disabled:opacity-50"
      >
        {pending ? 'מאשר...' : 'אשר ושמור פקודת יומן'}
      </button>
      {error && <span className="text-xs text-red-700">{error}</span>}
    </div>
  );
}
