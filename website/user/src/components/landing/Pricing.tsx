import { AnimatePresence, motion } from 'framer-motion';
import { ArrowRight, Check, Crown } from 'lucide-react';
import { useEffect, useId, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useLocation, useSearchParams } from 'react-router-dom';
import { useSubjectLookup } from '@/api/catalog';
import { usePackages } from '@/api/packages';
import { useRefreshEntitlements } from '@/api/subscriptions';
import type { PaymentDetailDto } from '@/api/types';
import { PaymentModal } from '@/components/student/account/PaymentModal';
import { Button, ErrorState, SectionHeading, Skeleton, SubjectIcon, fadeUp, stagger, useToast } from '@/components/ui';
import { useAuth } from '@/hooks/useAuth';
import { useLang } from '@/hooks/useLang';
import { cn } from '@/lib/utils';
import type { Package } from '@/types';

export type Billing = 'monthly' | 'yearly';

/** Percentage saved by paying yearly instead of 12 × monthly (server-computed; 0 when yearly isn't offered). */
export const yearlySavingPct = (p: Package) =>
  p.yearlySavingPct ?? (p.priceYearly ? Math.round((1 - p.priceYearly / (p.priceMonthly * 12)) * 100) : 0);

/** Price for a billing cycle; packages without a yearly plan fall back to the base plan. */
export const priceFor = (p: Package, billing: Billing) => (billing === 'yearly' && p.priceYearly ? p.priceYearly : p.priceMonthly);

interface PricingSectionProps {
  /** Show the eyebrow/title/subtitle block (hide it when the page already has a hero). */
  heading?: boolean;
  className?: string;
}

/** Reusable package grid with an animated monthly / yearly toggle. Used on the landing and pricing pages. */
export function PricingSection({ heading = true, className }: PricingSectionProps) {
  const { t } = useTranslation();
  const { data: packages = [], isLoading, isError, refetch } = usePackages();
  const [billing, setBilling] = useState<Billing>('monthly');
  const { user, isAuthenticated } = useAuth();
  const { l } = useLang();
  const toast = useToast();
  const refreshEntitlements = useRefreshEntitlements();
  const [params, setParams] = useSearchParams();
  // Buy right here: the same checkout (PaymentModal) as the student subscription page.
  const [checkout, setCheckout] = useState<{ pkg: Package; billing: Billing } | null>(null);
  const [lastPkg, setLastPkg] = useState<Package | null>(null);
  const choose = (pkg: Package, b: Billing) => {
    setLastPkg(pkg);
    setCheckout({ pkg, billing: b });
  };

  // Back from login / register (`?package=&cycle=`): open the checkout for the plan the visitor picked.
  useEffect(() => {
    const pkgId = params.get('package');
    if (!pkgId || !isAuthenticated || !packages.length) return;
    const pkg = packages.find((p) => p.id === pkgId);
    const b: Billing = params.get('cycle') === 'yearly' ? 'yearly' : 'monthly';
    params.delete('package');
    params.delete('cycle');
    setParams(params, { replace: true });
    if (pkg) {
      setBilling(b);
      choose(pkg, b);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAuthenticated, packages.length]);

  const onPaid = (r: PaymentDetailDto) => {
    void refreshEntitlements();
    toast.success(
      t('account.subscription.pay.toast'),
      t('account.subscription.pay.toastBody', { plan: l(r.package.name), period: t(`account.subscription.periods.${r.cycle}`) }),
    );
  };
  const hasYearly = packages.some((p) => !!p.priceYearly);
  const maxSaving = packages.length ? Math.max(0, ...packages.map(yearlySavingPct)) : 0;

  return (
    <section id="pricing" className={cn('section relative scroll-mt-20 overflow-hidden bg-cream', className)}>
      <div className="absolute inset-x-0 top-1/3 mx-auto h-96 w-[50rem] max-w-full rounded-full bg-accent/10 blur-3xl" aria-hidden />
      <div className="container relative">
        {heading ? (
          <SectionHeading
            eyebrow={t('landing.pricing.eyebrow')}
            title={t('landing.pricing.title')}
            subtitle={t('landing.pricing.subtitle')}
          />
        ) : (
          <h2 className="sr-only">{t('landing.pricing.srTitle')}</h2>
        )}

        <div className="mt-10 flex flex-col items-center gap-3">
          {(hasYearly || isLoading) && <BillingToggle value={billing} onChange={setBilling} />}
          {maxSaving > 0 && (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-success/10 px-3 py-1 text-xs font-bold text-success">
              {t('landing.pricing.saveUpTo', { pct: maxSaving })}
            </span>
          )}
        </div>

        {isError ? (
          <ErrorState className="mx-auto mt-14 max-w-xl" onRetry={() => void refetch()} />
        ) : !isLoading ? (
          <motion.ul
            className="mx-auto mt-14 grid max-w-md gap-6 lg:max-w-none lg:grid-cols-3 lg:items-center lg:gap-7"
            variants={stagger(0.12)}
            initial="hidden"
            whileInView="show"
            viewport={{ once: true, margin: '-80px' }}
          >
            {packages.map((p) => (
              <motion.li key={p.id} variants={fadeUp} className={cn(p.popular && 'lg:-my-6')}>
                <PackageCard pkg={p} billing={billing} onChoose={choose} />
              </motion.li>
            ))}
          </motion.ul>
        ) : (
          <div className="mx-auto mt-14 grid max-w-md gap-6 lg:max-w-none lg:grid-cols-3 lg:items-center lg:gap-7" aria-hidden>
            {[false, true, false].map((popular, i) => (
              <Skeleton key={i} className={cn('rounded-3xl', popular ? 'h-[600px]' : 'h-[540px]')} />
            ))}
          </div>
        )}

        <p className="mx-auto mt-12 text-center text-sm text-muted">{t('landing.pricing.note')}</p>
      </div>
      {isAuthenticated && user && lastPkg && (
        <PaymentModal
          open={!!checkout}
          onClose={() => setCheckout(null)}
          pkg={checkout?.pkg ?? lastPkg}
          initialPeriod={checkout?.billing ?? billing}
          defaultPhone={user.mobile}
          onPaid={onPaid}
        />
      )}
    </section>
  );
}

function BillingToggle({ value, onChange }: { value: Billing; onChange: (b: Billing) => void }) {
  const { t } = useTranslation();
  const pillId = useId();
  const options: Billing[] = ['monthly', 'yearly'];
  return (
    <div
      role="radiogroup"
      aria-label={t('landing.pricing.billing')}
      className="inline-flex rounded-full border border-primary/10 bg-white p-1.5 shadow-soft"
    >
      {options.map((o) => {
        const active = value === o;
        return (
          <button
            key={o}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => onChange(o)}
            className={cn(
              'relative rounded-full px-6 py-2.5 text-sm font-semibold transition-colors duration-200',
              active ? 'text-white' : 'text-primary/70 hover:text-primary',
            )}
          >
            {active && (
              <motion.span
                layoutId={pillId}
                className="absolute inset-0 rounded-full bg-primary shadow-[0_8px_20px_-8px_rgba(11,31,58,0.6)]"
                transition={{ type: 'spring', stiffness: 380, damping: 32 }}
              />
            )}
            <span className="relative">{t(`common.${o}`)}</span>
          </button>
        );
      })}
    </div>
  );
}

function PackageCard({ pkg, billing, onChoose }: { pkg: Package; billing: Billing; onChoose: (pkg: Package, billing: Billing) => void }) {
  const { t } = useTranslation();
  const { l, fmtNumber } = useLang();
  const { isAuthenticated } = useAuth();
  const location = useLocation();
  const subjectOf = useSubjectLookup();
  const popular = !!pkg.popular;
  const yearly = billing === 'yearly' && !!pkg.priceYearly;
  const price = priceFor(pkg, billing);
  const saving = yearlySavingPct(pkg);
  const cycle: Billing = yearly ? 'yearly' : 'monthly';
  // Signed in → the checkout opens right here. Signed out → register (or log in from there) first; the auth
  // flow then returns to this page (`state.from`), which reopens the checkout for this plan + billing period.
  const returnTo = `${location.pathname}?package=${pkg.id}&cycle=${cycle}`;

  return (
    <article
      className={cn(
        'relative flex h-full flex-col overflow-hidden rounded-3xl p-7 transition-all duration-300 md:p-8',
        popular
          ? 'bg-navy-grad text-white shadow-[0_40px_80px_-30px_rgba(11,31,58,0.7)] ring-2 ring-accent/70 lg:py-12'
          : 'card hover:-translate-y-1.5 hover:shadow-lift',
      )}
    >
      {popular && (
        <>
          <div className="absolute -end-20 -top-20 h-56 w-56 rounded-full bg-accent/25 blur-3xl" aria-hidden />
          <span className="absolute -end-12 top-7 w-44 rotate-45 bg-gold-grad py-1.5 text-center text-xs font-bold uppercase tracking-wider text-primary shadow-lg rtl:-rotate-45 rtl:tracking-normal">
            {t('landing.pricing.popular')}
          </span>
        </>
      )}

      <div className="relative">
        <div className={cn('flex items-center gap-2', popular && 'pe-14')}>
          {popular && <Crown className="h-5 w-5 text-accent" aria-hidden />}
          <h3 className={cn('text-2xl font-bold', popular ? 'text-white' : 'text-primary')}>{l(pkg.name)}</h3>
        </div>
        <p className={cn('mt-2 pe-10 text-sm', popular ? 'text-white/70' : 'text-muted')}>{l(pkg.tagline)}</p>

        <div className="mt-7 min-h-[92px]">
          <div className="flex flex-wrap items-baseline gap-x-2">
            <AnimatePresence mode="wait" initial={false}>
              <motion.span
                key={price}
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -12 }}
                transition={{ duration: 0.25 }}
                className={cn('num font-display text-5xl font-bold', popular ? 'text-white' : 'text-primary')}
              >
                {fmtNumber(price)}
              </motion.span>
            </AnimatePresence>
            <span className={cn('text-sm font-semibold', popular ? 'text-accent-light' : 'text-accent')}>
              {t('common.currency')}
            </span>
            <span className={cn('text-sm', popular ? 'text-white/60' : 'text-muted')}>
              {t(yearly ? 'common.perYear' : 'common.perMonth')}
            </span>
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
            {yearly ? (
              <>
                <span className={popular ? 'text-white/70' : 'text-muted'}>
                  {t('landing.pricing.perMonthYearly', {
                    amount: fmtNumber(Math.round((pkg.priceYearly ?? 0) / 12 / 100) * 100),
                    currency: t('common.currency'),
                  })}
                </span>
                {saving > 0 && (
                  <span className="rounded-full bg-success/15 px-2 py-0.5 font-bold text-success">
                    {t('landing.pricing.save', { pct: saving })}
                  </span>
                )}
              </>
            ) : (
              <span className={popular ? 'text-white/70' : 'text-muted'}>{t('landing.pricing.billedMonthly')}</span>
            )}
          </div>
        </div>

        <div className={cn('mt-6 border-t pt-6', popular ? 'border-white/10' : 'border-primary/5')}>
          <p className={cn('text-xs font-semibold uppercase tracking-wider rtl:tracking-normal', popular ? 'text-white/60' : 'text-muted')}>
            {t('landing.pricing.includes')}
          </p>
          <ul className="mt-3 flex flex-wrap gap-2">
            {pkg.subjects.map((sid) => {
              const s = subjectOf(sid);
              if (!s) return null;
              return (
                <li
                  key={sid}
                  className={cn(
                    'inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold',
                    popular ? 'bg-white/10 text-white' : 'bg-primary/[0.04] text-primary',
                  )}
                >
                  <SubjectIcon id={s.slug} icon={s.icon} className="h-3.5 w-3.5" style={{ color: s.color }} />
                  {l(s.name)}
                </li>
              );
            })}
          </ul>
        </div>
      </div>

      <ul className="relative mt-6 flex-1 space-y-3">
        {pkg.features.map((f, i) => (
          <li key={`${i}-${f.en}`} className="flex items-start gap-3 text-sm">
            <span
              className={cn(
                'mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full',
                popular ? 'bg-accent text-primary' : 'bg-accent/15 text-accent',
              )}
            >
              <Check className="h-3 w-3" strokeWidth={3} aria-hidden />
            </span>
            <span className={popular ? 'text-white/85' : 'text-ink/80'}>{l(f)}</span>
          </li>
        ))}
      </ul>

      <Button
        to={isAuthenticated ? undefined : '/register'}
        linkState={isAuthenticated ? undefined : { from: returnTo }}
        onClick={isAuthenticated ? () => onChoose(pkg, cycle) : undefined}
        variant={popular ? 'gold' : 'outline'}
        size="lg"
        fullWidth
        className={cn('relative mt-8', !popular && 'border-primary/15 text-primary hover:border-accent hover:bg-accent/10')}
        rightIcon={<ArrowRight className="h-4 w-4 rtl:-scale-x-100" aria-hidden />}
      >
        {t(popular ? 'landing.pricing.ctaPopular' : 'landing.pricing.cta')}
      </Button>
    </article>
  );
}
