import Link from 'next/link';
import Image from 'next/image';
import {
  ArrowLeft,
  ScanLine,
  FileEdit,
  Download,
  Shield,
  Clock,
  CheckCircle2,
} from 'lucide-react';

export default function HomePage() {
  return (
    <main className="min-h-screen bg-brand-radial text-white">
      {/* Top bar */}
      <header className="border-b border-white/10 px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Image
            src="/os-tech-logo.jpg"
            alt="O.S Tech Ventures"
            width={44}
            height={44}
            className="rounded-lg object-contain bg-black/40 p-0.5"
            priority
          />
          <div className="leading-tight">
            <div className="font-bold text-white">Priority CPA Automation</div>
            <div className="text-[10px] text-brand-300 tracking-widest uppercase">
              by O.S Tech Ventures
            </div>
          </div>
        </div>
        <Link
          href="/login"
          className="px-4 py-2 bg-brand-500 text-brand-950 rounded-lg font-semibold text-sm shadow-glow hover:bg-brand-400 transition"
        >
          כניסה למערכת
        </Link>
      </header>

      {/* Hero */}
      <section className="max-w-5xl mx-auto px-6 pt-20 pb-16 text-center">
        <h1 className="text-4xl sm:text-5xl font-bold leading-tight mb-5">
          רואי החשבון לא מקלידים יותר.
          <br />
          <span className="text-brand-glow">המערכת עושה את העבודה השחורה.</span>
        </h1>
        <p className="text-lg text-white/70 max-w-2xl mx-auto leading-relaxed mb-8">
          קבלה אוטומטית של חשבוניות ספק, חילוץ נתונים, יצירת פקודות יומן מדויקות
          לפי כללי הנהלת חשבונות ישראלית, וייצוא קובץ MOVEIN.DAT שנטען לפריוריטי
          בלחיצה.
        </p>
        <div className="flex gap-3 justify-center">
          <Link
            href="/login"
            className="px-6 py-3 bg-brand-500 text-brand-950 rounded-lg font-semibold shadow-glow hover:bg-brand-400 transition flex items-center gap-2"
          >
            התחל עכשיו
            <ArrowLeft size={18} />
          </Link>
        </div>

        <div className="mt-6 text-xs text-white/50 tracking-widest uppercase">
          Automate · Optimize · Grow
        </div>
      </section>

      {/* What it does */}
      <section className="max-w-5xl mx-auto px-6 py-16">
        <h2 className="text-2xl font-bold text-center mb-2">איך זה עובד</h2>
        <p className="text-center text-white/60 mb-12">4 שלבים. דקות, לא שעות.</p>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Step
            num={1}
            icon={ScanLine}
            title="קליטה אוטומטית"
            description="חשבונית מגיעה במייל / Drive / העלאה. המערכת מזהה מיד."
          />
          <Step
            num={2}
            icon={FileEdit}
            title="OCR + JE אוטומטי"
            description="חילוץ נתונים, התאמת ספק, בניית פקודת יומן מאוזנת."
          />
          <Step
            num={3}
            icon={CheckCircle2}
            title="אישור הרו״ח"
            description="הרו״ח רואה את כל ה-JE-ים יחד, עורך לפי הצורך, מאשר."
          />
          <Step
            num={4}
            icon={Download}
            title="ייצוא לפריוריטי"
            description="MOVEIN.DAT נוצר. טעינה לפריוריטי בלחיצה."
          />
        </div>
      </section>

      {/* Why us */}
      <section className="max-w-5xl mx-auto px-6 py-16">
        <h2 className="text-2xl font-bold text-center mb-12">למה זה שונה</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <Pillar
            icon={Clock}
            title="חוסך 90% זמן"
            description="חשבונית שלקחה 5 דקות עכשיו 30 שניות. לקוח של 50 חשבוניות בחודש = 4 שעות שחזרו."
          />
          <Pillar
            icon={Shield}
            title="audit log לכל פעולה"
            description='כל יצירה, עריכה ואישור נכתבים אוטומטית ל-DB עם trigger שחוסם UPDATE/DELETE — שמירה ל-7 שנים.'
          />
          <Pillar
            icon={CheckCircle2}
            title="חוקי המס מובנים"
            description="מע״מ 18% פוסט-2025 / 17% לפני, מספר הקצאה (חוק 2024+), ניכוי מעורב — הכל אוטומטי."
          />
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-white/10 px-6 py-6 text-center text-xs text-white/40">
        Priority CPA Automation v0.2 · נבנה ע״י O.S Tech Ventures · Israeli
        accountants, automated.
      </footer>
    </main>
  );
}

function Step({
  num,
  icon: Icon,
  title,
  description,
}: {
  num: number;
  icon: typeof ScanLine;
  title: string;
  description: string;
}) {
  return (
    <div className="bg-white/5 border border-white/10 rounded-xl p-5 backdrop-blur-sm hover:border-brand-500/50 transition">
      <div className="flex items-center gap-2 mb-3">
        <div className="w-8 h-8 rounded-full bg-brand-500/20 text-brand-300 flex items-center justify-center text-sm font-bold">
          {num}
        </div>
        <Icon size={18} className="text-brand-glow" />
      </div>
      <div className="font-semibold text-white text-sm mb-1.5">{title}</div>
      <div className="text-xs text-white/60 leading-relaxed">{description}</div>
    </div>
  );
}

function Pillar({
  icon: Icon,
  title,
  description,
}: {
  icon: typeof Clock;
  title: string;
  description: string;
}) {
  return (
    <div className="bg-white/5 border border-white/10 rounded-xl p-6 backdrop-blur-sm">
      <div className="w-10 h-10 rounded-lg bg-brand-500/20 text-brand-glow flex items-center justify-center mb-3">
        <Icon size={20} />
      </div>
      <div className="font-semibold text-white mb-2">{title}</div>
      <div className="text-sm text-white/60 leading-relaxed">{description}</div>
    </div>
  );
}
