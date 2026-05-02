'use client';

import { useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { LogIn } from 'lucide-react';
import { createSupabaseBrowserClient } from '@/lib/supabase/browser';

export function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const next = searchParams.get('next') ?? '/dashboard';

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const supabase = createSupabaseBrowserClient();
      const { error: err } = await supabase.auth.signInWithPassword({ email, password });
      if (err) throw err;
      router.push(next);
      router.refresh();
    } catch {
      setError('פרטי כניסה שגויים');
      setBusy(false);
    }
  }

  return (
    <div className="bg-white/[0.07] border border-white/10 rounded-xl p-8 space-y-6 backdrop-blur-md shadow-glow">
      <header className="text-center space-y-1">
        <h1 className="text-xl font-bold text-white">כניסה למערכת</h1>
        <p className="text-xs text-white/60">Priority CPA Automation</p>
      </header>

      <form onSubmit={handleSubmit} className="space-y-4">
        <Field label="אימייל">
          <input
            type="email"
            required
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            dir="ltr"
            placeholder="you@example.com"
            className="w-full px-3 py-2.5 bg-white/10 border border-white/20 rounded-lg text-white placeholder-white/30 focus:outline-none focus:ring-2 focus:ring-brand-500"
          />
        </Field>

        <Field label="סיסמה">
          <input
            type="password"
            required
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            dir="ltr"
            className="w-full px-3 py-2.5 bg-white/10 border border-white/20 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-brand-500"
          />
        </Field>

        {error && (
          <div className="text-sm text-red-300 bg-red-900/30 border border-red-500/30 rounded p-2.5">
            {error}
          </div>
        )}

        <button
          type="submit"
          disabled={busy}
          className="w-full py-3 bg-brand-500 text-brand-950 rounded-lg font-semibold hover:bg-brand-400 disabled:opacity-50 transition flex items-center justify-center gap-2"
        >
          {busy ? 'מעבד...' : (
            <>
              <LogIn size={18} />
              כניסה
            </>
          )}
        </button>
      </form>

      <p className="text-xs text-white/40 text-center">
        ההרשמה נעשית באמצעות הזמנה ממנהל המערכת בלבד.
      </p>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-sm font-medium text-white/80 mb-1.5">{label}</label>
      {children}
    </div>
  );
}
