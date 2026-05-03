import { cookies } from 'next/headers';
import { getAdminClient } from '@/lib/supabase/admin';
import { ensureUserFirm } from '@/lib/bootstrap';

const COOKIE_NAME = 'pcpa_company';
const COOKIE_OPTS = {
  httpOnly: true,
  sameSite: 'lax' as const,
  secure: process.env.NODE_ENV === 'production',
  path: '/',
  maxAge: 60 * 60 * 24 * 90, // 90 days
};

export interface CompanyRow {
  id: string;
  firm_id: string;
  name: string;
  tax_id: string;
  priority_version: string | null;
  status: 'active' | 'paused' | 'archived';
  settings: Record<string, unknown>;
  inbox_token: string | null;
  vat_basis?: 'accrual' | 'cash';
  vat_filing_frequency?: 'monthly' | 'bimonthly' | 'annual';
  created_at: string;
}

export async function listCompaniesForUser(userId: string, email: string): Promise<CompanyRow[]> {
  const firmId = await ensureUserFirm(userId, email);
  const admin = getAdminClient();
  const { data, error } = await admin
    .from('companies')
    .select('id, firm_id, name, tax_id, priority_version, status, settings, inbox_token, created_at')
    .eq('firm_id', firmId)
    .order('created_at', { ascending: true });
  if (error) throw new Error(error.message);
  return (data ?? []) as CompanyRow[];
}

export function getCompanyCookieRaw(): string | undefined {
  return cookies().get(COOKIE_NAME)?.value;
}

export function setCompanyCookie(companyId: string): void {
  cookies().set(COOKIE_NAME, companyId, COOKIE_OPTS);
}

export function clearCompanyCookie(): void {
  cookies().set(COOKIE_NAME, '', { ...COOKIE_OPTS, maxAge: 0 });
}

/**
 * Returns the user's currently selected company. Falls back to the first
 * company in the firm. Returns null if the firm has no companies yet.
 */
export async function getCurrentCompany(
  userId: string,
  email: string,
): Promise<CompanyRow | null> {
  const companies = await listCompaniesForUser(userId, email);
  if (companies.length === 0) return null;

  const cookieId = getCompanyCookieRaw();
  if (cookieId) {
    const found = companies.find((c) => c.id === cookieId);
    if (found) return found;
    // stale cookie — clear it
    clearCompanyCookie();
  }
  return companies[0] ?? null;
}
