'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2, AlertTriangle, ShieldCheck } from 'lucide-react';
import { createSupabaseBrowserClient } from '@/lib/supabase/browser';

export function MfaChallenge({ nextPath }: { nextPath: string }) {
  const router = useRouter();
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      const supabase = createSupabaseBrowserClient();
      const { data: factors, error: listErr } = await supabase.auth.mfa.listFactors();
      if (listErr) {
        setError(listErr.message ?? 'לא הצלחנו לאתר את גורם האימות');
        return;
      }
      const totp = (factors?.totp ?? []).find((f) => f.status === 'verified');
      if (!totp) {
        setError('לא נמצא גורם אימות פעיל לחשבון הזה');
        return;
      }
      const ch = await supabase.auth.mfa.challenge({ factorId: totp.id });
      if (ch.error || !ch.data) {
        setError(ch.error?.message ?? 'אתגר נכשל');
        return;
      }
      const v = await supabase.auth.mfa.verify({
        factorId: totp.id,
        challengeId: ch.data.id,
        code: code.trim(),
      });
      if (v.error) {
        setError(v.error.message ?? 'הקוד שגוי');
        return;
      }
      // Force refresh so server components/middleware re-evaluate the AAL.
      router.replace(nextPath);
      router.refresh();
    });
  }

  async function logout() {
    const supabase = createSupabaseBrowserClient();
    await supabase.auth.signOut();
    router.replace('/login');
  }

  return (
    <form onSubmit={submit} className="space-y-3">
      {error && (
        <div className="flex items-start gap-2 text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg p-2.5">
          <AlertTriangle size={14} className="flex-shrink-0 mt-0.5" />
          <span>{error}</span>
        </div>
      )}

      <div>
        <label
          htmlFor="totp"
          className="block text-xs font-medium text-ink-700 mb-1"
        >
          קוד 6-ספרות
        </label>
        <input
          id="totp"
          type="text"
          inputMode="numeric"
          pattern="\d*"
          maxLength={6}
          autoComplete="one-time-code"
          autoFocus
          value={code}
          onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
          placeholder="123456"
          dir="ltr"
          className="w-full px-3 py-3 border border-ink-200 rounded-lg text-lg font-mono tabular-nums text-center tracking-widest focus:outline-none focus:ring-2 focus:ring-accent-500"
        />
      </div>

      <button
        type="submit"
        disabled={pending || code.length !== 6}
        className="w-full px-4 py-2.5 bg-accent-600 text-white rounded-lg text-sm font-medium hover:bg-accent-500 disabled:opacity-50 flex items-center justify-center gap-2"
      >
        {pending ? <Loader2 size={14} className="animate-spin" /> : <ShieldCheck size={14} />}
        {pending ? 'מאמת...' : 'אמת והמשך'}
      </button>

      <button
        type="button"
        onClick={logout}
        className="w-full px-4 py-2 text-ink-600 hover:bg-ink-50 rounded-lg text-sm"
      >
        יציאה
      </button>
    </form>
  );
}
