import type { ReactNode } from 'react';
import { motion } from 'framer-motion';
import { cn, clamp } from '@/lib/utils';

interface ProgressBarProps {
  value: number; // 0-100
  color?: string;
  className?: string;
  size?: 'xs' | 'sm' | 'md';
  label?: string;
  /** Use the gold gradient fill. */
  gold?: boolean;
}

export function ProgressBar({ value, color, className, size = 'sm', label, gold }: ProgressBarProps) {
  const v = clamp(value, 0, 100);
  const h = size === 'xs' ? 'h-1' : size === 'sm' ? 'h-2' : 'h-3';
  return (
    <div
      role="progressbar"
      aria-valuenow={Math.round(v)}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-label={label}
      className={cn('w-full overflow-hidden rounded-full bg-primary/[0.07]', h, className)}
    >
      <motion.div
        className={cn('h-full rounded-full', gold ? 'bg-gold-grad' : !color && 'bg-primary')}
        style={color ? { backgroundColor: color } : undefined}
        initial={{ width: 0 }}
        animate={{ width: `${v}%` }}
        transition={{ duration: 0.9, ease: [0.22, 1, 0.36, 1] }}
      />
    </div>
  );
}

interface RingProps {
  value: number;
  size?: number;
  stroke?: number;
  color?: string;
  trackColor?: string;
  className?: string;
  children?: ReactNode;
  label?: string;
}

/** Circular progress ring (SVG). Children render centered inside. */
export function ProgressRing({ value, size = 72, stroke = 7, color = '#C9A24A', trackColor = 'rgba(11,31,58,0.08)', className, children, label }: RingProps) {
  const v = clamp(value, 0, 100);
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  return (
    <div
      className={cn('relative inline-flex shrink-0 items-center justify-center', className)}
      style={{ width: size, height: size }}
      role="progressbar"
      aria-valuenow={Math.round(v)}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-label={label}
    >
      <svg width={size} height={size} className="-rotate-90" aria-hidden>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={trackColor} strokeWidth={stroke} />
        <motion.circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={color}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={c}
          initial={{ strokeDashoffset: c }}
          animate={{ strokeDashoffset: c - (v / 100) * c }}
          transition={{ duration: 1.1, ease: [0.22, 1, 0.36, 1] }}
        />
      </svg>
      <div className="absolute inset-0 flex items-center justify-center">{children}</div>
    </div>
  );
}
