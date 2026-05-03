'use client';

import { useState, useTransition, useMemo } from 'react';
import { Search, ChevronDown } from 'lucide-react';
import { adminUpdateNoteAction } from '../../accounting-rules/actions';

export type NoteStatus =
  | 'open'
  | 'reviewing'
  | 'planned'
  | 'shipped'
  | 'rejected'
  | 'duplicate';

export interface NoteRow {
  id: string;
  ruleId: number;
  ruleCode: string;
  ruleTitle: string;
  userEmail: string;
  companyName: string | null;
  note: string;
  status: NoteStatus;
  adminResponse: string | null;
  reviewedAt: string | null;
  createdAt: string;
}

const STATUS_LABEL: Record<NoteStatus, string> = {
  open: 'פתוחה',
  reviewing: 'בבדיקה',
  planned: 'ב-roadmap',
  shipped: 'הוטמעה',
  rejected: 'נדחתה',
  duplicate: 'כפילות',
};

const STATUS_TONE: Record<NoteStatus, string> = {
  open: 'bg-amber-100 text-amber-800',
  reviewing: 'bg-blue-100 text-blue-800',
  planned: 'bg-purple-100 text-purple-800',
  shipped: 'bg-emerald-100 text-emerald-800',
  rejected: 'bg-ink-200 text-ink-700',
  duplicate: 'bg-ink-200 text-ink-700',
};

type Filter = 'all' | NoteStatus;

export function NotesPanel({ rows }: { rows: NoteRow[] }) {
  const [filter, setFilter] = useState<Filter>('all');
  const [query, setQuery] = useState('');
  const [openId, setOpenId] = useState<string | null>(null);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return rows.filter((r) => {
      if (filter !== 'all' && r.status !== filter) return false;
      if (!q) return true;
      return (
        r.ruleCode.toLowerCase().includes(q) ||
        r.ruleTitle.toLowerCase().includes(q) ||
        r.userEmail.toLowerCase().includes(q) ||
        r.note.toLowerCase().includes(q) ||
        String(r.ruleId).includes(q)
      );
    });
  }, [rows, filter, query]);

  if (rows.length === 0) {
    return (
      <div className="bg-white border border-ink-200 rounded-xl p-12 text-center text-ink-500 text-sm">
        עדיין לא נשלחו הערות שיפור.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="bg-white border border-ink-200 rounded-xl p-3">
        <div className="flex flex-col sm:flex-row gap-3 items-stretch sm:items-center">
          <div className="relative flex-1">
            <Search
              size={16}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-ink-400 pointer-events-none"
            />
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="חיפוש: קוד חוק, מספר, אימייל, או טקסט הערה..."
              className="w-full pr-9 pl-3 py-2 border border-ink-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-accent-500"
            />
          </div>
          <select
            value={filter}
            onChange={(e) => setFilter(e.target.value as Filter)}
            className="px-3 py-2 border border-ink-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-accent-500"
          >
            <option value="all">כל הסטטוסים</option>
            <option value="open">פתוחות</option>
            <option value="reviewing">בבדיקה</option>
            <option value="planned">ב-roadmap</option>
            <option value="shipped">הוטמעו</option>
            <option value="rejected">נדחו</option>
            <option value="duplicate">כפילויות</option>
          </select>
        </div>
      </div>

      {filtered.length === 0 ? (
        <div className="bg-white border border-ink-200 rounded-xl p-8 text-center text-ink-500 text-sm">
          לא נמצאו הערות תואמות.
        </div>
      ) : (
        <ul className="space-y-2">
          {filtered.map((row) => (
            <NoteCard
              key={row.id}
              row={row}
              isOpen={openId === row.id}
              onToggle={() =>
                setOpenId((prev) => (prev === row.id ? null : row.id))
              }
            />
          ))}
        </ul>
      )}
    </div>
  );
}

function NoteCard({
  row,
  isOpen,
  onToggle,
}: {
  row: NoteRow;
  isOpen: boolean;
  onToggle: () => void;
}) {
  return (
    <li className="bg-white border border-ink-200 rounded-xl overflow-hidden">
      <button
        type="button"
        onClick={onToggle}
        className="w-full flex items-start gap-3 p-3 hover:bg-ink-50/60 transition text-right"
      >
        <span
          className="text-[10px] font-mono tabular-nums px-1.5 py-0.5 bg-accent-50 text-accent-700 border border-accent-100 rounded mt-0.5"
          dir="ltr"
        >
          #{row.ruleId}
        </span>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-medium text-ink-900 text-sm">{row.ruleTitle}</span>
            <code
              className="text-[10px] font-mono px-1.5 py-0.5 bg-ink-100 text-ink-600 rounded"
              dir="ltr"
            >
              {row.ruleCode}
            </code>
            <span
              className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${STATUS_TONE[row.status]}`}
            >
              {STATUS_LABEL[row.status]}
            </span>
          </div>
          <div className="text-xs text-ink-600 mt-1 line-clamp-2 leading-relaxed">
            {row.note}
          </div>
          <div className="text-[11px] text-ink-500 mt-1 flex items-center gap-2 flex-wrap">
            <span dir="ltr">{row.userEmail}</span>
            {row.companyName && (
              <>
                <span>·</span>
                <span>{row.companyName}</span>
              </>
            )}
            <span>·</span>
            <span dir="ltr">{row.createdAt.slice(0, 10)}</span>
          </div>
        </div>
        <ChevronDown
          size={16}
          className={`text-ink-400 flex-shrink-0 transition-transform mt-0.5 ${
            isOpen ? 'rotate-180' : ''
          }`}
        />
      </button>

      {isOpen && <NoteEditor row={row} />}
    </li>
  );
}

function NoteEditor({ row }: { row: NoteRow }) {
  const [status, setStatus] = useState<NoteStatus>(row.status);
  const [response, setResponse] = useState(row.adminResponse ?? '');
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [pending, startTransition] = useTransition();

  function save() {
    setError(null);
    setSaved(false);
    const fd = new FormData();
    fd.set('noteId', row.id);
    fd.set('status', status);
    fd.set('response', response.trim());
    startTransition(async () => {
      const r = await adminUpdateNoteAction(fd);
      if (!r.ok) {
        setError(r.error);
        return;
      }
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    });
  }

  return (
    <div className="border-t border-ink-100 bg-ink-50/40 p-4 space-y-3">
      <div>
        <div className="text-[10px] uppercase tracking-wider text-ink-500 font-semibold mb-1">
          ההערה המלאה
        </div>
        <div className="bg-white border border-ink-200 rounded-lg p-3 text-sm text-ink-800 whitespace-pre-wrap leading-relaxed">
          {row.note}
        </div>
      </div>

      <div className="grid sm:grid-cols-[180px_1fr] gap-3 items-start">
        <label className="block">
          <div className="text-[10px] uppercase tracking-wider text-ink-500 font-semibold mb-1">
            סטטוס
          </div>
          <select
            value={status}
            onChange={(e) => setStatus(e.target.value as NoteStatus)}
            className="w-full px-3 py-2 border border-ink-200 rounded-lg text-sm bg-white"
            disabled={pending}
          >
            <option value="open">פתוחה</option>
            <option value="reviewing">בבדיקה</option>
            <option value="planned">ב-roadmap</option>
            <option value="shipped">הוטמעה</option>
            <option value="rejected">נדחתה</option>
            <option value="duplicate">כפילות</option>
          </select>
        </label>

        <label className="block">
          <div className="text-[10px] uppercase tracking-wider text-ink-500 font-semibold mb-1">
            תגובת אדמין (תוצג למשתמש בעתיד)
          </div>
          <textarea
            value={response}
            onChange={(e) => setResponse(e.target.value)}
            placeholder="לדוגמה: 'תודה — נכנס ל-roadmap לרבעון הבא'."
            rows={3}
            className="w-full px-3 py-2 border border-ink-200 rounded-lg text-sm bg-white"
            disabled={pending}
          />
        </label>
      </div>

      <div className="flex items-center justify-between gap-3">
        <div className="text-[11px]">
          {row.reviewedAt && (
            <span className="text-ink-500" dir="ltr">
              נבדק לאחרונה: {row.reviewedAt.slice(0, 10)}
            </span>
          )}
          {saved && <span className="text-emerald-700 font-medium">נשמר</span>}
          {error && <span className="text-red-700">{error}</span>}
        </div>
        <button
          type="button"
          onClick={save}
          disabled={pending}
          className="px-4 py-2 bg-accent-600 text-white rounded-lg text-sm font-medium hover:bg-accent-500 disabled:opacity-50"
        >
          {pending ? 'שומר...' : 'שמור עדכון'}
        </button>
      </div>
    </div>
  );
}
