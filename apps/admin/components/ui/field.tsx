import type { ReactNode } from 'react';
import { Label } from './label';

interface FieldProps {
  label: string;
  htmlFor?: string;
  hint?: string;
  error?: string;
  children: ReactNode;
}

export function Field({ label, htmlFor, hint, error, children }: FieldProps) {
  return (
    <div className="flex flex-col gap-2">
      <Label htmlFor={htmlFor}>{label}</Label>
      {children}
      {hint && !error && <p className="text-xs text-ink/50">{hint}</p>}
      {error && <p className="text-xs text-clay">{error}</p>}
    </div>
  );
}
