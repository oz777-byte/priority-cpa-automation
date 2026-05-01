'use client';

import { useState } from 'react';
import { createSupabaseBrowserClient } from '@/lib/supabase/browser';

const MIN_LENGTH = 12;

function validate(pw: string): string | null {
  if (pw.length < MIN_LENGTH) return `סיסמה חייבת להיות באורך ${MIN_LENGTH} תווים לפחות`;
  if (!/[a-z]/.test(pw)) return 'הסיסמה חייבת לכלול אות לועזית קטנה';
  if (!/[A-Z]/.test(pw)) return 'הסיסמה חייבת לכלול אות לועזית גדולה';
  if (!/\d/.test(pw)) return 'הסיסמה חייבת לכלול ספרה';
  return null;
}

export function ChangePasswordForm() {
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setOk(false);

    if (next !== confirm) {
      setError('הסיסמאות אינן תואמות');
      return;
    }
    const strength = validate(next);
    if (strength) {
      setError(strength);
      return;
    }

    setBusy(true);
    const supabase = createSupabaseBrowserClient();
    try {
      // Re-authenticate first by signing in with the current password.
      const { data: { user } } = await supabase.auth.getUser();
      if (!user?.email) throw new Error('משתמש לא מאומת');
      const { error: signinErr } = await supabase.auth.signInWithPassword({
        email: user.email,
        password: current,
      });
      if (signinErr) throw new Error('הסיסמה הנוכחית שגויה');

      const { error: updateErr } = await supabase.auth.updateUser({ password: next });
      if (updateErr) throw updateErr;

      setOk(true);
      setCurrent('');
      setNext('');
      setConfirm('');
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'שגיאה לא ידועה');
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="bg-white border border-ink-200 rounded-xl p-6 space-y-4">
      <h2 className="font-semibold text-ink-900">החלפת סיסמה</h2>
      <form onSubmit={handleSubmit} className="space-y-4">
        <Field
          label="סיסמה נוכחית"
          type="password"
          value={current}
          onChange={setCurrent}
          autoComplete="current-password"
        />
        <Field
          label="סיסמה חדשה"
          type="password"
          value={next}
          onChange={setNext}
          autoComplete="new-password"
          hint={`לפחות ${MIN_LENGTH} תווים, כולל אות גדולה, קטנה וספרה`}
        />
        <Field
          label="אישור סיסמה חדשה"
          type="password"
          value={confirm}
          onChange={setConfirm}
          autoComplete="new-password"
        />

        {error && (
          <div className="text-sm text-red-700 bg-red-50 border border-red-200 rounded p-2">
            {error}
          </div>
        )}
        {ok && (
          <div className="text-sm text-green-700 bg-green-50 border border-green-200 rounded p-2">
            הסיסמה הוחלפה בהצלחה.
          </div>
        )}

        <button
          type="submit"
          disabled={busy}
          className="px-4 py-2 bg-accent-600 text-white rounded-lg disabled:opacity-50"
        >
          {busy ? 'מעבד...' : 'עדכן סיסמה'}
        </button>
      </form>
    </section>
  );
}

function Field({
  label,
  type,
  value,
  onChange,
  autoComplete,
  hint,
}: {
  label: string;
  type: string;
  value: string;
  onChange: (v: string) => void;
  autoComplete?: string;
  hint?: string;
}) {
  return (
    <div>
      <label className="block text-sm font-medium text-ink-800 mb-1">{label}</label>
      <input
        type={type}
        required
        autoComplete={autoComplete}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        dir="ltr"
        className="w-full px-3 py-2 border border-ink-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-accent-500"
      />
      {hint && <div className="text-xs text-ink-400 mt-1">{hint}</div>}
    </div>
  );
}
