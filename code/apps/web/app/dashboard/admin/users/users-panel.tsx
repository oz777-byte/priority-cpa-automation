'use client';

import { useState, useTransition } from 'react';
import { UserPlus, Trash2, Copy, Check } from 'lucide-react';
import { DataTable, type Column } from '@/components/data-table';
import { inviteUserAction, removeUserAction, setUserRoleAction } from './actions';

export type FirmRole = 'owner' | 'admin' | 'member' | 'auditor';

export interface UserListRow {
  id: string;
  email: string;
  firmRole: FirmRole;
  memberSince: string;
  lastSignIn: string | null;
}

const FIRM_ROLE_LABELS: Record<FirmRole, string> = {
  owner: 'בעלים',
  admin: 'מנהל',
  member: 'משתמש',
  auditor: 'צופה (read-only)',
};

export function UsersAdminPanel({
  rows,
  currentUserId,
  atLimit,
}: {
  rows: UserListRow[];
  currentUserId: string;
  atLimit: boolean;
}) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [credentials, setCredentials] = useState<{ email: string; password: string } | null>(null);
  const [showInvite, setShowInvite] = useState(false);
  const [copied, setCopied] = useState<'email' | 'password' | null>(null);

  function onInvite(formData: FormData) {
    setError(null);
    setCredentials(null);
    startTransition(async () => {
      const result = await inviteUserAction(formData);
      if (!result.ok) {
        setError(result.error ?? 'שגיאה');
        return;
      }
      setShowInvite(false);
      if (result.email && result.temporaryPassword) {
        setCredentials({ email: result.email, password: result.temporaryPassword });
      }
    });
  }

  function onRemove(row: UserListRow) {
    if (
      !confirm(
        `להסיר את ${row.email} מהמשרד? הוא יאבד גישה לכל החברות. ניתן להוסיף אותו חזרה בכל עת.`,
      )
    ) {
      return;
    }
    setError(null);
    const fd = new FormData();
    fd.set('userId', row.id);
    startTransition(async () => {
      const r = await removeUserAction(fd);
      if (!r.ok) setError(r.error ?? 'שגיאה');
    });
  }

  function onChangeRole(userId: string, role: FirmRole) {
    setError(null);
    const fd = new FormData();
    fd.set('userId', userId);
    fd.set('role', role);
    startTransition(async () => {
      const r = await setUserRoleAction(fd);
      if (!r.ok) setError(r.error ?? 'שגיאה');
    });
  }

  function copy(value: string, kind: 'email' | 'password') {
    navigator.clipboard.writeText(value);
    setCopied(kind);
    setTimeout(() => setCopied(null), 1500);
  }

  const columns: Column<UserListRow>[] = [
    {
      key: 'email',
      header: 'אימייל',
      dir: 'ltr',
      sortable: true,
      cell: (u) => (
        <span className="text-ink-900">
          {u.email}
          {u.id === currentUserId && (
            <span className="text-[10px] text-ink-400 mr-2">(אני)</span>
          )}
        </span>
      ),
      value: (u) => u.email,
    },
    {
      key: 'firmRole',
      header: 'תפקיד',
      sortable: true,
      cell: (u) =>
        u.id === currentUserId ? (
          <span className="text-ink-700 text-xs">{FIRM_ROLE_LABELS[u.firmRole]}</span>
        ) : (
          <select
            value={u.firmRole}
            onChange={(e) => onChangeRole(u.id, e.target.value as FirmRole)}
            disabled={isPending}
            className="px-2 py-1 border border-ink-200 rounded text-xs focus:ring-2 focus:ring-accent-500 focus:outline-none"
          >
            <option value="owner">{FIRM_ROLE_LABELS.owner}</option>
            <option value="admin">{FIRM_ROLE_LABELS.admin}</option>
            <option value="member">{FIRM_ROLE_LABELS.member}</option>
            <option value="auditor">{FIRM_ROLE_LABELS.auditor}</option>
          </select>
        ),
      value: (u) => u.firmRole,
    },
    {
      key: 'memberSince',
      header: 'הצטרף',
      dir: 'ltr',
      sortable: true,
      cell: (u) => (
        <span className="text-ink-600 text-xs">{u.memberSince.slice(0, 10)}</span>
      ),
      value: (u) => u.memberSince,
    },
    {
      key: 'lastSignIn',
      header: 'כניסה אחרונה',
      dir: 'ltr',
      sortable: true,
      cell: (u) => (
        <span className="text-ink-600 text-xs">
          {u.lastSignIn ? u.lastSignIn.slice(0, 10) : 'מעולם לא'}
        </span>
      ),
      value: (u) => u.lastSignIn ?? '',
    },
    {
      key: 'actions',
      header: '',
      align: 'left',
      cell: (u) =>
        u.id === currentUserId ? null : (
          <button
            onClick={() => onRemove(u)}
            disabled={isPending}
            className="text-ink-600 hover:text-red-600 disabled:opacity-50"
            aria-label="הסר משתמש"
          >
            <Trash2 size={14} />
          </button>
        ),
    },
  ];

  return (
    <div className="space-y-5">
      {error && (
        <div className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg p-2.5">
          {error}
        </div>
      )}

      {credentials && (
        <div className="bg-amber-50 border border-amber-300 rounded-lg p-4 space-y-3">
          <div className="font-semibold text-amber-900">
            המשתמש נוצר. העבר את הפרטים האלה למשתמש בערוץ מאובטח (לא במייל רגיל).
          </div>
          <div className="text-sm text-amber-900">
            הסיסמה מוצגת פעם אחת בלבד. לאחר רענון הדף לא ניתן יהיה לראות אותה.
          </div>
          <div className="bg-white border border-amber-200 rounded p-3 space-y-2 text-sm">
            <CopyRow label="אימייל" value={credentials.email} kind="email" copied={copied} onCopy={copy} />
            <CopyRow label="סיסמה זמנית" value={credentials.password} kind="password" copied={copied} onCopy={copy} />
          </div>
          <button
            onClick={() => setCredentials(null)}
            className="text-sm text-amber-900 underline"
          >
            סגירה
          </button>
        </div>
      )}

      {showInvite && (
        <section className="bg-white border border-ink-200 rounded-xl p-5 space-y-3">
          <h3 className="font-semibold text-ink-900 text-sm">הזמנת משתמש חדש למשרד</h3>
          <form
            action={onInvite}
            className="flex flex-col sm:flex-row gap-3 items-stretch sm:items-end"
          >
            <div className="flex-1">
              <label className="block text-xs font-medium text-ink-700 mb-1">אימייל</label>
              <input
                type="email"
                name="email"
                required
                dir="ltr"
                disabled={isPending}
                className="w-full px-3 py-2 border border-ink-200 rounded-lg text-sm focus:ring-2 focus:ring-accent-500 focus:outline-none"
                placeholder="user@example.com"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-ink-700 mb-1">תפקיד</label>
              <select
                name="role"
                defaultValue="member"
                disabled={isPending}
                className="px-3 py-2 border border-ink-200 rounded-lg text-sm focus:ring-2 focus:ring-accent-500 focus:outline-none"
              >
                <option value="member">משתמש רגיל</option>
                <option value="admin">מנהל</option>
              </select>
            </div>
            <button
              type="submit"
              disabled={isPending}
              className="px-4 py-2 bg-accent-600 text-white rounded-lg text-sm font-medium hover:bg-accent-500 disabled:opacity-50"
            >
              {isPending ? 'יוצר...' : 'צור והזמן'}
            </button>
            <button
              type="button"
              onClick={() => setShowInvite(false)}
              className="px-3 py-2 text-ink-600 hover:bg-ink-50 rounded-lg text-sm"
            >
              ביטול
            </button>
          </form>
          <p className="text-xs text-ink-500">
            המערכת תיצור חשבון בעל סיסמה זמנית. תקבל את הפרטים — העבר אותם למשתמש בערוץ מאובטח.
          </p>
        </section>
      )}

      <DataTable<UserListRow>
        rows={rows}
        columns={columns}
        searchKeys={['email']}
        searchPlaceholder="חיפוש לפי אימייל..."
        defaultSort={{ key: 'email', direction: 'asc' }}
        toolbarStart={
          !showInvite ? (
            <button
              onClick={() => setShowInvite(true)}
              disabled={atLimit}
              className="px-3 py-2 bg-accent-600 text-white rounded-lg text-sm font-medium hover:bg-accent-500 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1.5"
              title={atLimit ? 'הגעת למכסת המשתמשים' : ''}
            >
              <UserPlus size={14} />
              הזמן משתמש
            </button>
          ) : null
        }
      />

      {atLimit && !showInvite && (
        <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg p-2.5">
          הגעת למכסת המשתמשים במשרד. הסר משתמש קיים כדי להוסיף חדש.
        </p>
      )}
    </div>
  );
}

function CopyRow({
  label,
  value,
  kind,
  copied,
  onCopy,
}: {
  label: string;
  value: string;
  kind: 'email' | 'password';
  copied: 'email' | 'password' | null;
  onCopy: (v: string, kind: 'email' | 'password') => void;
}) {
  const isCopied = copied === kind;
  return (
    <div className="flex items-center justify-between gap-2">
      <div>
        <span className="text-ink-600">{label}: </span>
        <span dir="ltr" className="font-mono text-ink-900">
          {value}
        </span>
      </div>
      <button
        onClick={() => onCopy(value, kind)}
        className="text-xs text-amber-900 hover:bg-amber-100 px-2 py-1 rounded inline-flex items-center gap-1"
      >
        {isCopied ? <Check size={12} /> : <Copy size={12} />}
        {isCopied ? 'הועתק' : 'העתק'}
      </button>
    </div>
  );
}
