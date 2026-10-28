'use client';

import { cn } from '@/lib/utils';
import * as LabelPrimitive from '@radix-ui/react-label';
import { forwardRef } from 'react';

export const Label = forwardRef<
  React.ElementRef<typeof LabelPrimitive.Root>,
  React.ComponentPropsWithoutRef<typeof LabelPrimitive.Root>
>(({ className, ...props }, ref) => (
  <LabelPrimitive.Root
    ref={ref}
    className={cn(
      'text-xs uppercase tracking-[0.18em] text-ink/70 font-medium leading-none',
      className,
    )}
    {...props}
  />
));
Label.displayName = LabelPrimitive.Root.displayName;
