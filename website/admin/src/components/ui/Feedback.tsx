import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { cn } from '@/utils/cn';

export function Skeleton({ className }: { className?: string }) {
  return (
    <div className={cn('relative overflow-hidden rounded-md bg-ink/[0.06]', className)} aria-hidden>
      <div className="absolute inset-0 -translate-x-full animate-shimmer bg-gradient-to-r from-transparent via-white/40 to-transparent dark:via-white/5" />
    </div>
  );
}

export function SkeletonCard({ lines = 3, className }: { lines?: number; className?: string }) {
  return (
    <div className={cn('card space-y-3 p-5', className)} aria-busy="true">
      <Skeleton className="h-4 w-1/3" />
      {Array.from({ length: lines }).map((_, i) => (
        <Skeleton key={i} className={cn('h-3', i % 2 ? 'w-2/3' : 'w-full')} />
      ))}
    </div>
  );
}

/** Line-art illustration for empty states. */
function EmptyArt() {
  return (
    <svg viewBox="0 0 160 120" className="h-24 w-32" aria-hidden>
      <defs>
        <linearGradient id="ea" x1="0" x2="1" y1="0" y2="1">
          <stop offset="0" stopColor="#E6C77A" />
          <stop offset="1" stopColor="#C9A24A" />
        </linearGradient>
      </defs>
      <ellipse cx="80" cy="108" rx="56" ry="6" fill="currentColor" opacity=".06" />
      <rect x="34" y="22" width="92" height="74" rx="10" fill="rgb(var(--c-surface))" stroke="rgb(var(--c-border))" strokeWidth="2" />
      <rect x="46" y="36" width="44" height="6" rx="3" fill="url(#ea)" />
      <rect x="46" y="50" width="68" height="5" rx="2.5" fill="currentColor" opacity=".1" />
      <rect x="46" y="62" width="56" height="5" rx="2.5" fill="currentColor" opacity=".1" />
      <rect x="46" y="74" width="38" height="5" rx="2.5" fill="currentColor" opacity=".1" />
      <circle cx="118" cy="30" r="14" fill="rgb(var(--c-surface))" stroke="url(#ea)" strokeWidth="3" />
      <path d="m128 40 9 9" stroke="url(#ea)" strokeWidth="4" strokeLinecap="round" />
    </svg>
  );
}

interface EmptyStateProps {
  title?: ReactNode;
  hint?: ReactNode;
  action?: ReactNode;
  icon?: ReactNode;
  className?: string;
  compact?: boolean;
}

export function EmptyState({ title, hint, action, icon, className, compact }: EmptyStateProps) {
  const { t } = useTranslation();
  return (
    <div className={cn('flex flex-col items-center justify-center px-6 text-center text-primary', compact ? 'py-8' : 'py-14', className)}>
      {icon ?? <EmptyArt />}
      <h3 className="mt-4 text-sm font-semibold text-ink">{title ?? t('common.emptyTitle')}</h3>
      <p className="mt-1 max-w-sm text-xs text-muted">{hint ?? t('common.emptyHint')}</p>
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

interface ProgressProps {
  value: number;
  max?: number;
  tone?: 'accent' | 'success' | 'warning' | 'danger' | 'info' | 'navy';
  size?: 'xs' | 'sm' | 'md';
  className?: string;
  label?: string;
  color?: string;
}

const BAR: Record<NonNullable<ProgressProps['tone']>, string> = {
  accent: 'bg-gold-grad',
  success: 'bg-success',
  warning: 'bg-warning',
  danger: 'bg-danger',
  info: 'bg-info',
  navy: 'bg-btn',
};

export function ProgressBar({ value, max = 100, tone = 'accent', size = 'sm', className, label, color }: ProgressProps) {
  const pct = Math.max(0, Math.min(100, (value / max) * 100));
  return (
    <div
      role="progressbar"
      aria-valuenow={Math.round(pct)}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-label={label}
      className={cn('w-full overflow-hidden rounded-full bg-ink/[0.07]', size === 'xs' ? 'h-1' : size === 'sm' ? 'h-1.5' : 'h-2.5', className)}
    >
      <div className={cn('h-full rounded-full transition-[width] duration-500', !color && BAR[tone])} style={{ width: `${pct}%`, background: color }} />
    </div>
  );
}

interface TooltipProps {
  content: ReactNode;
  children: ReactNode;
  side?: 'top' | 'bottom' | 'end';
  className?: string;
}

/** Lightweight CSS tooltip (hover + focus-within). */
export function Tooltip({ content, children, side = 'top', className }: TooltipProps) {
  const pos =
    side === 'top'
      ? 'bottom-full left-1/2 mb-2 -translate-x-1/2'
      : side === 'bottom'
        ? 'top-full left-1/2 mt-2 -translate-x-1/2'
        : 'start-full top-1/2 ms-3 -translate-y-1/2';
  return (
    <span className={cn('group/tt relative inline-flex', className)}>
      {children}
      <span
        role="tooltip"
        className={cn(
          'pointer-events-none absolute z-50 whitespace-nowrap rounded-md bg-[#0B1F3A] px-2 py-1 text-[11px] font-medium text-white opacity-0 shadow-lg transition-opacity duration-150 group-hover/tt:opacity-100 group-focus-within/tt:opacity-100',
          pos,
        )}
      >
        {content}
      </span>
    </span>
  );
}
