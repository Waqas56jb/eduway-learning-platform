import { useTranslation } from 'react-i18next';
import { Seo } from '@/components/ui';
import { AiTutorShowcase } from '@/components/landing/AiTutorShowcase';
import { CTA } from '@/components/landing/CTA';
import { FaqSection } from '@/components/landing/FAQ';
import { Features } from '@/components/landing/Features';
import { Hero } from '@/components/landing/Hero';
import { HowItWorks } from '@/components/landing/HowItWorks';
import { PricingSection } from '@/components/landing/Pricing';
import { Stats } from '@/components/landing/Stats';
import { Subjects } from '@/components/landing/Subjects';
import { Testimonials } from '@/components/landing/Testimonials';
import { TrustStrip } from '@/components/landing/TrustStrip';

export default function Landing() {
  const { t } = useTranslation();
  return (
    <>
      <Seo title={t('landing.seo.title')} description={t('landing.seo.description')} />
      <Hero />
      <TrustStrip />
      <Subjects />
      <Features />
      <HowItWorks />
      <Stats />
      <AiTutorShowcase />
      <Testimonials />
      <PricingSection />
      <FaqSection />
      <CTA />
    </>
  );
}
