import { motion } from 'framer-motion';
import { MonitorPlay, Package, Smartphone, Trophy, type LucideIcon } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { SectionHeading, fadeUp, stagger } from '@/components/ui';
import { useLang } from '@/hooks/useLang';

const STEPS: { key: string; icon: LucideIcon }[] = [
  { key: 'register', icon: Smartphone },
  { key: 'package', icon: Package },
  { key: 'practice', icon: MonitorPlay },
  { key: 'simulate', icon: Trophy },
];

const ease = [0.22, 1, 0.36, 1] as const;

/** Four-step timeline. The connecting line draws from the reading-start side (horizontal on lg, vertical below). */
export function HowItWorks() {
  const { t } = useTranslation();
  const { isRtl, fmtNumber } = useLang();

  return (
    <section className="section bg-cream">
      <div className="container">
        <SectionHeading
          eyebrow={t('landing.how.eyebrow')}
          title={t('landing.how.title')}
          subtitle={t('landing.how.subtitle')}
        />

        <div className="relative mx-auto mt-16 max-w-xl lg:max-w-none">
          {/* Horizontal line (lg+) */}
          <div className="absolute inset-x-[12.5%] top-8 hidden h-0.5 bg-primary/10 lg:block" aria-hidden>
            <motion.div
              className="h-full bg-gold-grad"
              style={{ originX: isRtl ? 1 : 0 }}
              initial={{ scaleX: 0 }}
              whileInView={{ scaleX: 1 }}
              viewport={{ once: true, margin: '-120px' }}
              transition={{ duration: 1.6, ease }}
            />
          </div>
          {/* Vertical line (< lg) */}
          <div className="absolute bottom-8 start-8 top-8 w-0.5 -translate-x-1/2 bg-primary/10 lg:hidden rtl:translate-x-1/2" aria-hidden>
            <motion.div
              className="h-full w-full bg-gold-grad"
              style={{ originY: 0 }}
              initial={{ scaleY: 0 }}
              whileInView={{ scaleY: 1 }}
              viewport={{ once: true, margin: '-120px' }}
              transition={{ duration: 1.6, ease }}
            />
          </div>

          <motion.ol
            className="relative grid gap-10 lg:grid-cols-4 lg:gap-8"
            variants={stagger(0.25)}
            initial="hidden"
            whileInView="show"
            viewport={{ once: true, margin: '-120px' }}
          >
            {STEPS.map(({ key, icon: Icon }, i) => (
              <motion.li key={key} variants={fadeUp} className="flex gap-6 lg:flex-col lg:items-center lg:text-center">
                <div className="relative shrink-0">
                  <span className="flex h-16 w-16 items-center justify-center rounded-full border-4 border-cream bg-gold-grad font-display text-2xl font-bold text-primary shadow-glow num">
                    {fmtNumber(i + 1)}
                  </span>
                </div>
                <div className="pt-1 lg:pt-0">
                  <div className="flex items-center gap-2 lg:justify-center">
                    <Icon className="h-4 w-4 text-accent" aria-hidden />
                    <span className="text-xs font-semibold uppercase tracking-wider text-accent rtl:tracking-normal">
                      {t('landing.how.step', { n: fmtNumber(i + 1) })}
                    </span>
                  </div>
                  <h3 className="mt-2 text-xl font-bold text-primary">{t(`landing.how.steps.${key}.title`)}</h3>
                  <p className="mt-2 text-[15px] text-muted lg:mx-auto lg:max-w-[16rem]">
                    {t(`landing.how.steps.${key}.desc`)}
                  </p>
                </div>
              </motion.li>
            ))}
          </motion.ol>
        </div>
      </div>
    </section>
  );
}
