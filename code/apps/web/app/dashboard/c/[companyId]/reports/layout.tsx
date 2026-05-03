import Link from 'next/link';
import { BarChart3 } from 'lucide-react';
import { ReportsTabs } from './reports-tabs';

export default function ReportsLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: { companyId: string };
}) {
  return (
    <div className="space-y-5 print:space-y-3">
      <div className="print:hidden">
        <h2 className="text-lg font-semibold text-ink-900 flex items-center gap-2">
          <BarChart3 size={18} className="text-brand-500" />
          דוחות חשבונאיים
        </h2>
        <p className="text-sm text-ink-600 mt-0.5">
          מאזן בוחן · כרטסת חשבון · רווח והפסד · מאזן · מע"מ. כל הדוחות נבנים מפקודות
          היומן בזמן אמת ותומכים בייצוא CSV ובהדפסה ל-PDF (Ctrl+P).
        </p>
      </div>

      <ReportsTabs companyId={params.companyId} />

      {children}
    </div>
  );
}
