'use client';

import { useEffect, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import {
  ShieldCheck,
  ShieldAlert,
  Loader2,
  AlertTriangle,
  CheckCircle2,
  X,
} from 'lucide-react';
import { createSupabaseBrowserClient } from '@/lib/supabase/browser';

type MfaStatus =
  | { phase: 'loading' }
  | { phase: 'unsupported' }
  | { phase: 'idle'; verified: boolean; factorId: string | null }
  | { phase: 'enrolling'; factorId: string; qrCode: string; secret: string };

export function MfaPanel() {
  const router = useRouter();
  const [status, setStatus] = useState<MfaStatus>({ phase: 'loading' });
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    void refreshFactors();
  }, []);

  async function refreshFactors() {
    setError(null);
    try {
      const supabase = createSupabaseBrowserClient();
      const { data, error } = await supabase.auth.mfa.listFactors();
      if (error) {
        setStatus({ phase: 'unsupported' });
        return;
      }
      const verified = (data?.totp ?? []).find((f) => f.status === 'verified');
      const unverified = (data?.totp ?? []).find((f) => f.status !== 'verified');
      // Clean up stray unverified factors so the user can start fresh.
      if (!verified && unverified) {
        await supabase.auth.mfa.unenroll({ factorId: unverified.id });
      }
      setStatus({
        phase: 'idle',
        verified: !!verified,
        factorId: verified?.id ?? null,
      });
    } catch {
      setStatus({ phase: 'unsupported' });
    }
  }

  function startEnroll() {
    setError(null);
    setInfo(null);
    setCode('');
    startTransition(async () => {
      const supabase = createSupabaseBrowserClient();
      const { data, error } = await supabase.auth.mfa.enroll({
        factorType: 'totp',
        friendlyName: `Priority CPA · ${new Date().toLocaleDateString('he-IL')}`,
      });
      if (error || !data) {
        setError(error?.message ?? 'הפעלת אימות דו-שלבי נכשלה');
        return;
      }
      setStatus({
        phase: 'enrolling',
        factorId: data.id,
        qrCode: data.totp.qr_code,
        secret: data.totp.secret,
      });
    });
  }

  function verifyEnrollment() {
    if (status.phase !== 'enrolling') return;
    const factorId = status.factorId;
    setError(null);
    startTransition(async () => {
      const supabase = createSupabaseBrowserClient();
      const ch = await supabase.auth.mfa.challenge({ factorId });
      if (ch.error || !ch.data) {
        setError(ch.error?.message ?? 'אתגר נכשל');
        return;
      }
      const v = await supabase.auth.mfa.verify({
        factorId,
        challengeId: ch.data.id,
        code: code.trim(),
      });
      if (v.error) {
        setError(v.error.message ?? 'הקוד שגוי');
        return;
      }
      setInfo('האימות הדו-שלבי הופעל. מעכשיו תידרש להזין קוד בכל התחברות.');
      setStatus({ phase: 'idle', verified: true, factorId });
      setCode('');
      // Refresh server components so layout/middleware pick up new AAL.
      router.refresh();
    });
  }

  function cancelEnroll() {
    if (status.phase !== 'enrolling') return;
    const factorId = status.factorId;
    startTransition(async () => {
      const supabase = createSupabaseBrowserClient();
      await supabase.auth.mfa.unenroll({ factorId });
      setStatus({ phase: 'idle', verified: false, factorId: null });
      setCode('');
    });
  }

  function disable() {
    if (status.phase !== 'idle' || !status.verified || !status.factorId) return;
    if (
      !confirm(
        'להשבית אימות דו-שלבי? החשבון יחזור להגנת סיסמה בלבד. ניתן יהיה להפעיל שוב בכל עת.',
      )
    ) {
      return;
    }
    const factorId = status.factorId;
    setError(null);
    startTransition(async () => {
      const supabase = createSupabaseBrowserClient();
      const { error } = await supabase.auth.mfa.unenroll({ factorId });
      if (error) {
        setError(error.message ?? 'השבתה נכשלה');
        return;
      }
      setInfo('האימות הדו-שלבי הושבת');
      setStatus({ phase: 'idle', verified: false, factorId: null });
      router.refresh();
    });
  }

  return (
    <section className="bg-white border border-ink-200 rounded-xl p-5 space-y-3">
      <div className="flex items-start gap-3">
        <div
          className={`w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0 ${
            status.phase === 'idle' && status.verified
              ? 'bg-emerald-50 text-emerald-700'
              : 'bg-ink-100 text-ink-600'
          }`}
        >
          {status.phase === 'idle' && status.verified ? (
            <ShieldCheck size={20} />
          ) : (
            <ShieldAlert size={20} />
          )}
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="text-sm font-semibold text-ink-900">אימות דו-שלבי (2FA)</h3>
          <p className="text-xs text-ink-600 mt-0.5 leading-relaxed">
            הוספת שכבת אבטחה שנייה: בכל התחברות תידרש להזין קוד 6-ספרתי
            ממיישם authenticator (Google Authenticator / Authy / 1Password).
          </p>
        </div>
        <StatusBadge status={status} />
      </div>

      {error && (
        <div className="flex items-start gap-2 text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg p-2.5">
          <AlertTriangle size={14} className="flex-shrink-0 mt-0.5" />
          <span>{error}</span>
        </div>
      )}
      {info && (
        <div className="flex items-start gap-2 text-sm text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg p-2.5">
          <CheckCircle2 size={14} className="flex-shrink-0 mt-0.5" />
          <span>{info}</span>
        </div>
      )}

      {status.phase === 'loading' && (
        <div className="text-sm text-ink-500 flex items-center gap-2">
          <Loader2 size={14} className="animate-spin" />
          טוען מצב נוכחי...
        </div>
      )}

      {status.phase === 'unsupported' && (
        <div className="text-sm text-amber-800 bg-amber-50 border border-amber-200 rounded-lg p-2.5">
          הפעלת MFA לא זמינה בפרויקט הזה. ייתכן שצריך לאפשר את התכונה בהגדרות
          Supabase Auth.
        </div>
      )}

      {status.phase === 'idle' && !status.verified && (
        <button
          onClick={startEnroll}
          disabled={pending}
          className="px-4 py-2 bg-accent-600 text-white rounded-lg text-sm font-medium hover:bg-accent-500 disabled:opacity-50"
        >
          {pending ? 'מתחיל...' : 'הפעל אימות דו-שלבי'}
        </button>
      )}

      {status.phase === 'idle' && status.verified && (
        <button
          onClick={disable}
          disabled={pending}
          className="px-4 py-2 border border-red-200 text-red-700 rounded-lg text-sm hover:bg-red-50 disabled:opacity-50"
        >
          השבת אימות דו-שלבי
        </button>
      )}

      {status.phase === 'enrolling' && (
        <div className="space-y-3 bg-ink-50/40 border border-ink-100 rounded-lg p-4">
          <div className="text-sm text-ink-800 leading-relaxed">
            <strong>1.</strong> סרוק את ה-QR עם אפליקציית authenticator (או הזן את
            הסוד ידנית).
          </div>
          <div className="flex items-start gap-4 flex-wrap">
            {status.qrCode.startsWith('data:') ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={status.qrCode}
                alt="QR לאימות דו-שלבי"
                className="w-40 h-40 bg-white border border-ink-200 rounded-lg"
              />
            ) : (
              <div
                className="w-40 h-40 bg-white border border-ink-200 rounded-lg p-2 flex items-center justify-center"
                dangerouslySetInnerHTML={{ __html: status.qrCode }}
              />
            )}
            <div className="text-xs text-ink-600 space-y-1 flex-1 min-w-0">
              <div>סוד ידני (אם הסריקה לא עובדת):</div>
              <code
                dir="ltr"
                className="block bg-white border border-ink-200 rounded p-2 font-mono text-ink-900 break-all"
              >
                {status.secret}
              </code>
            </div>
          </div>
          <div className="text-sm text-ink-800">
            <strong>2.</strong> הזן את הקוד הששת-ספרתי שמופיע באפליקציה:
          </div>
          <div className="flex items-center gap-2">
            <input
              type="text"
              inputMode="numeric"
              pattern="\d*"
              maxLength={6}
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
              placeholder="123456"
              dir="ltr"
              className="w-32 px-3 py-2 border border-ink-200 rounded-lg text-sm font-mono tabular-nums text-center focus:outline-none focus:ring-2 focus:ring-accent-500"
            />
            <button
              onClick={verifyEnrollment}
              disabled={pending || code.length !== 6}
              className="px-4 py-2 bg-accent-600 text-white rounded-lg text-sm font-medium hover:bg-accent-500 disabled:opacity-50"
            >
              {pending ? <Loader2 size={14} className="animate-spin" /> : 'אמת והפעל'}
            </button>
            <button
              onClick={cancelEnroll}
              disabled={pending}
              className="px-3 py-2 text-ink-600 hover:bg-ink-50 rounded-lg text-sm flex items-center gap-1"
            >
              <X size={14} />
              ביטול
            </button>
          </div>
        </div>
      )}
    </section>
  );
}

function StatusBadge({ status }: { status: MfaStatus }) {
  if (status.phase === 'idle' && status.verified) {
    return (
      <span className="text-[10px] px-2 py-0.5 rounded font-medium bg-emerald-100 text-emerald-800 flex-shrink-0">
        פעיל
      </span>
    );
  }
  if (status.phase === 'enrolling') {
    return (
      <span className="text-[10px] px-2 py-0.5 rounded font-medium bg-amber-100 text-amber-800 flex-shrink-0">
        בהפעלה
      </span>
    );
  }
  return (
    <span className="text-[10px] px-2 py-0.5 rounded font-medium bg-ink-100 text-ink-700 flex-shrink-0">
      לא פעיל
    </span>
  );
}
