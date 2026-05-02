import type { LucideIcon } from 'lucide-react';
import { Sparkles } from 'lucide-react';

export function ComingSoon({
  icon: Icon = Sparkles,
  title,
  description,
  features,
  eta,
}: {
  icon?: LucideIcon;
  title: string;
  description: string;
  features?: string[];
  eta?: string;
}) {
  return (
    <div className="space-y-5">
      <div className="flex items-start gap-4">
        <div className="w-12 h-12 rounded-xl bg-brand-500/10 text-brand-500 flex items-center justify-center flex-shrink-0">
          <Icon size={22} />
        </div>
        <div>
          <div className="flex items-center gap-2 mb-1">
            <h2 className="text-lg font-semibold text-ink-900">{title}</h2>
            <span className="text-[10px] uppercase tracking-wider px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 font-semibold">
              בקרוב
            </span>
          </div>
          <p className="text-sm text-ink-600 max-w-2xl leading-relaxed">{description}</p>
        </div>
      </div>

      {features && features.length > 0 && (
        <div className="bg-ink-50/60 border border-ink-200 rounded-xl p-5">
          <div className="text-xs font-semibold text-ink-600 uppercase tracking-wider mb-3">
            מה יהיה כאן
          </div>
          <ul className="space-y-2 text-sm text-ink-800">
            {features.map((f, i) => (
              <li key={i} className="flex items-start gap-2">
                <span className="text-brand-500 mt-0.5">▪</span>
                <span>{f}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {eta && (
        <div className="text-xs text-ink-400 flex items-center gap-1.5">
          <span className="w-1.5 h-1.5 rounded-full bg-amber-500"></span>
          זמן משוער: {eta}
        </div>
      )}
    </div>
  );
}
