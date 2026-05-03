'use client';

import { useState, useTransition } from 'react';
import { MessageSquarePlus, CheckCircle2, X } from 'lucide-react';
import { submitRuleNoteAction } from './actions';

export function RuleNoteForm({
  ruleId,
  ruleCode,
  ruleTitle,
}: {
  ruleId: number;
  ruleCode: string;
  ruleTitle: string;
}) {
  const [open, setOpen] = useState(false);
  const [note, setNote] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [pending, startTransition] = useTransition();

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (note.trim().length < 10) {
      setError('ההערה חייבת לכלול לפחות 10 תווים');
      return;
    }
    const fd = new FormData();
    fd.set('ruleId', String(ruleId));
    fd.set('ruleCode', ruleCode);
    fd.set('ruleTitle', ruleTitle);
    fd.set('note', note.trim());
    startTransition(async () => {
      const r = await submitRuleNoteAction(fd);
      if (!r.ok) {
        setError(r.error);
        return;
      }
      setSuccess(true);
      setNote('');
      setTimeout(() => {
        setSuccess(false);
        setOpen(false);
      }, 2200);
    });
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium border border-ink-200 text-ink-700 hover:bg-ink-50 rounded-lg transition"
      >
        <MessageSquarePlus size={13} className="text-accent-600" />
        הצע שיפור לחוק זה
      </button>
    );
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="bg-white border border-accent-200 rounded-lg p-3 space-y-2"
    >
      <div className="flex items-center justify-between">
        <div className="text-xs font-semibold text-ink-900 flex items-center gap-1.5">
          <MessageSquarePlus size={13} className="text-accent-600" />
          הערה לשיפור — חוק #{ruleId} ({ruleCode})
        </div>
        <button
          type="button"
          onClick={() => {
            setOpen(false);
            setNote('');
            setError(null);
            setSuccess(false);
          }}
          className="text-ink-400 hover:text-ink-700"
          aria-label="סגור"
        >
          <X size={14} />
        </button>
      </div>

      {success ? (
        <div className="text-xs text-emerald-700 bg-emerald-50 border border-emerald-200 rounded p-2 flex items-center gap-1.5">
          <CheckCircle2 size={13} />
          תודה! ההערה נשלחה לעוז ותטופל בקרוב.
        </div>
      ) : (
        <>
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="מה הייתם משפרים בחוק זה? לדוגמה: 'חסר תמיכה ב-X', 'בחברה Y הניהול שונה כי...', 'הדוגמה לא מתאימה לתרחיש Z'."
            rows={4}
            maxLength={2000}
            className="w-full px-3 py-2 border border-ink-200 rounded text-xs leading-relaxed focus:outline-none focus:ring-2 focus:ring-accent-500"
            disabled={pending}
          />
          <div className="flex items-center justify-between gap-2">
            <span className="text-[10px] text-ink-500 tabular-nums">
              {note.length}/2000
            </span>
            {error && (
              <span className="text-[11px] text-red-700 flex-1 text-right">{error}</span>
            )}
            <button
              type="submit"
              disabled={pending || note.trim().length < 10}
              className="px-4 py-1.5 bg-accent-600 text-white rounded text-xs font-medium hover:bg-accent-500 disabled:opacity-50 transition"
            >
              {pending ? 'שולח...' : 'שלח הערה'}
            </button>
          </div>
        </>
      )}
    </form>
  );
}
