import { requireUser } from '@/lib/auth';
import { listCompaniesForUser, getCurrentCompany } from '@/lib/current-company';
import { CompaniesPanel } from './companies-panel';

export const dynamic = 'force-dynamic';

export default async function CompaniesPage() {
  const me = await requireUser();
  const companies = await listCompaniesForUser(me.id, me.email);
  const current = await getCurrentCompany(me.id, me.email);

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <header>
        <h1 className="text-2xl font-bold text-ink-900">החברות שלי</h1>
        <p className="text-ink-600 mt-1 text-sm">
          כל חברה היא לקוח שאתה מטפל בו. ההגדרות החשבונאיות שלה (מספרי חשבונות,
          סוג תנועה) נשמרות פר-חברה.
        </p>
      </header>

      <CompaniesPanel
        companies={companies}
        currentCompanyId={current?.id ?? null}
      />
    </div>
  );
}
