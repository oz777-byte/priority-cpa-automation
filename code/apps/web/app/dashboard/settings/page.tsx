import { requireUser } from '@/lib/auth';
import { ChangePasswordForm } from './change-password-form';

export const dynamic = 'force-dynamic';

export default async function SettingsPage() {
  const user = await requireUser();
  return (
    <div className="max-w-xl mx-auto space-y-6">
      <header>
        <h1 className="text-2xl font-bold text-ink-900">הגדרות חשבון</h1>
        <p className="text-ink-600 mt-1 text-sm">
          מחובר כ-<span dir="ltr">{user.email}</span>
        </p>
      </header>
      <ChangePasswordForm />
    </div>
  );
}
