import { useId } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/utils';

export function LogoMark({ className }: { className?: string }) {
  // Unique gradient id per instance: a shared id breaks the fill when the first instance sits in a display:none subtree.
  const gid = `ew-gold-${useId().replace(/:/g, '')}`;
  return (
    <svg viewBox="0 0 40 40" className={cn('h-9 w-9', className)} aria-hidden>
      <defs>
        <linearGradient id={gid} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#E6C77A" />
          <stop offset="1" stopColor="#B58E36" />
        </linearGradient>
      </defs>
      <rect width="40" height="40" rx="11" fill="#0B1F3A" />
      <rect x="0.5" y="0.5" width="39" height="39" rx="10.5" fill="none" stroke={`url(#${gid})`} strokeOpacity=".45" />
      <path d="M20 9 6 15.5l14 6.5 10.5-4.9V25h2.5v-9.5L20 9Z" fill={`url(#${gid})`} />
      <path d="M11.5 20.5v5c0 2.2 3.8 4 8.5 4s8.5-1.8 8.5-4v-5L20 24.4l-8.5-3.9Z" fill="#E6C77A" opacity=".85" />
    </svg>
  );
}

/** EDUWAY wordmark with graduation-cap mark. `light` for use on navy backgrounds. */
export function Logo({ light, className, to = '/' }: { light?: boolean; className?: string; to?: string }) {
  const { t } = useTranslation();
  return (
    <Link to={to} aria-label={t('brand.logoAlt')} className={cn('group inline-flex items-center gap-2.5', className)} dir="ltr">
      <LogoMark className="transition-transform duration-300 group-hover:-rotate-6" />
      <span
        className={cn(
          'text-[1.4rem] font-extrabold tracking-[0.08em]',
          light ? 'text-white' : 'text-primary',
        )}
        style={{ fontFamily: "'Playfair Display', Georgia, serif" }}
      >
        EDU<span className="text-gold-grad">WAY</span>
      </span>
    </Link>
  );
}
