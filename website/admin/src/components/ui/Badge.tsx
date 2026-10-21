import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { cn } from '@/utils/cn';

export type Tone = 'neutral' | 'success' | 'warning' | 'danger' | 'info' | 'accent' | 'purple' | 'slate' | 'navy';

const tones: Record<Tone, string> = {
  neutral: 'bg-ink/[0.06] text-ink/70 ring-ink/10',
  success: 'bg-success/10 text-success ring-success/20',
  warning: 'bg-warning/10 text-[#B45309] ring-warning/25 dark:text-warning',
  danger: 'bg-danger/10 text-danger ring-danger/20',
  info: 'bg-info/10 text-info ring-info/20',
  accent: 'bg-accent/15 text-[#8A6A1F] ring-accent/30 dark:text-accent-light',
  purple: 'bg-[#7C3AED]/10 text-[#7C3AED] ring-[#7C3AED]/20 dark:text-[#A78BFA]',
  slate: 'bg-[#475569]/10 text-[#475569] ring-[#475569]/20 dark:text-[#94A3B8]',
  navy: 'bg-primary/10 text-primary ring-primary/15',
};

const dots: Record<Tone, string> = {
  neutral: 'bg-ink/40',
  success: 'bg-success',
  warning: 'bg-warning',
  danger: 'bg-danger',
  info: 'bg-info',
  accent: 'bg-accent',
  purple: 'bg-[#7C3AED]',
  slate: 'bg-[#64748B]',
  navy: 'bg-primary',
};

interface BadgeProps {
  tone?: Tone;
  dot?: boolean;
  icon?: ReactNode;
  className?: string;
  children: ReactNode;
}

export function Badge({ tone = 'neutral', dot, icon, className, children }: BadgeProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-semibold ring-1 ring-inset',
        tones[tone],
        className,
      )}
    >
      {dot && <span className={cn('h-1.5 w-1.5 rounded-full', dots[tone])} aria-hidden />}
      {icon}
      {children}
    </span>
  );
}

/** Status → tone mapping shared across modules. */
export const STATUS_TONE: Record<string, Tone> = {
  draft: 'neutral',
  in_review: 'warning',
  approved: 'info',
  scheduled: 'purple',
  published: 'success',
  archived: 'slate',
  active: 'success',
  inactive: 'slate',
  hidden: 'slate',
  expired: 'danger',
  trial: 'info',
  none: 'neutral',
  cancelled: 'slate',
  pending: 'warning',
  paid: 'success',
  failed: 'danger',
  initiated: 'neutral',
  refunded: 'purple',
  partially_refunded: 'purple',
  rejected: 'danger',
  locked: 'danger',
  suspended: 'danger',
  invited: 'info',
  deactivated: 'slate',
  superseded: 'slate',
  open: 'warning',
  resolved: 'success',
  blocked: 'danger',
  reviewed: 'info',
  dismissed: 'slate',
  sent: 'info',
  delivered: 'success',
  queued: 'neutral',
  sending: 'warning',
  passed: 'success',
  in_progress: 'info',
  abandoned: 'slate',
  ready: 'success',
  processing: 'warning',
  uploading: 'info',
  synced: 'success',
  error: 'danger',
  retired: 'slate',
  enabled: 'success',
  disabled: 'slate',
};

/** Translated, colour-coded status pill. Labels come from `status.<key>` in the common dictionary. */
export function StatusBadge({ status, className, label }: { status: string; className?: string; label?: string }) {
  const { t } = useTranslation();
  return (
    <Badge tone={STATUS_TONE[status] ?? 'neutral'} dot className={className}>
      {label ?? t(`status.${status}`, { defaultValue: status.replace(/_/g, ' ') })}
    </Badge>
  );
}
