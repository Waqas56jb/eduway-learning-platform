import { useTranslation } from 'react-i18next';
import { cn } from '@/utils/cn';

export function LogoMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 64 64" className={cn('h-9 w-9 shrink-0', className)} aria-hidden>
      <rect width="64" height="64" rx="14" fill="#15325C" />
      <path d="M32 16 8 27l24 11 18-8.2V42h4V27L32 16Z" fill="#C9A24A" />
      <path d="M18 34v8c0 3.3 6.3 6 14 6s14-2.7 14-6v-8l-14 6.4L18 34Z" fill="#E6C77A" />
    </svg>
  );
}

/** EDUWAY wordmark with gold gradient; `admin` adds the console label. */
export function Logo({ collapsed, admin = true, className }: { collapsed?: boolean; admin?: boolean; className?: string }) {
  const { t } = useTranslation();
  return (
    <span className={cn('flex items-center gap-2.5', className)}>
      <LogoMark />
      {!collapsed && (
        <span className="leading-none">
          <span className="block bg-gold-grad bg-clip-text font-display text-xl font-bold tracking-wide text-transparent" dir="ltr">
            EDUWAY
          </span>
          {admin && <span className="mt-1 block text-[10px] font-semibold uppercase tracking-[0.22em] text-white/50 rtl:tracking-normal">{t('app.tagline')}</span>}
        </span>
      )}
    </span>
  );
}
