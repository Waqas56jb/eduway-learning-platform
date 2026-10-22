import { AnimatePresence, motion } from 'framer-motion';
import { ArrowLeft, ArrowRight, Check, CreditCard, Download, Loader2, Lock, ShieldCheck, Smartphone, Tag, X } from 'lucide-react';
import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { useSubjectLookup } from '@/api/catalog';
import { errorMessage, idempotencyKey } from '@/api/client';
import { paymentsApi, useDownloadReceipt, useQuote, useValidatePromo, waitForPayment } from '@/api/payments';
import { usePaymentMethods } from '@/api/public';
import type { PaymentDetailDto, PriceQuote } from '@/api/types';
import { Button, Input, Modal, Skeleton, useToast } from '@/components/ui';
import { useLang } from '@/hooks/useLang';
import { cn } from '@/lib/utils';
import type { Package } from '@/types';
import { formatCardNumber, formatExpiry, isValidExpiry, type BillingPeriod, type PaymentMethod } from './billing';

type Step = 'summary' | 'method' | 'details' | 'processing' | 'success';
const STEPS: Step[] = ['summary', 'method', 'details'];

interface PaymentModalProps {
  open: boolean;
  onClose: () => void;
  pkg: Package;
  initialPeriod: BillingPeriod;
  defaultPhone: string;
  onPaid: (payment: PaymentDetailDto) => void;
}

/** Gateway "logo": initials on a brand-neutral tile in the gateway colour (or a card icon / CMS logo). */
export function MethodLogo({ id, size = 40 }: { id: PaymentMethod; size?: number }) {
  const { data: methods } = usePaymentMethods();
  const m = methods?.find((x) => x.id === id);
  if (m?.logoUrl) {
    return <img src={m.logoUrl} alt="" aria-hidden className="shrink-0 rounded-xl object-contain shadow-sm" style={{ width: size, height: size }} />;
  }
  const initials = m && m.kind !== 'card' ? m.name.en.replace(/[^A-Za-z ]/g, '').split(/\s+/).filter(Boolean).map((w) => w[0]).join('').slice(0, 2).toUpperCase() || id.slice(0, 2).toUpperCase() : '';
  return (
    <span
      className="flex shrink-0 items-center justify-center rounded-xl text-xs font-black tracking-tight shadow-sm"
      style={{ width: size, height: size, backgroundColor: m?.color || '#0B1F3A', color: '#FFFFFF' }}
      aria-hidden
    >
      {initials || <CreditCard style={{ width: size * 0.5, height: size * 0.5 }} />}
    </span>
  );
}

/** "Sandbox / test mode" pill — the gateway runs in its official test environment (no real money). */
function SandboxBadge({ withHint = false }: { withHint?: boolean }) {
  const { t } = useTranslation();
  return (
    <span className="mt-1 inline-flex flex-wrap items-center gap-1.5" title={t('account.subscription.pay.sandboxHint')}>
      <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-amber-800 ring-1 ring-amber-300/60">
        <span className="h-1.5 w-1.5 rounded-full bg-amber-500" aria-hidden />
        {t('account.subscription.pay.sandbox')}
      </span>
      {withHint && <span className="text-[11px] text-muted">{t('account.subscription.pay.sandboxHint')}</span>}
    </span>
  );
}

/**
 * Checkout: summary (PAY-04 quote, PAY-05 promo) → method (PUB-09) → gateway details → PAY-06 initiate
 * (Idempotency-Key) → real gateway redirect, or in non-production the MockGateway (PAY-07 confirm →
 * signed webhook) → poll PAY-08 until paid → receipt (PAY-10). Card numbers / CVV / wallet PINs never
 * leave the browser — the card form only exists for the mock gateway's simulated hosted page.
 */
export function PaymentModal({ open, onClose, pkg, initialPeriod, defaultPhone, onPaid }: PaymentModalProps) {
  const { t } = useTranslation();
  const { l, fmtNumber, fmtDate } = useLang();
  const toast = useToast();
  const subjectOf = useSubjectLookup();
  const { data: allMethods, isLoading: methodsLoading } = usePaymentMethods();
  const PAYMENT_METHODS = useMemo(() => (allMethods ?? []).filter((m) => m.enabled), [allMethods]);
  const quoteMutation = useQuote();
  const validatePromo = useValidatePromo();
  const downloadReceipt = useDownloadReceipt();
  const abortRef = useRef<AbortController | null>(null);
  const idemKey = useRef(idempotencyKey());

  const [step, setStep] = useState<Step>('summary');
  const [period, setPeriod] = useState<BillingPeriod>(initialPeriod);
  const [promoInput, setPromoInput] = useState('');
  const [promo, setPromo] = useState<string | null>(null);
  const [promoError, setPromoError] = useState('');
  const [quote, setQuote] = useState<PriceQuote | null>(null);
  const [method, setMethod] = useState<PaymentMethod>('zaincash');
  const [card, setCard] = useState({ number: '', name: '', expiry: '', cvc: '' });
  const [phone, setPhone] = useState(defaultPhone);
  const [submitted, setSubmitted] = useState(false);
  const [phase, setPhase] = useState(0);
  const [record, setRecord] = useState<PaymentDetailDto | null>(null);
  const [payError, setPayError] = useState('');

  // Fresh checkout every time the modal opens.
  useEffect(() => {
    if (!open) return;
    setStep('summary');
    setPeriod(pkg.priceYearly ? initialPeriod : 'monthly');
    setPromoInput('');
    setPromo(null);
    setPromoError('');
    setQuote(null);
    setCard({ number: '', name: '', expiry: '', cvc: '' });
    setPhone(defaultPhone);
    setSubmitted(false);
    setRecord(null);
    setPayError('');
    idemKey.current = idempotencyKey();
  }, [open, initialPeriod, defaultPhone, pkg.id, pkg.priceYearly]);

  // Default to the first enabled gateway.
  useEffect(() => {
    if (PAYMENT_METHODS.length && !PAYMENT_METHODS.some((m) => m.id === method)) setMethod(PAYMENT_METHODS[0].id);
  }, [PAYMENT_METHODS, method]);

  // Server quote (subtotal, promo discount, upgrade proration) whenever the plan / cycle / promo changes.
  useEffect(() => {
    if (!open) return;
    let alive = true;
    quoteMutation.mutate(
      { packageId: pkg.id, cycle: period, promoCode: promo ?? undefined },
      {
        onSuccess: (q) => alive && setQuote(q),
        onError: (e) => {
          if (!alive) return;
          if (promo) {
            setPromo(null);
            setPromoError(errorMessage(e));
          } else setPayError(errorMessage(e));
        },
      },
    );
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, pkg.id, period, promo]);

  useEffect(() => () => abortRef.current?.abort(), []);

  const listPrice = period === 'yearly' && pkg.priceYearly ? pkg.priceYearly : pkg.priceMonthly;
  const subtotal = quote?.subtotal ?? listPrice;
  const total = quote?.total ?? subtotal;
  const money = (n: number) => `${fmtNumber(n)} ${t('common.currency')}`;
  const selected = PAYMENT_METHODS.find((m) => m.id === method);
  const methodName = selected ? l(selected.name) : t(`account.subscription.methods.${method}`, { defaultValue: method });
  const isCard = selected?.kind === 'card';
  // Real gateways host their own page (redirect); the mock gateway renders our simulated form.
  const needsDetails = !selected || selected.flow === 'mock' || selected.requiresPhone || isCard;

  const errors = {
    number: card.number.replace(/\s/g, '').length !== 16 ? t('account.subscription.pay.cardNumberError') : '',
    name: card.name.trim().length < 3 ? t('validation.required') : '',
    expiry: !isValidExpiry(card.expiry) ? t('account.subscription.pay.expiryError') : '',
    cvc: !/^\d{3,4}$/.test(card.cvc) ? t('account.subscription.pay.cvcError') : '',
    phone: !/^07[3-9]\d{8}$/.test(phone.replace(/\s/g, '')) ? t('validation.mobile') : '',
  };
  const detailsValid = isCard
    ? !errors.number && !errors.name && !errors.expiry && !errors.cvc
    : selected?.requiresPhone || selected?.flow === 'mock'
      ? !errors.phone
      : true;

  // PAY-05: 200 with valid:false carries the localized reason.
  const applyPromo = () => {
    const code = promoInput.trim().toUpperCase();
    if (!code) return;
    validatePromo.mutate(
      { code, packageId: pkg.id, cycle: period },
      {
        onSuccess: (res) => {
          if (res.valid) {
            setPromo(res.code || code);
            setPromoError('');
            if (res.quote) setQuote(res.quote);
          } else {
            setPromo(null);
            setPromoError(
              res.reason && t(`errors.reasons.${res.reason}`, { defaultValue: '' })
                ? t(`errors.reasons.${res.reason}`)
                : res.message || t('account.subscription.pay.promoInvalid'),
            );
          }
        },
        onError: (e) => setPromoError(errorMessage(e)),
      },
    );
  };

  const pay = async (e?: FormEvent) => {
    e?.preventDefault();
    setSubmitted(true);
    if (needsDetails && !detailsValid) return;
    setPayError('');
    setStep('processing');
    setPhase(0);
    const controller = new AbortController();
    abortRef.current = controller;
    try {
      // PAY-06 — idempotent per checkout attempt.
      const init = await paymentsApi.initiate(
        {
          packageId: pkg.id,
          cycle: period,
          gateway: method,
          promoCode: promo ?? undefined,
          walletPhone: !isCard && phone.trim() ? phone.replace(/\s/g, '') : undefined,
          returnUrl: `${window.location.origin}/student/subscription?payment=__ID__`,
        },
        idemKey.current,
      );
      if (init.redirectUrl && !init.mock) {
        window.location.assign(init.redirectUrl.replace('__ID__', init.paymentId));
        return;
      }
      setPhase(1);
      // Non-production MockGateway: confirm → signed webhook → entitlement.
      if (init.mock) await paymentsApi.mockConfirm(init.paymentId, 'success');
      const final = await waitForPayment(init.paymentId, controller.signal);
      if (final.status !== 'paid') {
        setPayError(t('account.subscription.pay.failed'));
        setStep('details');
        idemKey.current = idempotencyKey();
        return;
      }
      setRecord(final);
      setStep('success');
      onPaid(final);
    } catch (err) {
      if ((err as Error).name === 'AbortError') return;
      setPayError(errorMessage(err));
      setStep(needsDetails ? 'details' : 'method');
      idemKey.current = idempotencyKey();
    }
  };

  const stepIndex = STEPS.indexOf(step);
  const busy = step === 'processing';

  return (
    <Modal
      open={open}
      onClose={onClose}
      persistent={busy}
      size="md"
      title={stepIndex >= 0 ? t('account.subscription.pay.title') : undefined}
    >
      {stepIndex >= 0 && (
        <ol className="mb-6 flex items-center gap-2" aria-label={t('account.subscription.pay.stepOf', { current: stepIndex + 1, total: STEPS.length })}>
          {STEPS.map((s, i) => (
            <li key={s} className="flex flex-1 items-center gap-2" aria-current={i === stepIndex ? 'step' : undefined}>
              <span
                className={cn(
                  'flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-bold transition-colors',
                  i < stepIndex ? 'bg-success text-white' : i === stepIndex ? 'bg-primary text-white' : 'bg-primary/5 text-muted',
                )}
              >
                {i < stepIndex ? <Check className="h-3.5 w-3.5" aria-hidden /> : i + 1}
              </span>
              <span className={cn('hidden text-xs font-semibold sm:inline', i === stepIndex ? 'text-primary' : 'text-muted')}>
                {t(`account.subscription.pay.steps.${s}`)}
              </span>
              {i < STEPS.length - 1 && <span className={cn('h-px flex-1', i < stepIndex ? 'bg-success' : 'bg-primary/10')} />}
            </li>
          ))}
        </ol>
      )}

      <AnimatePresence mode="wait" initial={false}>
        <motion.div
          key={step}
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -8 }}
          transition={{ duration: 0.22 }}
        >
          {step === 'summary' && (
            <div className="space-y-5">
              <div className="relative overflow-hidden rounded-2xl bg-navy-grad p-5 text-white">
                <div className="pointer-events-none absolute -top-12 end-0 h-32 w-32 rounded-full bg-accent/30 blur-2xl" aria-hidden />
                <p className="text-xs text-white/60">{t('account.subscription.pay.package')}</p>
                <p className="mt-1 text-xl font-bold">{l(pkg.name)}</p>
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {pkg.subjects.map((sid) => {
                    const s = subjectOf(sid);
                    return (
                      <span key={sid} className="rounded-full bg-white/10 px-2.5 py-1 text-[11px] font-semibold">
                        {l(s?.name)}
                      </span>
                    );
                  })}
                </div>
              </div>

              <fieldset>
                <legend className="mb-2 text-sm font-semibold text-primary">{t('account.subscription.pay.period')}</legend>
                <div className="grid grid-cols-2 gap-2">
                  {(pkg.priceYearly ? (['monthly', 'yearly'] as const) : (['monthly'] as const)).map((p) => (
                    <label
                      key={p}
                      className={cn(
                        'cursor-pointer rounded-xl border p-3 transition',
                        period === p ? 'border-accent bg-accent/5 ring-2 ring-accent/30' : 'border-primary/10 hover:border-primary/20',
                      )}
                    >
                      <input
                        type="radio"
                        name="period"
                        value={p}
                        checked={period === p}
                        onChange={() => setPeriod(p)}
                        className="sr-only"
                      />
                      <span className="block text-sm font-semibold text-primary">{t(`common.${p}`)}</span>
                      <span className="mt-0.5 block text-xs text-muted num">
                        {money(p === 'monthly' ? pkg.priceMonthly : (pkg.priceYearly ?? pkg.priceMonthly))}
                      </span>
                    </label>
                  ))}
                </div>
              </fieldset>

              <div>
                {promo ? (
                  <div className="flex items-center justify-between gap-3 rounded-xl border border-success/30 bg-success/5 px-4 py-3 text-sm">
                    <span className="flex items-center gap-2 font-semibold text-success">
                      <Tag className="h-4 w-4" aria-hidden />
                      {t('account.subscription.pay.promoApplied', { code: promo })}
                    </span>
                    <button
                      type="button"
                      onClick={() => {
                        setPromo(null);
                        setPromoInput('');
                      }}
                      className="flex items-center gap-1 text-xs font-semibold text-muted hover:text-danger"
                    >
                      <X className="h-3.5 w-3.5" aria-hidden />
                      {t('account.subscription.pay.remove')}
                    </button>
                  </div>
                ) : (
                  <Input
                    label={t('account.subscription.pay.promo')}
                    optional={t('common.optional')}
                    placeholder={t('account.subscription.pay.promoPlaceholder')}
                    value={promoInput}
                    onChange={(e) => {
                      setPromoInput(e.target.value);
                      setPromoError('');
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        applyPromo();
                      }
                    }}
                    error={promoError}
                    icon={<Tag className="h-4 w-4" />}
                    className="uppercase !pe-24 placeholder:normal-case"
                    suffix={
                      <Button size="sm" variant="subtle" onClick={applyPromo} loading={validatePromo.isPending} disabled={!promoInput.trim()}>
                        {t('account.subscription.pay.apply')}
                      </Button>
                    }
                  />
                )}
              </div>

              <dl className={cn('space-y-2 rounded-2xl bg-cream p-4 text-sm transition-opacity', quoteMutation.isPending && 'opacity-60')} aria-busy={quoteMutation.isPending}>
                <div className="flex justify-between">
                  <dt className="text-muted">{t('account.subscription.pay.subtotal')}</dt>
                  <dd className="font-semibold text-primary num">{money(subtotal)}</dd>
                </div>
                {!!quote?.prorationCredit && (
                  <div className="flex justify-between text-success">
                    <dt>{t('account.subscription.pay.proration')}</dt>
                    <dd className="font-semibold num">−{money(quote.prorationCredit)}</dd>
                  </div>
                )}
                {(quote?.discount ?? 0) > 0 && (
                  <div className="flex justify-between text-success">
                    <dt>{t('account.subscription.pay.discount')}</dt>
                    <dd className="font-semibold num">−{money(quote?.discount ?? 0)}</dd>
                  </div>
                )}
                <div className="flex justify-between border-t border-primary/10 pt-2 text-base">
                  <dt className="font-bold text-primary">{t('account.subscription.pay.total')}</dt>
                  <dd className="font-bold text-primary num">{money(total)}</dd>
                </div>
              </dl>

              {payError && <p role="alert" className="text-sm font-semibold text-danger">{payError}</p>}
              <Button
                fullWidth
                size="lg"
                onClick={() => setStep('method')}
                disabled={!quote}
                rightIcon={<ArrowRight className="h-4 w-4 rtl:-scale-x-100" aria-hidden />}
              >
                {t('common.continue')}
              </Button>
            </div>
          )}

          {step === 'method' && (
            <div className="space-y-5">
              <fieldset>
                <legend className="mb-3 text-sm font-semibold text-primary">{t('account.subscription.pay.chooseMethod')}</legend>
                <div className="grid gap-2.5 sm:grid-cols-2">
                  {methodsLoading && [0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-[72px] rounded-2xl" />)}
                  {PAYMENT_METHODS.map((m) => {
                    const on = method === m.id;
                    return (
                      <label
                        key={m.id}
                        className={cn(
                          'relative flex cursor-pointer items-center gap-3 rounded-2xl border p-3.5 transition',
                          on ? 'border-accent bg-accent/5 ring-2 ring-accent/30' : 'border-primary/10 hover:border-primary/20 hover:bg-cream/60',
                        )}
                      >
                        <input
                          type="radio"
                          name="method"
                          value={m.id}
                          checked={on}
                          onChange={() => setMethod(m.id)}
                          className="sr-only"
                        />
                        <MethodLogo id={m.id} />
                        <span className="min-w-0 flex-1">
                          <span className="block text-sm font-semibold text-primary">{l(m.name)}</span>
                          <span className="block truncate text-xs text-muted">{l(m.hint)}</span>
                          {m.sandbox && <SandboxBadge />}
                        </span>
                        <span
                          className={cn(
                            'flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 transition',
                            on ? 'border-accent bg-accent text-white' : 'border-primary/20',
                          )}
                          aria-hidden
                        >
                          {on && <Check className="h-3 w-3" strokeWidth={3} />}
                        </span>
                      </label>
                    );
                  })}
                </div>
              </fieldset>
              <p className="flex items-center gap-2 text-xs text-muted">
                <ShieldCheck className="h-4 w-4 shrink-0 text-success" aria-hidden />
                {t('account.subscription.pay.secure')}
              </p>
              <div className="flex gap-3">
                <Button
                  variant="ghost"
                  onClick={() => setStep('summary')}
                  leftIcon={<ArrowLeft className="h-4 w-4 rtl:-scale-x-100" aria-hidden />}
                >
                  {t('common.back')}
                </Button>
                <Button
                  className="flex-1"
                  disabled={!selected}
                  onClick={() => {
                    setSubmitted(false);
                    if (needsDetails) setStep('details');
                    else void pay();
                  }}
                  rightIcon={<ArrowRight className="h-4 w-4 rtl:-scale-x-100" aria-hidden />}
                >
                  {t('common.continue')}
                </Button>
              </div>
            </div>
          )}

          {step === 'details' && (
            <form onSubmit={pay} noValidate className="space-y-4">
              <div className="flex items-center gap-3 rounded-2xl bg-cream p-3.5">
                <MethodLogo id={method} size={36} />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-primary">{methodName}</p>
                  <p className="text-xs text-muted">
                    {l(pkg.name)} · {t(`account.subscription.periods.${period}`)}
                  </p>
                  {selected?.sandbox && <SandboxBadge withHint />}
                </div>
                <span className="text-sm font-bold text-primary num">{money(total)}</span>
              </div>

              {payError && (
                <p role="alert" className="rounded-xl bg-danger/10 p-3 text-sm font-semibold text-danger">
                  {payError}
                </p>
              )}
              {isCard ? (
                <>
                  <Input
                    label={t('account.subscription.pay.cardNumber')}
                    inputMode="numeric"
                    autoComplete="cc-number"
                    placeholder="4242 4242 4242 4242"
                    value={card.number}
                    onChange={(e) => setCard((c) => ({ ...c, number: formatCardNumber(e.target.value) }))}
                    icon={<CreditCard className="h-4 w-4" />}
                    error={submitted ? errors.number : undefined}
                    className="num tracking-wider [unicode-bidi:plaintext]"
                  />
                  <Input
                    label={t('account.subscription.pay.cardName')}
                    autoComplete="cc-name"
                    value={card.name}
                    onChange={(e) => setCard((c) => ({ ...c, name: e.target.value }))}
                    error={submitted ? errors.name : undefined}
                  />
                  <div className="grid grid-cols-2 gap-3">
                    <Input
                      label={t('account.subscription.pay.expiry')}
                      inputMode="numeric"
                      autoComplete="cc-exp"
                      placeholder="MM/YY"
                      value={card.expiry}
                      onChange={(e) => setCard((c) => ({ ...c, expiry: formatExpiry(e.target.value) }))}
                      error={submitted ? errors.expiry : undefined}
                      className="num [unicode-bidi:plaintext]"
                    />
                    <Input
                      label={t('account.subscription.pay.cvc')}
                      inputMode="numeric"
                      autoComplete="cc-csc"
                      placeholder="123"
                      maxLength={4}
                      value={card.cvc}
                      onChange={(e) => setCard((c) => ({ ...c, cvc: e.target.value.replace(/\D/g, '').slice(0, 4) }))}
                      error={submitted ? errors.cvc : undefined}
                      icon={<Lock className="h-4 w-4" />}
                      className="num [unicode-bidi:plaintext]"
                    />
                  </div>
                </>
              ) : (
                <>
                  <Input
                    label={t('account.subscription.pay.walletPhone')}
                    inputMode="tel"
                    autoComplete="tel"
                    placeholder="07XXXXXXXXX"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value.replace(/[^\d\s]/g, '').slice(0, 13))}
                    icon={<Smartphone className="h-4 w-4" />}
                    error={submitted ? errors.phone : undefined}
                    className="num [unicode-bidi:plaintext]"
                  />
                  <p className="flex items-start gap-2.5 rounded-xl border border-accent/30 bg-accent/5 p-3.5 text-sm text-primary">
                    <Smartphone className="mt-0.5 h-4 w-4 shrink-0 text-accent" aria-hidden />
                    {t('account.subscription.pay.walletNotice', { method: methodName })}
                  </p>
                </>
              )}

              <div className="flex gap-3 pt-2">
                <Button
                  variant="ghost"
                  onClick={() => setStep('method')}
                  leftIcon={<ArrowLeft className="h-4 w-4 rtl:-scale-x-100" aria-hidden />}
                >
                  {t('common.back')}
                </Button>
                <Button type="submit" variant="gold" size="lg" className="flex-1" leftIcon={<Lock className="h-4 w-4" aria-hidden />}>
                  {t('account.subscription.pay.payNow', { amount: fmtNumber(total), currency: t('common.currency') })}
                </Button>
              </div>
            </form>
          )}

          {step === 'processing' && (
            <div className="flex flex-col items-center py-10 text-center" role="status" aria-live="polite">
              <div className="relative flex h-24 w-24 items-center justify-center">
                <span className="absolute inset-0 animate-ping rounded-full bg-accent/20" aria-hidden />
                <span className="absolute inset-2 rounded-full bg-accent/10" aria-hidden />
                <Loader2 className="relative h-10 w-10 animate-spin text-accent" aria-hidden />
              </div>
              <p className="mt-6 text-lg font-bold text-primary">
                {phase === 0 ? t('account.subscription.pay.processing') : t('account.subscription.pay.authorising')}
              </p>
              <p className="mt-1 text-sm text-muted">{t('account.subscription.pay.processingSub')}</p>
              <div className="mt-6 flex items-center gap-2 text-xs text-muted">
                <MethodLogo id={method} size={24} />
                {methodName} · <span className="num">{money(total)}</span>
              </div>
            </div>
          )}

          {step === 'success' && record && (
            <div className="text-center" role="status" aria-live="polite">
              <motion.div
                initial={{ scale: 0.6, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{ type: 'spring', stiffness: 260, damping: 18 }}
                className="mx-auto flex h-20 w-20 items-center justify-center rounded-full bg-success/10"
              >
                <svg viewBox="0 0 52 52" className="h-14 w-14" aria-hidden>
                  <circle cx="26" cy="26" r="24" fill="none" stroke="currentColor" strokeWidth="3" className="text-success/30" />
                  <motion.path
                    d="M15 27 l7 7 l15 -16"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="4"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    className="text-success"
                    initial={{ pathLength: 0 }}
                    animate={{ pathLength: 1 }}
                    transition={{ delay: 0.2, duration: 0.5, ease: 'easeOut' }}
                  />
                </svg>
              </motion.div>
              <h2 className="mt-5 text-2xl font-bold text-primary">{t('account.subscription.pay.successTitle')}</h2>
              <p className="mt-1 text-muted">{t('account.subscription.pay.successSub', { plan: l(pkg.name) })}</p>

              <dl className="mt-6 divide-y divide-dashed divide-primary/10 rounded-2xl border border-primary/5 bg-cream p-4 text-start text-sm">
                {[
                  [t('account.subscription.pay.receipt'), <span key="r" className="font-mono font-bold tracking-wide text-primary" dir="ltr">{record.receiptNumber ?? record.ref}</span>],
                  [t('account.subscription.pay.amount'), <span key="a" className="font-semibold num">{money(record.amount)}</span>],
                  [t('account.subscription.pay.date'), <span key="d" className="num">{fmtDate(record.paidAt ?? record.createdAt, { day: 'numeric', month: 'long', year: 'numeric', hour: 'numeric', minute: '2-digit' })}</span>],
                  [t('account.subscription.pay.method'), <span key="m">{methodName}</span>],
                ].map(([k, v], i) => (
                  <div key={i} className="flex items-center justify-between gap-4 py-2.5 first:pt-0 last:pb-0">
                    <dt className="text-muted">{k}</dt>
                    <dd className="text-end text-primary">{v}</dd>
                  </div>
                ))}
              </dl>

              <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row">
                <Button
                  variant="outline"
                  className="flex-1"
                  leftIcon={<Download className="h-4 w-4" aria-hidden />}
                  loading={downloadReceipt.isPending}
                  onClick={() =>
                    downloadReceipt.mutate(
                      { id: record.id, receiptNumber: record.receiptNumber },
                      {
                        onSuccess: () =>
                          toast.success(t('account.subscription.downloadDone'), t('account.subscription.downloadBody', { receipt: record.receiptNumber ?? record.ref })),
                      },
                    )
                  }
                >
                  {t('account.subscription.download')}
                </Button>
                <Button className="flex-1" onClick={onClose}>
                  {t('account.subscription.pay.done')}
                </Button>
              </div>
            </div>
          )}
        </motion.div>
      </AnimatePresence>
    </Modal>
  );
}
