import { CreditCard, Landmark, Lock, Smartphone, Ticket, Wallet, Zap, type LucideIcon } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { usePaymentMethods } from '@/api/public';
import type { Gateway } from '@/api/types';
import { Reveal, RevealItem, SectionHeading, Skeleton } from '@/components/ui';
import { useLang } from '@/hooks/useLang';

/** Text-only payment badges (no third-party logos): icon per gateway id (PUB-09). */
const ICONS: Record<Gateway, LucideIcon> = {
  zaincash: Smartphone,
  fastpay: Zap,
  asiahawala: Wallet,
  visa: CreditCard,
  qicard: Landmark,
  mock: Ticket,
};

export function PaymentMethods() {
  const { t } = useTranslation();
  const { l } = useLang();
  const { data, isLoading } = usePaymentMethods();
  const methods = (data ?? []).filter((m) => m.enabled && m.id !== 'mock');
  return (
    <section className="section bg-cream">
      <div className="container">
        <SectionHeading
          eyebrow={t('pricingPage.payments.eyebrow')}
          title={t('pricingPage.payments.title')}
          subtitle={t('pricingPage.payments.subtitle')}
        />
        <Reveal
          as="ul"
          staggerChildren={0.08}
          className="mx-auto mt-12 grid max-w-5xl grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5"
        >
          {isLoading &&
            [0, 1, 2, 3, 4].map((i) => (
              <li key={i}>
                <Skeleton className="h-[124px] rounded-2xl" />
              </li>
            ))}
          {methods.map(({ id, name, color }) => {
            const Icon = ICONS[id] ?? CreditCard;
            return (
            <RevealItem
              as="li"
              key={id}
              className="card group flex flex-col items-center gap-3 px-4 py-6 text-center transition-[border-color,box-shadow] duration-300 hover:border-accent/40 hover:shadow-lift [&:last-child]:col-span-2 sm:[&:last-child]:col-span-1"
            >
              <span
                className="flex h-12 w-12 items-center justify-center rounded-2xl text-white shadow-soft transition-transform duration-300 group-hover:scale-110"
                style={{ backgroundColor: color || '#0B1F3A' }}
              >
                <Icon className="h-5 w-5" aria-hidden />
              </span>
              <span className="text-sm font-bold text-primary">{l(name)}</span>
            </RevealItem>
            );
          })}
        </Reveal>
        <p className="mx-auto mt-8 flex max-w-2xl items-start justify-center gap-2 text-center text-sm text-muted">
          <Lock className="mt-0.5 h-4 w-4 shrink-0 text-accent" aria-hidden />
          {t('pricingPage.payments.secure')}
        </p>
      </div>
    </section>
  );
}
