import Image from 'next/image';

export function BrandLogo({
  size = 'md',
  showText = true,
}: {
  size?: 'sm' | 'md' | 'lg';
  showText?: boolean;
}) {
  const dims = {
    sm: { w: 32, h: 32, text: 'text-sm' },
    md: { w: 40, h: 40, text: 'text-base' },
    lg: { w: 64, h: 64, text: 'text-xl' },
  }[size];

  return (
    <div className="flex items-center gap-2.5">
      <Image
        src="/os-tech-logo.jpg"
        alt="O.S Tech Ventures"
        width={dims.w}
        height={dims.h}
        className="rounded-lg object-contain bg-brand-950 p-0.5"
        priority
      />
      {showText && (
        <div className="leading-tight">
          <div className={`font-bold text-ink-900 ${dims.text}`}>Priority CPA</div>
          <div className="text-[10px] text-ink-400 font-medium tracking-wide">
            by O.S Tech Ventures
          </div>
        </div>
      )}
    </div>
  );
}
