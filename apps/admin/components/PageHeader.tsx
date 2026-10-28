import type { ReactNode } from 'react';

interface PageHeaderProps {
  kicker?: string;
  title: string;
  action?: ReactNode;
  description?: string;
}

export function PageHeader({ kicker, title, action, description }: PageHeaderProps) {
  return (
    <header className="mb-12 flex flex-wrap items-end justify-between gap-6">
      <div>
        {kicker && <p className="text-xs uppercase tracking-[0.3em] text-ink/50">{kicker}</p>}
        <h1 className="mt-3 font-display text-5xl italic leading-none text-ink">{title}</h1>
        {description && <p className="mt-4 max-w-xl text-sm text-ink/60">{description}</p>}
      </div>
      {action && <div className="flex items-center gap-3">{action}</div>}
    </header>
  );
}
