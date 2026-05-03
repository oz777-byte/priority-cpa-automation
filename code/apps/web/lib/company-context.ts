import { notFound } from 'next/navigation';
import { getAdminClient } from '@/lib/supabase/admin';
import { ensureUserFirm } from '@/lib/bootstrap';
import type { CompanyRow } from './current-company';

/**
 * Server-side: load a company by ID, verifying the current user has access.
 * Returns 404 if the company doesn't exist or doesn't belong to the user's firm.
 */
export async function loadCompanyForUser(
  userId: string,
  email: string,
  companyId: string,
): Promise<CompanyRow> {
  const firmId = await ensureUserFirm(userId, email);
  const admin = getAdminClient();
  const { data, error } = await admin
    .from('companies')
    .select('id, firm_id, name, tax_id, priority_version, status, settings, inbox_token, vat_basis, vat_filing_frequency, created_at')
    .eq('id', companyId)
    .eq('firm_id', firmId)
    .maybeSingle();
  if (error || !data) notFound();
  return data as CompanyRow;
}
