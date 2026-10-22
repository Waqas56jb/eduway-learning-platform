import { motion, type Variants } from 'framer-motion';
import { RefreshCcwDot, ShieldCheck, TrendingUp, type LucideIcon } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Seo } from '@/components/ui';
import { CTA } from '@/components/landing/CTA';
import { FaqSection } from '@/components/landing/FAQ';
import { PaymentMethods } from '@/components/landing/PaymentMethods';
import { PricingSection } from '@/components/landing/Pricing';
import { PricingCompare } from '@/components/landing/PricingCompare';

const CHIPS: { key: string; icon: LucideIcon }[] = [
  { key: 'renew', icon: RefreshCcwDot },
  { key: 'upgrade', icon: TrendingUp },
  { key: 'secure', icon: ShieldCheck },
];

const container: Variants = { hidden: {}, show: { transition: { staggerChildren: 0.1, delayChildren: 0.1 } } };
const item: Variants = {
  hidden: { opacity: 0, y: 22 },
  show: { opacity: 1, y: 0, transition: { duration: 0.7, ease: [0.22, 1, 0.36, 1] } },
};

export default function Pricing() {
  const { t } = useTranslation();
  return (
    <>
      <Seo title={t('pricingPage.seo.title')} description={t('pricingPage.seo.description')} />

      <section className="relative isolate overflow-hidden bg-navy-grad pb-20 pt-36 text-white md:pb-28 md:pt-44">
        <div className="absolute -top-32 end-[8%] -z-10 h-[26rem] w-[26rem] rounded-full bg-accent/25 blur-3xl" aria-hidden />
        <div className="absolute -bottom-40 start-[-6rem] -z-10 h-80 w-80 rounded-full bg-accent/10 blur-3xl" aria-hidden />
        <div
          className="absolute inset-0 -z-10 opacity-[0.06] [background-image:radial-gradient(rgba(255,255,255,0.9)_1px,transparent_1px)] [background-size:24px_24px]"
          aria-hidden
        />
        <motion.div variants={container} initial="hidden" animate="show" className="container flex flex-col items-center text-center">
          <motion.span variants={item} className="eyebrow border-accent/50 bg-accent/15 text-accent-light">
            {t('pricingPage.hero.eyebrow')}
          </motion.span>
          <motion.h1
            variants={item}
            className="mt-6 max-w-4xl text-4xl font-bold leading-[1.1] text-white sm:text-5xl md:text-6xl rtl:leading-[1.3]"
          >
            {t('pricingPage.hero.titleStart')} <span className="text-gold-grad">{t('pricingPage.hero.titleHighlight')}</span>{' '}
            {t('pricingPage.hero.titleEnd')}
          </motion.h1>
          <motion.p variants={item} className="mx-auto mt-6 max-w-2xl text-lg text-white/75">
            {t('pricingPage.hero.subtitle')}
          </motion.p>
          <motion.ul variants={item} className="mt-9 flex flex-wrap justify-center gap-3">
            {CHIPS.map(({ key, icon: Icon }) => (
              <li key={key} className="glass inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-medium text-white/90">
                <Icon className="h-4 w-4 text-accent" aria-hidden />
                {t(`pricingPage.hero.chips.${key}`)}
              </li>
            ))}
          </motion.ul>
        </motion.div>
      </section>

      <PricingSection heading={false} className="md:pt-20" />
      <PricingCompare />
      <PaymentMethods />
      <FaqSection placement="pricing" />
      <CTA showPricingLink={false} />
    </>
  );
}
