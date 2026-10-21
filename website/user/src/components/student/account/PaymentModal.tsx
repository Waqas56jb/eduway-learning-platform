import { AnimatePresence, motion } from 'framer-motion';
import { ArrowLeft, ArrowRight, Check, CreditCard, Download, Loader2, Lock, ShieldCheck, Smartphone, Tag, X } from 'lucide-react';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { Button, Input, Modal, useToast } from '@/components/ui';
import { getSubject } from '@/data';
import { useLang } from '@/hooks/useLang';
import { cn } from '@/lib/utils';
import type { Package } from '@/types';
import {
  PAYMENT_METHODS,
  PROMO_CODE,
  PROMO_RATE,
  formatCardNumber,
  formatExpiry,
  isValidExpiry,
  newReceipt,
  type BillingPeriod,
  type BillingRecord,
  type PaymentMethod,
} from './billing';

type Step = 'summary' | 'method' | 'details' | 'processing' | 'success';
const STEPS: Step[] = ['summary', 'method', 'details'];

interface PaymentModalProps {
  open: boolean;
  onClose: () => void;
  pkg: Package;
  initialPeriod: BillingPeriod;
  defaultPhone: string;
  onPaid: (record: BillingRecord) => void;
}

/** Gateway "logo": initials on a brand-neutral tile (or a card icon). */
export function MethodLogo({ id, size = 40 }: { id: PaymentMethod; size?: number }) {
  const m = PAYMENT_METHODS.find((x) => x.id === id);
  if (!m) return null;
  return (
    <span
      className="flex shrink-0 items-center justify-center rounded-xl text-xs font-black tracking-tight shadow-sm"
      style={{ width: size, height: size, backgroundColor: m.bg, color: m.fg }}
      aria-hidden
    >
      {m.initials || <CreditCard style={{ width: size * 0.5, height: size * 0.5 }} />}
    </span>
  );
}

/** Mock multi-step checkout: summary → method → gateway → processing → receipt. */
export function PaymentModal({ open, onClose, pkg, initialPeriod, defaultPhone, onPaid }: PaymentModalProps) {
  const { t } = useTranslation();
  const { l, fmtNumber, fmtDate } = useLang();
  const toast = useToast();
  const timers = useRef<number[]>([]);

  const [step, setStep] = useState<Step>('summary');
  const [period, setPeriod] = useState<BillingPeriod>(initialPeriod);
  const [promoInput, setPromoInput] = useState('');
  const [promo, setPromo] = useState<string | null>(null);
  const [promoError, setPromoError] = useState('');
  const [method, setMethod] = useState<PaymentMethod>('zain');
  const [card, setCard] = useState({ number: '', name: '', expiry: '', cvc: '' });
  const [phone, setPhone] = useState(defaultPhone);
  const [submitted, setSubmitted] = useState(false);
  const [phase, setPhase] = useState(0);
  const [record, setRecord] = useState<BillingRecord | null>(null);

  // Fresh checkout every time the modal opens.
  useEffect(() => {
    if (!open) return;
    setStep('summary');
    setPeriod(initialPeriod);
    setPromoInput('');
    setPromo(null);
    setPromoError('');
    setMethod('zain');
    setCard({ number: '', name: '', expiry: '', cvc: '' });
    setPhone(defaultPhone);
    setSubmitted(false);
    setRecord(null);
  }, [open, initialPeriod, defaultPhone, pkg.id]);

  useEffect(() => () => timers.current.forEach((x) => window.clearTimeout(x)), []);

  const subtotal = period === 'monthly' ? pkg.priceMonthly : pkg.priceYearly;
  const discount = promo ? Math.round(subtotal * PROMO_RATE) : 0;
  const total = subtotal - discount;
  const money = (n: number) => `${fmtNumber(n)} ${t('common.currency')}`;
  const methodName = t(`account.subscription.methods.${method}`);

  const errors = {
    number: card.number.replace(/\s/g, '').length !== 16 ? t('account.subscription.pay.cardNumberError') : '',
    name: card.name.trim().length < 3 ? t('validation.required') : '',
    expiry: !isValidExpiry(card.expiry) ? t('account.subscription.pay.expiryError') : '',
    cvc: !/^\d{3,4}$/.test(card.cvc) ? t('account.subscription.pay.cvcError') : '',
    phone: !/^07[3-9]\d{8}$/.test(phone.replace(/\s/g, '')) ? t('validation.mobile') : '',
  };
  const detailsValid =
    method === 'card' ? !errors.number && !errors.name && !errors.expiry && !errors.cvc : !errors.phone;

  const applyPromo = () => {
    if (promoInput.trim().toUpperCase() === PROMO_CODE) {
      setPromo(PROMO_CODE);
      setPromoError('');
    } else {
      setPromo(null);
      setPromoError(t('account.subscription.pay.promoInvalid'));
    }
  };

  const pay = (e: FormEvent) => {
    e.preventDefault();
    setSubmitted(true);
    if (!detailsValid) return;
    setStep('processing');
    setPhase(0);
    timers.current.push(
      window.setTimeout(() => setPhase(1), 1100),
      window.setTimeout(() => {
        const r: BillingRecord = {
          id: `b-${Date.now()}`,
          receipt: newReceipt(),
          date: new Date().toISOString(),
          packageId: pkg.id,
          period,
          amount: total,
          method,
        };
        setRecord(r);
        setStep('success');
        onPaid(r);
      }, 2200),
    );
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
                    const s = getSubject(sid);
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
                  {(['monthly', 'yearly'] as const).map((p) => (
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
                        {money(p === 'monthly' ? pkg.priceMonthly : pkg.priceYearly)}
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
                      <Button size="sm" variant="subtle" onClick={applyPromo} disabled={!promoInput.trim()}>
                        {t('account.subscription.pay.apply')}
                      </Button>
                    }
                  />
                )}
              </div>

              <dl className="space-y-2 rounded-2xl bg-cream p-4 text-sm">
                <div className="flex justify-between">
                  <dt className="text-muted">{t('account.subscription.pay.subtotal')}</dt>
                  <dd className="font-semibold text-primary num">{money(subtotal)}</dd>
                </div>
                {discount > 0 && (
                  <div className="flex justify-between text-success">
                    <dt>{t('account.subscription.pay.discount')}</dt>
                    <dd className="font-semibold num">−{money(discount)}</dd>
                  </div>
                )}
                <div className="flex justify-between border-t border-primary/10 pt-2 text-base">
                  <dt className="font-bold text-primary">{t('account.subscription.pay.total')}</dt>
                  <dd className="font-bold text-primary num">{money(total)}</dd>
                </div>
              </dl>

              <Button
                fullWidth
                size="lg"
                onClick={() => setStep('method')}
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
                          <span className="block text-sm font-semibold text-primary">
                            {t(`account.subscription.methods.${m.id}`)}
                          </span>
                          <span className="block truncate text-xs text-muted">
                            {t(`account.subscription.methods.${m.id}Hint`)}
                          </span>
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
                  onClick={() => {
                    setSubmitted(false);
                    setStep('details');
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
                </div>
                <span className="text-sm font-bold text-primary num">{money(total)}</span>
              </div>

              {method === 'card' ? (
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
                  [t('account.subscription.pay.receipt'), <span key="r" className="font-mono font-bold tracking-wide text-primary" dir="ltr">{record.receipt}</span>],
                  [t('account.subscription.pay.amount'), <span key="a" className="font-semibold num">{money(record.amount)}</span>],
                  [t('account.subscription.pay.date'), <span key="d" className="num">{fmtDate(record.date, { day: 'numeric', month: 'long', year: 'numeric', hour: 'numeric', minute: '2-digit' })}</span>],
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
                  onClick={() => toast.success(t('account.subscription.downloadDone'), t('account.subscription.downloadBody', { receipt: record.receipt }))}
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
