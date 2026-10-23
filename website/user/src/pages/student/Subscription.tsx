import { motion } from 'framer-motion';
import { ArrowUpRight, Bot, CalendarCheck2, CalendarClock, Check, Crown, Download, RefreshCw, Sparkles } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useSearchParams } from 'react-router-dom';
import { useSubjectLookup } from '@/api/catalog';
import { errorMessage } from '@/api/client';
import { usePackages } from '@/api/packages';
import { paymentsApi, useDownloadReceipt, useMyPayments, waitForPayment } from '@/api/payments';
import { useMySubscription, useRefreshEntitlements } from '@/api/subscriptions';
import type { PaymentDetailDto, StudentPaymentDto } from '@/api/types';
import {
  Badge,
  Button,
  Card,
  CardHeader,
  LogoMark,
  PageHeader,
  ProgressBar,
  Reveal,
  RevealItem,
  Seo,
  Skeleton,
  SkeletonList,
  SubjectIcon,
  Tabs,
  useToast,
  ErrorState,
} from '@/components/ui';
import { MethodLogo, PaymentModal } from '@/components/student/account/PaymentModal';
import type { BillingPeriod } from '@/components/student/account/billing';
import { useAuth } from '@/hooks/useAuth';
import { useLang } from '@/hooks/useLang';
import { cn } from '@/lib/utils';
import type { Package } from '@/types';

const DAY = 86_400_000;
const STATUS_TONE: Record<StudentPaymentDto['status'], 'success' | 'warning' | 'danger' | 'muted'> = {
  paid: 'success',
  pending: 'warning',
  initiated: 'warning',
  failed: 'danger',
  cancelled: 'muted',
  refunded: 'muted',
  partially_refunded: 'warning',
};

export default function Subscription() {
  const { t } = useTranslation();
  const { l, fmtNumber, fmtDate } = useLang();
  const { user } = useAuth();
  const toast = useToast();
  const compareRef = useRef<HTMLElement>(null);
  const [params, setParams] = useSearchParams();
  const subjectOf = useSubjectLookup();
  // PAY-03 current subscription, PAY-01 packages (+isCurrent), PAY-09 billing history.
  const subQ = useMySubscription();
  const packagesQ = usePackages();
  const paymentsQ = useMyPayments();
  const refreshEntitlements = useRefreshEntitlements();
  const receipt = useDownloadReceipt();
  const packages = packagesQ.data ?? [];
  const history = (paymentsQ.data?.items ?? []).filter((p) => p.status !== 'initiated');
  const ready = !subQ.isLoading && !packagesQ.isLoading;

  const [period, setPeriod] = useState<BillingPeriod>('monthly');
  const [checkout, setCheckout] = useState<{ pkg: Package; period: BillingPeriod; resumePaymentId?: string } | null>(null);
  const [lastPkg, setLastPkg] = useState<Package | null>(null);

  const openCheckout = (pkg: Package, p: BillingPeriod = period, resumePaymentId?: string) => {
    setLastPkg(pkg);
    setCheckout({ pkg, period: p, resumePaymentId });
  };

  const onPaid = (r: PaymentDetailDto) => {
    void refreshEntitlements();
    void paymentsQ.refetch();
    toast.success(
      t('account.subscription.pay.toast'),
      t('account.subscription.pay.toastBody', { plan: l(r.package.name), period: t(`account.subscription.periods.${r.cycle}`) }),
    );
  };

  // Deep links (once the packages are known):
  //  - ?package=<id>&cycle= (pricing CTA, paywalls) or ?subject=<slug> (locked content → cheapest plan that
  //    unlocks it) opens the checkout with that plan preselected;
  //  - ?payment=<id> is the return from a hosted gateway page (the API adds paymentId/status) → the checkout
  //    reopens on that payment, polls PAY-08 until it settles and shows the receipt.
  useEffect(() => {
    if (!packages.length) return;
    const pkgId = params.get('package');
    const subject = params.get('subject');
    const paymentId = params.get('payment') ?? params.get('paymentId');
    const cycle: BillingPeriod = params.get('cycle') === 'yearly' ? 'yearly' : 'monthly';
    if (!pkgId && !subject && !paymentId) return;
    for (const k of ['package', 'cycle', 'subject', 'payment', 'paymentId', 'status']) params.delete(k);
    setParams(params, { replace: true });

    if (paymentId) {
      const controller = new AbortController();
      paymentsApi
        .get(paymentId)
        .then((p) => {
          const pkg = packages.find((x) => x.id === p.package.id);
          if (pkg) return openCheckout(pkg, p.cycle, paymentId);
          // Package no longer listed: settle quietly and report the outcome.
          return waitForPayment(paymentId, controller.signal).then((r) => {
            if (r.status === 'paid') onPaid(r);
            else toast.error(t('account.subscription.pay.failed'));
            void paymentsQ.refetch();
          });
        })
        .catch((e) => (e as Error).name !== 'AbortError' && toast.error(errorMessage(e)));
      return () => controller.abort();
    }
    const pkg = pkgId
      ? packages.find((p) => p.id === pkgId)
      : [...packages].filter((p) => !!subject && (p.subjects as string[]).includes(subject)).sort((a, b) => a.priceMonthly - b.priceMonthly)[0];
    if (pkg) openCheckout(pkg, cycle);
    else if (subject) compareRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [packages.length]);

  if (!user) return null;
  const sub = subQ.data ?? null;
  const activeSub = sub && (sub.status === 'active' || sub.status === 'trial') ? sub : null;
  const current: Package | undefined = sub?.package ?? packages.find((p) => p.isCurrent) ?? undefined;
  const startIso = sub?.startedAt ?? user.subscriptionStart;
  const endIso = sub?.endsAt ?? user.subscriptionEnd;
  const daysRemaining = sub?.daysRemaining ?? user.daysRemaining;
  const totalDays = Math.max(1, sub?.totalDays ?? (startIso && endIso ? Math.round((new Date(endIso).getTime() - new Date(startIso).getTime()) / DAY) : 30));
  const remainingPct = sub?.remainingPct ?? (daysRemaining / totalDays) * 100;
  const money = (n: number) => `${fmtNumber(n)} ${t('common.currency')}`;

  const downloadReceipt = (r: StudentPaymentDto) =>
    receipt.mutate(
      { id: r.id, receiptNumber: r.receiptNumber },
      { onSuccess: () => toast.success(t('account.subscription.downloadDone'), t('account.subscription.downloadBody', { receipt: r.receiptNumber ?? r.ref })) },
    );

  const methodName = (r: StudentPaymentDto) => t(`account.subscription.methods.${r.gateway}`, { defaultValue: r.gateway });

  return (
    <>
      <Seo title={t('account.subscription.seoTitle')} description={t('account.subscription.seoDescription')} />
      <PageHeader title={t('account.subscription.title')} subtitle={t('account.subscription.subtitle')} />

      {subQ.isError || packagesQ.isError ? (
        <ErrorState
          onRetry={() => {
            void subQ.refetch();
            void packagesQ.refetch();
          }}
        />
      ) : !ready ? (
        <div className="space-y-6" aria-hidden>
          <div className="grid gap-6 lg:grid-cols-2">
            <Skeleton className="aspect-[1.7/1] rounded-3xl" />
            <Skeleton className="h-full min-h-[16rem] rounded-2xl" />
          </div>
          <div className="grid gap-5 md:grid-cols-3">
            {[0, 1, 2].map((i) => (
              <Skeleton key={i} className="h-96 rounded-2xl" />
            ))}
          </div>
          <SkeletonList rows={3} />
        </div>
      ) : (
        <div className="space-y-10">
          {/* Current plan */}
          <section aria-labelledby="current-plan" className="grid gap-6 lg:grid-cols-2">
            <motion.div
              initial={{ opacity: 0, rotateX: 12, y: 20 }}
              animate={{ opacity: 1, rotateX: 0, y: 0 }}
              transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
              whileHover={{ y: -4 }}
              className="relative flex min-h-[15rem] flex-col justify-between overflow-hidden rounded-3xl bg-navy-grad p-6 text-white shadow-lift sm:aspect-[1.7/1] sm:min-h-0 sm:p-8"
              style={{ transformPerspective: 1000 }}
            >
              {/* Gold foil sheen */}
              <div
                className="pointer-events-none absolute inset-0 opacity-70"
                style={{
                  background:
                    'radial-gradient(120% 80% at 100% 0%, rgba(230,199,122,0.35) 0%, rgba(201,162,74,0.12) 35%, transparent 60%), linear-gradient(115deg, transparent 40%, rgba(255,255,255,0.07) 50%, transparent 60%)',
                }}
                aria-hidden
              />
              <div className="pointer-events-none absolute -bottom-20 -start-10 h-56 w-56 rounded-full border border-accent/20" aria-hidden />
              <div className="pointer-events-none absolute -bottom-28 start-10 h-56 w-56 rounded-full border border-accent/10" aria-hidden />

              <div className="relative flex items-start justify-between gap-4">
                <div>
                  <p id="current-plan" className="text-xs font-semibold uppercase tracking-[0.2em] text-accent-light/80">
                    {t('account.subscription.currentPlan')}
                  </p>
                  <h2 className="mt-2 text-2xl font-bold text-white sm:text-3xl">{current ? l(current.name) : t('student.plan.none')}</h2>
                  <p className="mt-1 text-sm text-white/60">{current ? l(current.tagline) : t('account.subscription.noPlanBody')}</p>
                </div>
                {activeSub ? (
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-success/20 px-2.5 py-1 text-xs font-semibold text-emerald-300 ring-1 ring-inset ring-emerald-300/30">
                    <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-300" aria-hidden />
                    {t('student.plan.active')}
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-danger/20 px-2.5 py-1 text-xs font-semibold text-rose-300 ring-1 ring-inset ring-rose-300/30">
                    {t(sub?.status === 'expired' ? 'student.plan.expired' : 'student.plan.none')}
                  </span>
                )}
              </div>

              <div className="relative mt-6 flex items-center gap-3">
                {/* EMV-style chip */}
                <span className="relative h-9 w-12 overflow-hidden rounded-md bg-gold-grad shadow-inner" aria-hidden>
                  <span className="absolute inset-x-0 top-1/2 h-px bg-primary/25" />
                  <span className="absolute inset-y-0 start-1/2 w-px bg-primary/25" />
                  <span className="absolute inset-2 rounded-sm border border-primary/20" />
                </span>
                <span className="font-mono text-sm tracking-[0.25em] text-white/70" dir="ltr">
                  •••• •••• {user.id.replace(/\D/g, '').slice(-4).padStart(4, '0')}
                </span>
              </div>

              <div className="relative mt-6 flex items-end justify-between gap-4">
                <div className="min-w-0">
                  <p className="text-[10px] uppercase tracking-[0.2em] text-white/50">{t('account.subscription.memberCard')}</p>
                  <p className="truncate font-semibold">{l(user.name)}</p>
                </div>
                <div className="text-end">
                  <p className="text-[10px] uppercase tracking-[0.2em] text-white/50">{t('account.subscription.ends')}</p>
                  <p className="font-semibold num">{endIso ? fmtDate(endIso) : '—'}</p>
                </div>
                <span className="hidden sm:block">
                  <LogoMark className="h-9 w-9" />
                </span>
              </div>
            </motion.div>

            <Card className="flex flex-col p-6">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="flex items-center gap-1.5 text-xs text-muted">
                    <CalendarCheck2 className="h-3.5 w-3.5" aria-hidden />
                    {t('account.subscription.starts')}
                  </p>
                  <p className="mt-1 font-semibold text-primary num">{startIso ? fmtDate(startIso) : '—'}</p>
                </div>
                <div>
                  <p className="flex items-center gap-1.5 text-xs text-muted">
                    <CalendarClock className="h-3.5 w-3.5" aria-hidden />
                    {t('account.subscription.ends')}
                  </p>
                  <p className="mt-1 font-semibold text-primary num">{endIso ? fmtDate(endIso) : '—'}</p>
                </div>
              </div>

              <div className="mt-5 rounded-2xl bg-cream p-4">
                <div className="flex items-baseline justify-between gap-2">
                  <p className="text-sm font-bold text-primary">
                    {t('account.subscription.daysRemaining', { count: daysRemaining })}
                  </p>
                  <span className="text-xs text-muted num">
                    {fmtNumber(daysRemaining)} / {fmtNumber(totalDays)}
                  </span>
                </div>
                <ProgressBar
                  value={remainingPct}
                  gold
                  size="md"
                  className="mt-3"
                  label={t('account.subscription.daysRemaining', { count: daysRemaining })}
                />
              </div>

              <div className="mt-5">
                <p className="text-xs font-semibold text-muted">{t('account.subscription.subjectsIncluded')}</p>
                <div className="mt-2 flex flex-wrap gap-2">
                  {(sub?.subjects ?? (current?.subjects ?? []).map((sid) => subjectOf(sid)).filter((x): x is NonNullable<typeof x> => !!x)).map((s) => (
                    <Badge key={s.slug} color={s.color}>
                      <SubjectIcon id={s.slug} className="h-3.5 w-3.5" />
                      {l(s.name)}
                    </Badge>
                  ))}
                </div>
              </div>

              <div className="mt-5 flex items-center gap-3 rounded-2xl border border-accent/20 bg-accent/5 p-3.5">
                <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-gold-grad text-primary">
                  <Bot className="h-4 w-4" aria-hidden />
                </span>
                <div>
                  <p className="text-xs text-muted">{t('account.subscription.aiQuota')}</p>
                  <p className="text-sm font-semibold text-primary">
                    {t('account.subscription.aiQuotaValue', { n: fmtNumber(sub?.aiAllowance.quota ?? current?.aiQuota ?? 0) })}
                  </p>
                </div>
              </div>

              <div className="mt-6 flex flex-col gap-3 sm:mt-auto sm:flex-row sm:flex-wrap sm:pt-6">
                <Button
                  variant="gold"
                  className="flex-1 sm:min-w-[10rem]"
                  leftIcon={<RefreshCw className="h-4 w-4" aria-hidden />}
                  disabled={!current}
                  onClick={() => current && openCheckout(current, sub?.cycle ?? period)}
                >
                  {t('account.subscription.renew')}
                </Button>
                <Button
                  variant="outline"
                  className="flex-1 sm:min-w-[11rem]"
                  rightIcon={<ArrowUpRight className="h-4 w-4 rtl:-scale-x-100" aria-hidden />}
                  onClick={() => compareRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })}
                >
                  {t('account.subscription.change')}
                </Button>
              </div>
            </Card>
          </section>

          {/* Compare */}
          <section ref={compareRef} aria-labelledby="compare-title" className="scroll-mt-24">
            <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <h2 id="compare-title" className="text-2xl font-bold text-primary">
                  {t('account.subscription.compareTitle')}
                </h2>
                <p className="mt-1 text-sm text-muted">{t('account.subscription.compareSub')}</p>
              </div>
              <Tabs<BillingPeriod>
                items={
                  packages.some((p) => p.priceYearly)
                    ? [
                        { id: 'monthly', label: t('common.monthly') },
                        { id: 'yearly', label: t('common.yearly') },
                      ]
                    : [{ id: 'monthly', label: t('common.monthly') }]
                }
                value={period}
                onChange={setPeriod}
                className="self-start sm:self-auto"
              />
            </div>
            <Reveal staggerChildren={0.1} className="grid gap-5 md:grid-cols-3">
              {packages.map((p) => {
                const isCurrent = !!activeSub && p.id === current?.id;
                const yearly = period === 'yearly' && !!p.priceYearly;
                const price = yearly ? (p.priceYearly as number) : p.priceMonthly;
                const save = p.yearlySavingPct ?? (p.priceYearly ? Math.round((1 - p.priceYearly / (p.priceMonthly * 12)) * 100) : 0);
                return (
                  <RevealItem
                    key={p.id}
                    as="article"
                    className={cn(
                      'card relative flex flex-col p-6 transition-shadow duration-300 hover:shadow-lift',
                      isCurrent && 'ring-2 ring-accent',
                    )}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <h3 className="font-sans text-lg font-bold text-primary rtl:font-display">{l(p.name)}</h3>
                      {isCurrent ? (
                        <Badge tone="gold">
                          <Crown className="h-3.5 w-3.5" aria-hidden />
                          {t('account.subscription.currentBadge')}
                        </Badge>
                      ) : (
                        p.popular && (
                          <Badge tone="navy">
                            <Sparkles className="h-3.5 w-3.5" aria-hidden />
                            {t('common.popular')}
                          </Badge>
                        )
                      )}
                    </div>
                    <p className="mt-1 text-sm text-muted">{l(p.tagline)}</p>
                    <div className="mt-5 flex items-baseline gap-1.5">
                      <span className="text-3xl font-bold text-primary num">{fmtNumber(price)}</span>
                      <span className="text-sm text-muted">
                        {t('common.currency')} {!yearly ? t('common.perMonth') : t('common.perYear')}
                      </span>
                    </div>
                    <p className="mt-1 h-5 text-xs font-semibold text-success">
                      {yearly && (
                        <>
                          {t('account.subscription.save', { pct: save })} ·{' '}
                          <span className="font-normal text-muted num">
                            {t('account.subscription.perMonthEquiv', {
                              price: fmtNumber(Math.round((p.priceYearly ?? 0) / 12)),
                              currency: t('common.currency'),
                            })}
                          </span>
                        </>
                      )}
                    </p>
                    <div className="mt-4 flex flex-wrap gap-1.5">
                      {p.subjects.map((sid) => {
                        const s = subjectOf(sid);
                        return (
                          <span
                            key={sid}
                            className="flex h-7 w-7 items-center justify-center rounded-lg"
                            style={{ backgroundColor: `${s?.color}14`, color: s?.color }}
                            title={l(s?.name)}
                          >
                            <SubjectIcon id={sid} className="h-3.5 w-3.5" />
                          </span>
                        );
                      })}
                    </div>
                    <ul className="mt-5 flex-1 space-y-2.5 border-t border-primary/5 pt-5">
                      {p.features.map((f, fi) => (
                        <li key={`${fi}-${f.en}`} className="flex items-start gap-2.5 text-sm text-ink">
                          <span className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-accent/15 text-accent">
                            <Check className="h-3 w-3" strokeWidth={3} aria-hidden />
                          </span>
                          {l(f)}
                        </li>
                      ))}
                    </ul>
                    <Button
                      className="mt-6"
                      fullWidth
                      variant={isCurrent ? 'outline' : p.popular ? 'gold' : 'primary'}
                      onClick={() => openCheckout(p, yearly ? 'yearly' : 'monthly')}
                    >
                      {isCurrent ? t('account.subscription.renewThis') : t('account.subscription.choose')}
                    </Button>
                  </RevealItem>
                );
              })}
            </Reveal>
          </section>

          {/* Billing history */}
          <section aria-labelledby="history-title">
            <Card className="overflow-hidden">
              <div className="p-5 sm:p-6">
                <CardHeader title={<span id="history-title">{t('account.subscription.historyTitle')}</span>} subtitle={t('account.subscription.historySub')} />
              </div>

              {paymentsQ.isLoading && <SkeletonList rows={3} className="px-5 pb-5" />}
              {!paymentsQ.isLoading && history.length === 0 && (
                <p className="px-6 pb-6 text-sm text-muted">{t('account.subscription.historyEmpty')}</p>
              )}
              {/* Desktop table */}
              <div className={cn('hidden', history.length > 0 && 'md:block')}>
                <table className="w-full text-sm">
                  <thead className="border-y border-primary/5 bg-cream/70 text-xs text-muted">
                    <tr>
                      {(['colDate', 'colPlan', 'colMethod', 'colAmount', 'colReceipt', 'colStatus'] as const).map((c) => (
                        <th key={c} scope="col" className="px-6 py-3 text-start font-semibold">
                          {t(`account.subscription.${c}`)}
                        </th>
                      ))}
                      <th scope="col" className="px-6 py-3">
                        <span className="sr-only">{t('account.subscription.download')}</span>
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-primary/5">
                    {history.map((r) => (
                      <tr key={r.id} className="transition-colors hover:bg-cream/50">
                        <td className="px-6 py-4 text-primary num">{fmtDate(r.paidAt ?? r.createdAt)}</td>
                        <td className="px-6 py-4">
                          <p className="font-semibold text-primary">{l(r.package.name)}</p>
                          <p className="text-xs text-muted">{t(`account.subscription.periods.${r.cycle}`)}</p>
                        </td>
                        <td className="px-6 py-4">
                          <span className="flex items-center gap-2">
                            <MethodLogo id={r.gateway} size={26} />
                            {methodName(r)}
                          </span>
                        </td>
                        <td className="px-6 py-4 font-semibold text-primary num">{money(r.amount)}</td>
                        <td className="px-6 py-4 font-mono text-xs text-muted" dir="ltr">
                          <span className="block text-start">{r.receiptNumber ?? r.ref}</span>
                        </td>
                        <td className="px-6 py-4">
                          <Badge tone={STATUS_TONE[r.status]} dot>
                            {r.status === 'paid' ? t('account.subscription.paid') : t(`account.subscription.status.${r.status}`)}
                          </Badge>
                        </td>
                        <td className="px-6 py-4 text-end">
                          <Button
                            variant="ghost"
                            size="icon"
                            disabled={!r.receiptNumber}
                            onClick={() => downloadReceipt(r)}
                            aria-label={`${t('account.subscription.download')} ${r.receiptNumber ?? r.ref}`}
                          >
                            <Download className="h-4 w-4" aria-hidden />
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Mobile stacked cards */}
              <ul className="space-y-3 px-4 pb-4 md:hidden">
                {history.map((r) => (
                  <li key={r.id} className="rounded-2xl border border-primary/5 bg-cream/50 p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-center gap-3">
                        <MethodLogo id={r.gateway} size={36} />
                        <div>
                          <p className="font-semibold text-primary">{l(r.package.name)}</p>
                          <p className="text-xs text-muted num">
                            {fmtDate(r.paidAt ?? r.createdAt)} · {methodName(r)}
                          </p>
                        </div>
                      </div>
                      <Badge tone={STATUS_TONE[r.status]} dot>
                        {r.status === 'paid' ? t('account.subscription.paid') : t(`account.subscription.status.${r.status}`)}
                      </Badge>
                    </div>
                    <div className="mt-3 flex items-center justify-between border-t border-primary/5 pt-3">
                      <div>
                        <p className="font-bold text-primary num">{money(r.amount)}</p>
                        <p className="font-mono text-[11px] text-muted" dir="ltr">
                          {r.receiptNumber ?? r.ref}
                        </p>
                      </div>
                      <Button
                        variant="subtle"
                        size="sm"
                        disabled={!r.receiptNumber}
                        onClick={() => downloadReceipt(r)}
                        leftIcon={<Download className="h-4 w-4" aria-hidden />}
                      >
                        {t('account.subscription.download')}
                      </Button>
                    </div>
                  </li>
                ))}
              </ul>
            </Card>
          </section>
        </div>
      )}

      {lastPkg && (
        <PaymentModal
          open={!!checkout}
          onClose={() => setCheckout(null)}
          pkg={checkout?.pkg ?? lastPkg}
          initialPeriod={checkout?.period ?? period}
          resumePaymentId={checkout?.resumePaymentId ?? null}
          defaultPhone={user.mobile}
          onPaid={onPaid}
        />
      )}
    </>
  );
}
