import { useTranslation } from 'react-i18next';
import { useLang } from '@/hooks/useLang';
import { cn } from '@/lib/utils';

/** Infinite marquee of Iraqi cities. The track is forced LTR so the -50% loop works in both directions. */
export function TrustStrip() {
  const { t } = useTranslation();
  const { dir, isRtl } = useLang();
  const cities = t('landing.trust.cities', { returnObjects: true }) as string[];
  const list = Array.isArray(cities) ? cities : [];

  const renderRow = (hidden: boolean) => (
    <ul className="flex shrink-0 items-center" aria-hidden={hidden || undefined} dir={dir}>
      {list.map((city) => (
        <li key={city} className="flex items-center">
          <span className={cn('whitespace-nowrap px-7 font-display text-2xl font-semibold text-primary/70 md:text-3xl', !isRtl && 'italic')}>
            {city}
          </span>
          <span className="h-1.5 w-1.5 rounded-full bg-accent" aria-hidden />
        </li>
      ))}
    </ul>
  );

  return (
    <section aria-labelledby="trust-title" className="relative border-b border-primary/5 bg-white py-10 md:py-12">
      <p id="trust-title" className="container text-center text-xs font-semibold uppercase tracking-[0.2em] text-muted rtl:text-sm rtl:tracking-normal">
        {t('landing.trust.title')}
      </p>
      <div className="relative mt-7 overflow-hidden" dir="ltr">
        <div className="flex w-max animate-marquee hover:[animation-play-state:paused] motion-reduce:animate-none">
          {renderRow(false)}
          {renderRow(true)}
        </div>
        <div className="pointer-events-none absolute inset-y-0 start-0 w-16 bg-gradient-to-r from-white to-transparent md:w-40" aria-hidden />
        <div className="pointer-events-none absolute inset-y-0 end-0 w-16 bg-gradient-to-l from-white to-transparent md:w-40" aria-hidden />
      </div>
    </section>
  );
}
