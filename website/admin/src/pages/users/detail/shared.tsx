import type { ReactNode } from 'react';
import { cn } from '@/utils/cn';
import { MOCK_NOW } from '@/utils/random';

/** Label/value row for definition-list style profile panels. */
export function InfoRow({ label, children, className }: { label: ReactNode; children: ReactNode; className?: string }) {
  return (
    <div className={cn('flex items-start justify-between gap-4 py-2.5 text-sm', className)}>
      <dt className="shrink-0 text-muted">{label}</dt>
      <dd className="min-w-0 text-end font-medium text-ink">{children}</dd>
    </div>
  );
}

/** Whole days from the mock "now" until the given date (negative when past). */
export const daysUntil = (iso: string) => Math.ceil((new Date(iso).getTime() - MOCK_NOW.getTime()) / 86_400_000);
