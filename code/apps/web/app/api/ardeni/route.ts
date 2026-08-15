import { NextRequest, NextResponse } from 'next/server';
import { randomUUID } from 'node:crypto';
import JSZip from 'jszip';
import { convertBkmv, type ConversionReport } from '@priority-cpa/ardeni-parser';
import {
  pairEntries,
  generateMoveInShort,
  generateHeshin,
} from '@priority-cpa/hashavshevet-generator';
import { SupabaseAuditStore } from '@priority-cpa/audit-logger';
import { requireUser } from '@/lib/auth';
import { loadCompanyForUser } from '@/lib/company-context';
import { getAdminClient } from '@/lib/supabase/admin';

const BUCKET = 'ardeni-imports';
const MAX_BYTES = 50 * 1024 * 1024;
const SIGNED_TTL = 60 * 60;

// Hebrew error catalog — codes only to the UI, never stack traces.
const ERRORS: Record<string, string> = {
  company_required: 'יש לבחור חברה לפני ייבוא',
  company_forbidden: 'אין לך הרשאה לחברה זו',
  file_missing: 'לא צורף קובץ BKMVDATA.TXT',
  file_too_large: 'הקובץ חורג מ-50MB',
  opening_not_a100: 'הקובץ אינו במבנה אחיד תקין — הרשומה הראשונה אינה A100',
  imbalance: 'הקובץ אינו מאוזן — סך חובה שונה מסך זכות. אין לייצא.',
  job_not_found: 'לא נמצאה משימת ייבוא',
  input_missing: 'קובץ המקור אינו זמין עוד — יש להעלות מחדש',
  output_missing: 'קובץ הפלט אינו זמין — יש לייצא מחדש',
  upload_failed: 'שמירת הקובץ נכשלה — נסה שוב',
  export_failed: 'יצירת קובץ הייצוא נכשלה — פנה לתמיכה עם מזהה המשימה',
};

function err(code: string, status: number): NextResponse {
  return NextResponse.json({ error_code: code, error: ERRORS[code] ?? code }, { status });
}

async function resolveCompany(request: NextRequest, userId: string, email: string) {
  const companyId = new URL(request.url).searchParams.get('companyId');
  if (!companyId) return { error: err('company_required', 400) } as const;
  try {
    const company = await loadCompanyForUser(userId, email, companyId);
    return { company } as const;
  } catch {
    // loadCompanyForUser throws notFound() for unknown/forbidden companies —
    // surface a proper JSON 403 instead of Next's HTML 404.
    return { error: err('company_forbidden', 403) } as const;
  }
}

function inputPath(companyId: string, jobId: string): string {
  return `${companyId}/${jobId}/BKMVDATA.TXT`;
}
function outputPath(companyId: string, jobId: string): string {
  return `${companyId}/${jobId}/hashavshevet.zip`;
}

function reportText(report: ConversionReport): string {
  const currencies = Object.entries(report.currencyCounts)
    .map(([c, n]) => `  ${c}: ${n} שורות`)
    .join('\n');
  const periods = report.periods.join(', ') || '—';
  return `דוח המרה — מבנה אחיד (BKMV) → חשבשבת

תאריך הפקה: ${new Date().toISOString().slice(0, 10)}

ספירות:
  שורות תנועה (B100): ${report.sourceLineCount}
  חשבונות במקור (B110): ${report.sourceAccountCount}
  חשבונות שבשימוש בפועל: ${report.requiredAccountCount}

פקודות יומן:
  סה"כ: ${report.jeCount}
  פקודה ממספר-תנועה יחיד: ${report.singleTransJeCount}
  פקודות ממוזגות (>1 מספר-תנועה): ${report.mergedJeCount}
  אצוות עם שורות לא-מאוזנות: ${report.unbalancedTrailerCount}

איזון:
  סך חובה: ${report.drSum.toFixed(2)} ש"ח
  סך זכות: ${report.crSum.toFixed(2)} ש"ח
  הפרש: ${report.netImbalance.toFixed(2)} ש"ח
  מאוזן לייצוא: ${report.balanceOk ? 'כן' : 'לא'}

מטבעות:
${currencies || '  —'}

תקופות בקובץ (לפתוח בחשבשבת): ${periods}

אזהרות:
${report.warnings.length ? report.warnings.map((w) => `  • ${w}`).join('\n') : '  אין'}

קבצים בחבילה:
  movein.dat  — תנועות יומן (פורמט מקוצר, רשומות 88 תווים)
  HESHIN.DAT  — כרטיסי חשבון (שם + ח.פ/עוסק כשקיים במקור)
  HESHIN.PRM  — הגדרת מבנה כרטיסי החשבון

קידוד: Windows-1255 (CP1255), CR+LF.
`;
}

const INSTRUCTIONS = `הוראות טעינה לחשבשבת

חשוב — סדר הטעינה קובע:
קודם כרטיסי חשבון (HESHIN), רק אחר כך תנועות (movein).
טעינת תנועות לפני החשבונות תפתח כרטיסים ריקים עם שם ברירת מחדל.

1. חלצו את שלושת הקבצים לתיקיית ה-rep של החברה בחשבשבת.
   אין לפתוח את הקבצים בעורך טקסט — שמירה תהרוס את הקידוד.
2. קליטת חשבונות: כללי -> ממשקים -> קליטת חשבונות מקובץ -> HESHIN.DAT.
   ודאו שמספר החשבונות שנקלט תואם לדוח ההמרה.
3. קליטת תנועות: כללי -> ממשקים -> קליטת תנועות יומן -> movein.dat.
   הזינו מספר מנה ייחודי. אין צורך ב"פתיחת כרטיסים אוטומטית".
4. בדקו את דוח הקליטה (חובה = זכות), ורק אז בצעו העברה מטבלת
   הקליטה ליומן.

אם הדוח מציין תקופות שאינן פתוחות — פתחו אותן לפני הקליטה.
`;

/* ======================================================================
 * POST (multipart, no ?job) — upload + parse + blocking preview.
 * POST (?job=<id>)          — generate the Hashavshevet package, store, return zip.
 * ====================================================================== */
export async function POST(request: NextRequest) {
  const me = await requireUser();
  const resolved = await resolveCompany(request, me.id, me.email);
  if ('error' in resolved) return resolved.error;
  const { company } = resolved;

  const admin = getAdminClient();
  const exportJobId = new URL(request.url).searchParams.get('job');

  if (exportJobId) {
    return exportJob(admin, company, me, exportJobId);
  }

  // ─── Upload + preview ────────────────────────────────────────────────
  const form = await request.formData();
  const file = form.get('file');
  if (!(file instanceof File)) return err('file_missing', 400);
  if (file.size > MAX_BYTES) return err('file_too_large', 400);

  const buffer = Buffer.from(await file.arrayBuffer());
  const { report } = convertBkmv(buffer);

  const jobId = randomUUID();
  const path = inputPath(company.id, jobId);
  const upload = await admin.storage
    .from(BUCKET)
    .upload(path, buffer, { contentType: 'text/plain', upsert: true });
  if (upload.error) return err('upload_failed', 500);

  const status = report.isOpeningValid ? 'parsed' : 'failed';
  const errorCode = !report.isOpeningValid
    ? 'opening_not_a100'
    : !report.balanceOk
      ? 'imbalance'
      : null;

  await admin.from('import_jobs').insert({
    id: jobId,
    company_id: company.id,
    source: 'unified_format',
    status,
    original_filename: file.name,
    je_count: report.jeCount,
    source_line_count: report.sourceLineCount,
    required_account_count: report.requiredAccountCount,
    net_imbalance: report.netImbalance,
    balance_ok: report.balanceOk,
    currencies: report.currencyCounts,
    periods: report.periods,
    warnings: report.warnings,
    report,
    input_storage_path: path,
    error_code: errorCode,
    created_by: me.id,
  });

  const audit = new SupabaseAuditStore(admin);
  await audit.log({
    companyId: company.id,
    userId: me.id,
    action: 'ardeni.import.upload',
    entityType: 'import_job',
    entityId: jobId,
    payload: {
      filename: file.name,
      je_count: report.jeCount,
      balance_ok: report.balanceOk,
      opening_valid: report.isOpeningValid,
    },
  });

  return NextResponse.json({ jobId, report });
}

function zipResponse(body: Buffer, companyName: string, jobId: string): NextResponse {
  const safeName = companyName.replace(/[^a-zA-Z0-9]/g, '_');
  const bytes = body.buffer.slice(
    body.byteOffset,
    body.byteOffset + body.byteLength,
  ) as ArrayBuffer;
  return new NextResponse(bytes, {
    status: 200,
    headers: {
      'Content-Type': 'application/zip',
      'Content-Disposition': `attachment; filename="hashavshevet-${safeName}-${jobId.slice(0, 8)}.zip"`,
      'Content-Length': String(bytes.byteLength),
    },
  });
}

async function exportJob(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  admin: any,
  company: { id: string; name: string },
  me: { id: string; email: string },
  jobId: string,
): Promise<NextResponse> {
  const { data: job } = await admin
    .from('import_jobs')
    .select('id, company_id, input_storage_path, output_storage_path, balance_ok, status')
    .eq('id', jobId)
    .eq('company_id', company.id)
    .maybeSingle();
  if (!job) return err('job_not_found', 404);
  if (job.status === 'failed') return err('opening_not_a100', 400);
  if (!job.balance_ok) return err('imbalance', 400);

  // Idempotent: a repeated export returns the stored package instead of
  // creating anything new.
  if (job.status === 'exported' && job.output_storage_path) {
    const stored = await admin.storage.from(BUCKET).download(job.output_storage_path);
    if (!stored.error && stored.data) {
      return zipResponse(Buffer.from(await stored.data.arrayBuffer()), company.name, jobId);
    }
    // Stored output vanished — fall through and regenerate.
  }

  if (!job.input_storage_path) return err('input_missing', 400);
  const dl = await admin.storage.from(BUCKET).download(job.input_storage_path);
  if (dl.error || !dl.data) return err('input_missing', 400);
  const buffer = Buffer.from(await dl.data.arrayBuffer());

  const { entries, requiredAccounts, report } = convertBkmv(buffer);
  const { records, unbalancedJeIndexes } = pairEntries(
    entries.map((e) => ({
      index: e.index,
      documentDate: e.documentDate,
      valueDate: e.valueDate,
      details: e.details,
      lines: e.lines.map((l) => ({
        account: l.account,
        side: l.side,
        amountIls: l.amountIls,
      })),
    })),
  );
  if (records.length === 0) return err('export_failed', 500);

  const movein = generateMoveInShort(records);
  const heshin = generateHeshin(
    requiredAccounts.map((a) => ({
      accountKey: a.accountKey,
      accountName: a.accountName,
      ...(a.taxId ? { taxId: a.taxId } : {}),
    })),
  );

  const fullReport =
    reportText(report) +
    (unbalancedJeIndexes.length
      ? `\nפקודות שלא יוצאו (לא מאוזנות): ${unbalancedJeIndexes.join(', ')}\n`
      : '');

  const zip = new JSZip();
  zip.file('movein.dat', movein);
  zip.file('HESHIN.DAT', heshin.dat);
  zip.file('HESHIN.PRM', heshin.prm);
  zip.file('conversion-report.txt', fullReport);
  zip.file('הוראות-טעינה.txt', INSTRUCTIONS);
  const zipBuf = await zip.generateAsync({ type: 'nodebuffer' });

  const outPath = outputPath(company.id, jobId);
  const outUpload = await admin.storage
    .from(BUCKET)
    .upload(outPath, zipBuf, { contentType: 'application/zip', upsert: true });
  if (outUpload.error) return err('upload_failed', 500);

  await admin
    .from('import_jobs')
    .update({ status: 'exported', output_storage_path: outPath })
    .eq('id', jobId);

  const audit = new SupabaseAuditStore(admin);
  await audit.log({
    companyId: company.id,
    userId: me.id,
    action: 'ardeni.import.export',
    entityType: 'import_job',
    entityId: jobId,
    payload: {
      je_count: report.jeCount,
      record_count: records.length,
      account_count: requiredAccounts.length,
      unbalanced_je_count: unbalancedJeIndexes.length,
      format: 'hashavshevet-short-88',
    },
  });

  return zipResponse(zipBuf, company.name, jobId);
}

/* ======================================================================
 * GET (?job=<id>) — re-download an already-exported job's zip.
 * ====================================================================== */
export async function GET(request: NextRequest) {
  const me = await requireUser();
  const resolved = await resolveCompany(request, me.id, me.email);
  if ('error' in resolved) return resolved.error;
  const { company } = resolved;

  const jobId = new URL(request.url).searchParams.get('job');
  if (!jobId) return err('job_not_found', 400);

  const admin = getAdminClient();
  const { data: job } = await admin
    .from('import_jobs')
    .select('id, company_id, output_storage_path')
    .eq('id', jobId)
    .eq('company_id', company.id)
    .maybeSingle();
  if (!job) return err('job_not_found', 404);
  if (!job.output_storage_path) return err('output_missing', 400);

  const signed = await admin.storage
    .from(BUCKET)
    .createSignedUrl(job.output_storage_path, SIGNED_TTL);
  if (signed.error || !signed.data) return err('output_missing', 400);
  return NextResponse.json({ url: signed.data.signedUrl });
}
