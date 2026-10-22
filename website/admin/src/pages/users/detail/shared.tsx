import type { ReactNode } from 'react';
import { Globe, Smartphone } from 'lucide-react';
import { Badge } from '@/components/ui';
import type { Platform } from '@/api/types';
import { cn } from '@/utils/cn';

/** Label/value row for definition-list style profile panels. */
export function InfoRow({ label, children, className }: { label: ReactNode; children: ReactNode; className?: string }) {
  return (
    <div className={cn('flex items-start justify-between gap-4 py-2.5 text-sm', className)}>
      <dt className="shrink-0 text-muted">{label}</dt>
      <dd className="min-w-0 text-end font-medium text-ink">{children}</dd>
    </div>
  );
}

/** Whole days from now until the given date (negative when past). */
export const daysUntil = (iso: string) => Math.ceil((new Date(iso).getTime() - Date.now()) / 86_400_000);

/** Platforms with active sessions (web / iOS / Android). */
export function PlatformBadges({ platforms }: { platforms: Platform[] }) {
  if (!platforms.length) return <span className="text-muted">—</span>;
  return (
    <span className="inline-flex flex-wrap gap-1">
      {platforms.map((p) => (
        <Badge key={p} tone="slate" icon={p === 'web' ? <Globe className="h-3 w-3" /> : <Smartphone className="h-3 w-3" />}>
          {p === 'ios' ? 'iOS' : p === 'android' ? 'Android' : 'Web'}
        </Badge>
      ))}
    </span>
  );
}

