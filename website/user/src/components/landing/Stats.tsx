import { useTranslation } from 'react-i18next';
import { AnimatedCounter, Reveal, RevealItem } from '@/components/ui';
import { useLang } from '@/hooks/useLang';
import { cn } from '@/lib/utils';

const STATS = [
  { key: 'lessons', value: 850, suffix: '+' },
  { key: 'students', value: 12000, suffix: '+' },
  { key: 'questions', value: 25000, suffix: '+' },
  { key: 'satisfaction', value: 96, suffix: '%' },
];

export function Stats() {
  const { t } = useTranslation();
  const { fmtNumber } = useLang();

  return (
    <section aria-label={t('landing.stats.label')} className="relative isolate overflow-hidden bg-navy-grad py-16 text-white md:py-20">
      <div className="absolute -top-24 start-[15%] -z-10 h-64 w-64 rounded-full bg-accent/20 blur-3xl" aria-hidden />
      <div className="absolute -bottom-24 end-[10%] -z-10 h-72 w-72 rounded-full bg-accent/10 blur-3xl" aria-hidden />
      <div
        className="absolute inset-0 -z-10 opacity-[0.07] [background-image:radial-gradient(rgba(255,255,255,0.9)_1px,transparent_1px)] [background-size:22px_22px]"
        aria-hidden
      />
      <div className="container">
        <Reveal as="ul" staggerChildren={0.12} className="grid grid-cols-2 gap-y-10 lg:grid-cols-4">
          {STATS.map((s, i) => (
            <RevealItem
              as="li"
              key={s.key}
              className={cn('flex flex-col items-center px-4 text-center lg:border-s lg:border-white/10', i === 0 && 'lg:border-s-0')}
            >
              <span className="font-display text-4xl font-bold sm:text-5xl md:text-6xl" dir="ltr">
                <AnimatedCounter to={s.value} format={(n) => fmtNumber(n)} />
                <span className="text-gold-grad">{s.suffix}</span>
              </span>
              <span className="mx-auto mt-3 h-0.5 w-10 rounded-full bg-gold-grad" aria-hidden />
              <span className="mt-3 text-sm font-medium text-white/70 md:text-base">{t(`landing.stats.items.${s.key}`)}</span>
            </RevealItem>
          ))}
        </Reveal>
      </div>
    </section>
  );
}
