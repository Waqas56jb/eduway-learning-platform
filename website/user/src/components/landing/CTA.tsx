import { ArrowRight } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Button, Reveal, SmartImage } from '@/components/ui';
import { IMAGES } from '@/lib/images';

/** Closing call-to-action over a full-bleed photo. */
export function CTA({ showPricingLink = true }: { showPricingLink?: boolean }) {
  const { t } = useTranslation();
  return (
    <section className="relative isolate overflow-hidden bg-primary py-24 text-white md:py-32">
      <SmartImage
        src={IMAGES.graduation}
        alt={t('landing.cta.bgAlt')}
        wrapperClassName="!absolute inset-0 -z-20"
        overlay="bg-gradient-to-b from-primary/90 via-primary/80 to-primary/95"
      />
      <div className="absolute inset-x-0 -top-24 -z-10 mx-auto h-72 w-[36rem] max-w-full rounded-full bg-accent/25 blur-3xl" aria-hidden />

      <Reveal className="container flex flex-col items-center text-center">
        <span className="eyebrow border-accent/50 bg-accent/15 text-accent-light">{t('landing.cta.eyebrow')}</span>
        <h2 className="mt-6 max-w-3xl text-4xl font-bold text-white md:text-6xl">
          {t('landing.cta.titleStart')} <span className="text-gold-grad">{t('landing.cta.titleHighlight')}</span>
        </h2>
        <p className="mx-auto mt-5 max-w-2xl text-lg text-white/75">{t('landing.cta.subtitle')}</p>
        <div className="mt-10 flex w-full flex-col justify-center gap-3 sm:w-auto sm:flex-row">
          <Button
            to="/register"
            variant="gold"
            size="lg"
            rightIcon={<ArrowRight className="h-5 w-5 rtl:-scale-x-100" aria-hidden />}
          >
            {t('landing.cta.button')}
          </Button>
          {showPricingLink && (
            <Button to="/pricing" variant="glass" size="lg">
              {t('landing.cta.secondary')}
            </Button>
          )}
        </div>
      </Reveal>
    </section>
  );
}
