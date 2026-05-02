import type { LucideIcon } from 'lucide-react';

export function PageHeader({
  icon: Icon,
  title,
  description,
  action,
}: {
  icon?: LucideIcon;
  title: string;
  description?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex items-start justify-between gap-4 mb-6">
      <div className="flex items-start gap-3">
        {Icon && (
          <div className="flex-shrink-0 w-10 h-10 rounded-lg bg-accent-500/10 text-accent-600 flex items-center justify-center">
            <Icon size={20} />
          </div>
        )}
        <div>
          <h1 className="text-2xl font-bold text-ink-900">{title}</h1>
          {description && (
            <p className="text-ink-600 mt-1 text-sm leading-relaxed max-w-3xl">
              {description}
            </p>
          )}
        </div>
      </div>
      {action && <div className="flex-shrink-0">{action}</div>}
    </div>
  );
}
