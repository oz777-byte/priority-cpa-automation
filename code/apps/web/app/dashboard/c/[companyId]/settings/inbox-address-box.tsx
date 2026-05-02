'use client';

import { useState } from 'react';
import { Copy, Check } from 'lucide-react';

export function InboxAddressBox({ address }: { address: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="flex items-center gap-2 bg-ink-50 border border-ink-200 rounded-lg px-3 py-2">
      <code dir="ltr" className="flex-1 text-sm font-mono text-ink-900 truncate">
        {address}
      </code>
      <button
        onClick={() => {
          navigator.clipboard.writeText(address);
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        }}
        className="text-xs text-accent-600 hover:bg-accent-50 px-2 py-1 rounded inline-flex items-center gap-1 flex-shrink-0"
      >
        {copied ? <Check size={12} /> : <Copy size={12} />}
        {copied ? 'הועתק' : 'העתק'}
      </button>
    </div>
  );
}
