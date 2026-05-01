'use client';

import { useState, useTransition } from 'react';
import { inviteUserAction, removeUserAction, setUserRoleAction } from './actions';

interface Row {
  id: string;
  email: string;
  role: 'admin' | 'member';
  created_at: string;
  last_sign_in_at: string | null;
}

export function UsersAdminPanel({
  rows,
  currentUserId,
}: {
  rows: Row[];
  currentUserId: string;
}) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [credentials, setCredentials] = useState<{ email: string; password: string } | null>(null);

  function onInvite(formData: FormData) {
    setError(null);
    setCredentials(null);
    startTransition(async () => {
      const result = await inviteUserAction(formData);
      if (!result.ok) {
        setError(result.error ?? 'שגיאה');
        return;
      }
      if (result.email && result.temporaryPassword) {
        setCredentials({ email: result.email, password: result.temporaryPassword });
      }
    });
  }

  function onRemove(userId: string, email: string) {
    if (!confirm(`למחוק את המשתמש ${email}? פעולה זו אינה הפיכה.`)) return;
    setError(null);
    const fd = new FormData();
    fd.set('userId', userId);
    startTransition(async () => {
      const r = await removeUserAction(fd);
      if (!r.ok) setError(r.error ?? 'שגיאה');
    });
  }

  function onChangeRole(userId: string, role: 'admin' | 'member') {
    setError(null);
    const fd = new FormData();
    fd.set('userId', userId);
    fd.set('role', role);
    startTransition(async () => {
      const r = await setUserRoleAction(fd);
      if (!r.ok) setError(r.error ?? 'שגיאה');
    });
  }

  const atLimit = rows.length >= 5;

  return (
    <div className="space-y-6">
      <section className="bg-white border border-ink-200 rounded-xl p-5 space-y-4">
        <h2 className="font-semibold text-ink-900">הזמנת משתמש חדש</h2>
        <form
          action={onInvite}
          className="flex flex-col sm:flex-row gap-3 items-stretch sm:items-end"
        >
          <div className="flex-1">
            <label className="block text-sm font-medium text-ink-800 mb-1">
              אימייל
            </label>
            <input
              type="email"
              name="email"
              required
              dir="ltr"
              disabled={atLimit || isPending}
              className="w-full px-3 py-2 border border-ink-200 rounded-lg disabled:bg-ink-100"
              placeholder="user@example.com"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-ink-800 mb-1">תפקיד</label>
            <select
              name="role"
              defaultValue="member"
              disabled={atLimit || isPending}
              className="px-3 py-2 border border-ink-200 rounded-lg disabled:bg-ink-100"
            >
              <option value="member">משתמש רגיל</option>
              <option value="admin">מנהל</option>
            </select>
          </div>
          <button
            type="submit"
            disabled={atLimit || isPending}
            className="px-4 py-2 bg-accent-600 text-white rounded-lg disabled:opacity-50"
          >
            {isPending ? 'מעבד...' : 'הזמן'}
          </button>
        </form>
        {atLimit && (
          <p className="text-sm text-amber-700">
            הגעת למכסת 5 משתמשים. הסר משתמש קיים כדי להוסיף חדש.
          </p>
        )}

        {error && (
          <div className="text-sm text-red-700 bg-red-50 border border-red-200 rounded p-2">
            {error}
          </div>
        )}

        {credentials && (
          <div className="bg-amber-50 border border-amber-300 rounded p-4 space-y-2">
            <div className="font-semibold text-amber-900">
              משתמש נוצר. העבר את הפרטים האלה למשתמש בערוץ מאובטח (לא במייל רגיל).
            </div>
            <div className="text-sm text-amber-900">
              סיסמה זו מוצגת פעם אחת בלבד; לאחר רענון הדף לא ניתן יהיה לראות אותה שוב.
            </div>
            <div className="text-sm bg-white border border-amber-200 rounded p-3 space-y-1">
              <div>
                <span className="text-ink-600">אימייל: </span>
                <span dir="ltr" className="font-mono">{credentials.email}</span>
              </div>
              <div>
                <span className="text-ink-600">סיסמה זמנית: </span>
                <span dir="ltr" className="font-mono">{credentials.password}</span>
              </div>
            </div>
            <button
              onClick={() => setCredentials(null)}
              className="text-sm text-amber-900 underline"
            >
              סגירה
            </button>
          </div>
        )}
      </section>

      <section className="bg-white border border-ink-200 rounded-xl overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-ink-50 border-b border-ink-200 text-ink-600">
            <tr>
              <th className="text-right p-3 font-medium">אימייל</th>
              <th className="text-right p-3 font-medium">תפקיד</th>
              <th className="text-right p-3 font-medium">נוצר</th>
              <th className="text-right p-3 font-medium">כניסה אחרונה</th>
              <th className="text-right p-3 font-medium"></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((u) => {
              const isMe = u.id === currentUserId;
              return (
                <tr key={u.id} className="border-b border-ink-100 last:border-0">
                  <td className="p-3" dir="ltr">
                    {u.email}
                    {isMe && <span className="text-xs text-ink-400 mr-2">(זה אתה)</span>}
                  </td>
                  <td className="p-3">
                    <select
                      value={u.role}
                      disabled={isPending || isMe}
                      onChange={(e) =>
                        onChangeRole(u.id, e.target.value as 'admin' | 'member')
                      }
                      className="px-2 py-1 border border-ink-200 rounded disabled:bg-ink-100"
                    >
                      <option value="member">משתמש רגיל</option>
                      <option value="admin">מנהל</option>
                    </select>
                  </td>
                  <td className="p-3 text-ink-600 text-xs" dir="ltr">
                    {u.created_at.slice(0, 10)}
                  </td>
                  <td className="p-3 text-ink-600 text-xs" dir="ltr">
                    {u.last_sign_in_at ? u.last_sign_in_at.slice(0, 10) : 'מעולם לא'}
                  </td>
                  <td className="p-3">
                    {!isMe && (
                      <button
                        onClick={() => onRemove(u.id, u.email)}
                        disabled={isPending}
                        className="text-red-700 hover:underline disabled:opacity-50"
                      >
                        הסר
                      </button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </section>
    </div>
  );
}
