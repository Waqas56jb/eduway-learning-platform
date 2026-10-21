import type { HTMLAttributes } from 'react';
import { cn } from '@/lib/utils';

type Tone = 'navy' | 'gold' | 'success' | 'warning' | 'danger' | 'muted' | 'white';

const tones: Record<Tone, string> = {
  navy: 'bg-primary/5 text-primary ring-primary/10',
  gold: 'bg-accent/15 text-[#8A6A1F] ring-accent/30',
  success: 'bg-success/10 text-success ring-success/20',
  warning: 'bg-warning/10 text-[#B45309] ring-warning/25',
  danger: 'bg-danger/10 text-danger ring-danger/20',
  muted: 'bg-gray-100 text-muted ring-gray-200',
  white: 'bg-white/15 text-white ring-white/25 backdrop-blur',
};

export interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  tone?: Tone;
  /** Custom accent color (e.g. subject color); overrides tone. */
  color?: string;
  dot?: boolean;
}

export function Badge({ tone = 'navy', color, dot, className, style, children, ...rest }: BadgeProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-semibold ring-1 ring-inset',
        !color && tones[tone],
        className,
      )}
      style={color ? { backgroundColor: `${color}14`, color, boxShadow: `inset 0 0 0 1px ${color}33`, ...style } : style}
      {...rest}
    >
      {dot && <span className="h-1.5 w-1.5 rounded-full bg-current" aria-hidden />}
      {children}
    </span>
  );
}
