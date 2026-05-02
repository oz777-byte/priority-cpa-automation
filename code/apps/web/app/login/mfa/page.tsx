import { MfaChallenge } from './mfa-challenge';

export const dynamic = 'force-dynamic';

export default function MfaChallengePage({
  searchParams,
}: {
  searchParams: { next?: string };
}) {
  return (
    <div className="min-h-screen flex items-center justify-center bg-ink-50 p-4">
      <div className="bg-white border border-ink-200 rounded-2xl shadow-sm p-8 max-w-md w-full space-y-5">
        <header>
          <h1 className="text-xl font-bold text-ink-900">אימות דו-שלבי</h1>
          <p className="text-sm text-ink-600 mt-1 leading-relaxed">
            הזן את הקוד הששת-ספרתי מאפליקציית ה-authenticator כדי להמשיך.
          </p>
        </header>
        <MfaChallenge nextPath={searchParams.next ?? '/dashboard'} />
      </div>
    </div>
  );
}
