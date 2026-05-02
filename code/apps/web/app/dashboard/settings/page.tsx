import { requireUser } from '@/lib/auth';
import { getLatestRatesPerCurrency } from '@/lib/fx-rates';
import { ChangePasswordForm } from './change-password-form';
import { FxRatesPanel } from './fx-rates-panel';

export const dynamic = 'force-dynamic';

export default async function SettingsPage() {
  const user = await requireUser();
  const rates = await getLatestRatesPerCurrency();

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <header>
        <h1 className="text-2xl font-bold text-ink-900">הגדרות חשבון</h1>
        <p className="text-ink-600 mt-1 text-sm">
          מחובר כ-<span dir="ltr">{user.email}</span>
        </p>
      </header>
      <ChangePasswordForm />
      <FxRatesPanel initialRates={rates} />
    </div>
  );
}
