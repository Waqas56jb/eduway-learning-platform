import { motion } from 'framer-motion';
import { ArrowUpRight, Bot, CalendarCheck2, CalendarClock, Check, Crown, Download, RefreshCw, Sparkles } from 'lucide-react';
import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
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
  useMockLoading,
  useToast,
} from '@/components/ui';
import { MethodLogo, PaymentModal } from '@/components/student/account/PaymentModal';
import {
  BILLING_STORE_KEY,
  seedBilling,
  toLocalMobile,
  type BillingPeriod,
  type BillingRecord,
} from '@/components/student/account/billing';
import { getPackage, getSubject, packages } from '@/data';
import { useAuth } from '@/hooks/useAuth';
import { useLang } from '@/hooks/useLang';
import { readStore, writeStore } from '@/lib/storage';
import { cn } from '@/lib/utils';
import type { Package } from '@/types';

const DAY = 86_400_000;

export default function Subscription() {
  const { t } = useTranslation();
  const { l, fmtNumber, fmtDate } = useLang();
  const { user, updateUser } = useAuth();
  const toast = useToast();
  const ready = useMockLoading(600);
  const compareRef = useRef<HTMLElement>(null);

  const [period, setPeriod] = useState<BillingPeriod>('monthly');
  const [history, setHistory] = useState<BillingRecord[]>(() => readStore(BILLING_STORE_KEY, seedBilling));
  const [checkout, setCheckout] = useState<{ pkg: Package; period: BillingPeriod } | null>(null);
  const [lastPkg, setLastPkg] = useState<Package | null>(null);

  if (!user) return null;
  const current = getPackage(user.packageId) ?? packages[packages.length - 1];
  const totalDays = Math.max(
    1,
    Math.round((new Date(user.subscriptionEnd).getTime() - new Date(user.subscriptionStart).getTime()) / DAY),
  );
  const remainingPct = (user.daysRemaining / totalDays) * 100;
  const money = (n: number) => `${fmtNumber(n)} ${t('common.currency')}`;

  const openCheckout = (pkg: Package, p: BillingPeriod = period) => {
    setLastPkg(pkg);
    setCheckout({ pkg, period: p });
  };

  const onPaid = (r: BillingRecord) => {
    const pkg = getPackage(r.packageId);
    if (!pkg) return;
    const days = r.period === 'monthly' ? 30 : 365;
    const start = new Date();
    updateUser({
      packageId: pkg.id,
      daysRemaining: days,
      subscriptionStart: start.toISOString(),
      subscriptionEnd: new Date(start.getTime() + days * DAY).toISOString(),
      aiQuota: pkg.aiQuota,
    });
    const next = [r, ...history];
    setHistory(next);
    writeStore(BILLING_STORE_KEY, next);
    toast.success(
      t('account.subscription.pay.toast'),
      t('account.subscription.pay.toastBody', { plan: l(pkg.name), period: t(`account.subscription.periods.${r.period}`) }),
    );
  };

  const downloadReceipt = (receipt: string) =>
    toast.success(t('account.subscription.downloadDone'), t('account.subscription.downloadBody', { receipt }));

  const methodName = (r: BillingRecord) => t(`account.subscription.methods.${r.method}`);

  return (
    <>
      <Seo title={t('account.subscription.seoTitle')} description={t('account.subscription.seoDescription')} />
      <PageHeader title={t('account.subscription.title')} subtitle={t('account.subscription.subtitle')} />

      {!ready ? (
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
                  <h2 className="mt-2 text-2xl font-bold text-white sm:text-3xl">{l(current.name)}</h2>
                  <p className="mt-1 text-sm text-white/60">{l(current.tagline)}</p>
                </div>
                <span className="inline-flex items-center gap-1.5 rounded-full bg-success/20 px-2.5 py-1 text-xs font-semibold text-emerald-300 ring-1 ring-inset ring-emerald-300/30">
                  <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-300" aria-hidden />
                  {t('student.plan.active')}
                </span>
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
                  <p className="font-semibold num">{fmtDate(user.subscriptionEnd)}</p>
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
                  <p className="mt-1 font-semibold text-primary num">{fmtDate(user.subscriptionStart)}</p>
                </div>
                <div>
                  <p className="flex items-center gap-1.5 text-xs text-muted">
                    <CalendarClock className="h-3.5 w-3.5" aria-hidden />
                    {t('account.subscription.ends')}
                  </p>
                  <p className="mt-1 font-semibold text-primary num">{fmtDate(user.subscriptionEnd)}</p>
                </div>
              </div>

              <div className="mt-5 rounded-2xl bg-cream p-4">
                <div className="flex items-baseline justify-between gap-2">
                  <p className="text-sm font-bold text-primary">
                    {t('account.subscription.daysRemaining', { count: user.daysRemaining })}
                  </p>
                  <span className="text-xs text-muted num">
                    {fmtNumber(user.daysRemaining)} / {fmtNumber(totalDays)}
                  </span>
                </div>
                <ProgressBar
                  value={remainingPct}
                  gold
                  size="md"
                  className="mt-3"
                  label={t('account.subscription.daysRemaining', { count: user.daysRemaining })}
                />
              </div>

              <div className="mt-5">
                <p className="text-xs font-semibold text-muted">{t('account.subscription.subjectsIncluded')}</p>
                <div className="mt-2 flex flex-wrap gap-2">
                  {current.subjects.map((sid) => {
                    const s = getSubject(sid);
                    if (!s) return null;
                    return (
                      <Badge key={sid} color={s.color}>
                        <SubjectIcon id={sid} className="h-3.5 w-3.5" />
                        {l(s.name)}
                      </Badge>
                    );
                  })}
                </div>
              </div>

              <div className="mt-5 flex items-center gap-3 rounded-2xl border border-accent/20 bg-accent/5 p-3.5">
                <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-gold-grad text-primary">
                  <Bot className="h-4 w-4" aria-hidden />
                </span>
                <div>
                  <p className="text-xs text-muted">{t('account.subscription.aiQuota')}</p>
                  <p className="text-sm font-semibold text-primary">
                    {t('account.subscription.aiQuotaValue', { n: fmtNumber(current.aiQuota) })}
                  </p>
                </div>
              </div>

              <div className="mt-6 flex flex-col gap-3 sm:mt-auto sm:flex-row sm:pt-6">
                <Button
                  variant="gold"
                  className="flex-1"
                  leftIcon={<RefreshCw className="h-4 w-4" aria-hidden />}
                  onClick={() => openCheckout(current)}
                >
                  {t('account.subscription.renew')}
                </Button>
                <Button
                  variant="outline"
                  className="flex-1"
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
                items={[
                  { id: 'monthly', label: t('common.monthly') },
                  { id: 'yearly', label: t('common.yearly') },
                ]}
                value={period}
                onChange={setPeriod}
                className="self-start sm:self-auto"
              />
            </div>
            <Reveal staggerChildren={0.1} className="grid gap-5 md:grid-cols-3">
              {packages.map((p) => {
                const isCurrent = p.id === current.id;
                const price = period === 'monthly' ? p.priceMonthly : p.priceYearly;
                const save = Math.round((1 - p.priceYearly / (p.priceMonthly * 12)) * 100);
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
                        {t('common.currency')} {period === 'monthly' ? t('common.perMonth') : t('common.perYear')}
                      </span>
                    </div>
                    <p className="mt-1 h-5 text-xs font-semibold text-success">
                      {period === 'yearly' && (
                        <>
                          {t('account.subscription.save', { pct: save })} ·{' '}
                          <span className="font-normal text-muted num">
                            {t('account.subscription.perMonthEquiv', {
                              price: fmtNumber(Math.round(p.priceYearly / 12)),
                              currency: t('common.currency'),
                            })}
                          </span>
                        </>
                      )}
                    </p>
                    <div className="mt-4 flex flex-wrap gap-1.5">
                      {p.subjects.map((sid) => {
                        const s = getSubject(sid);
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
                      {p.features.map((f) => (
                        <li key={f.en} className="flex items-start gap-2.5 text-sm text-ink">
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
                      onClick={() => openCheckout(p)}
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

              {/* Desktop table */}
              <div className="hidden md:block">
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
                        <td className="px-6 py-4 text-primary num">{fmtDate(r.date)}</td>
                        <td className="px-6 py-4">
                          <p className="font-semibold text-primary">{l(getPackage(r.packageId)?.name)}</p>
                          <p className="text-xs text-muted">{t(`account.subscription.periods.${r.period}`)}</p>
                        </td>
                        <td className="px-6 py-4">
                          <span className="flex items-center gap-2">
                            <MethodLogo id={r.method} size={26} />
                            {methodName(r)}
                          </span>
                        </td>
                        <td className="px-6 py-4 font-semibold text-primary num">{money(r.amount)}</td>
                        <td className="px-6 py-4 font-mono text-xs text-muted" dir="ltr">
                          <span className="block text-start">{r.receipt}</span>
                        </td>
                        <td className="px-6 py-4">
                          <Badge tone="success" dot>
                            {t('account.subscription.paid')}
                          </Badge>
                        </td>
                        <td className="px-6 py-4 text-end">
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => downloadReceipt(r.receipt)}
                            aria-label={`${t('account.subscription.download')} ${r.receipt}`}
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
                        <MethodLogo id={r.method} size={36} />
                        <div>
                          <p className="font-semibold text-primary">{l(getPackage(r.packageId)?.name)}</p>
                          <p className="text-xs text-muted num">
                            {fmtDate(r.date)} · {methodName(r)}
                          </p>
                        </div>
                      </div>
                      <Badge tone="success" dot>
                        {t('account.subscription.paid')}
                      </Badge>
                    </div>
                    <div className="mt-3 flex items-center justify-between border-t border-primary/5 pt-3">
                      <div>
                        <p className="font-bold text-primary num">{money(r.amount)}</p>
                        <p className="font-mono text-[11px] text-muted" dir="ltr">
                          {r.receipt}
                        </p>
                      </div>
                      <Button
                        variant="subtle"
                        size="sm"
                        onClick={() => downloadReceipt(r.receipt)}
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
          defaultPhone={toLocalMobile(user.mobile)}
          onPaid={onPaid}
        />
      )}
    </>
  );
}
