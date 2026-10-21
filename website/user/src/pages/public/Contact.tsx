import { AnimatePresence, motion } from 'framer-motion';
import {
  ArrowRight,
  CheckCircle2,
  Clock,
  Headphones,
  HelpCircle,
  Mail,
  MapPin,
  MessageCircle,
  Phone,
  Send,
  Ticket,
  Zap,
} from 'lucide-react';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { isIraqiMobile } from '@/components/auth/mobile';
import { Button, Input, Reveal, Select, Seo, SmartImage, Textarea, useToast } from '@/components/ui';
import { IMAGES } from '@/lib/images';
import { sleep } from '@/lib/utils';

interface ContactForm {
  name: string;
  contact: string;
  subject: string;
  message: string;
}

const SUBJECTS = ['general', 'support', 'billing', 'partnerships', 'schools'] as const;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

const CHANNELS = [
  { key: 'phone', icon: Phone, value: '+964 770 555 0142', href: 'tel:+9647705550142', ltr: true },
  { key: 'whatsapp', icon: MessageCircle, value: '+964 780 555 0187', href: 'https://wa.me/9647805550187', ltr: true },
  { key: 'email', icon: Mail, value: 'support@eduway.iq', href: 'mailto:support@eduway.iq', ltr: true },
  { key: 'office', icon: MapPin, value: null, href: null, ltr: false },
] as const;

export default function Contact() {
  const { t } = useTranslation();
  const toast = useToast();
  const [ticket, setTicket] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<ContactForm>({ defaultValues: { name: '', contact: '', subject: 'general', message: '' } });

  const onSubmit = async () => {
    await sleep(1100);
    const id = `EW-T-${Math.floor(40000 + Math.random() * 9999)}`;
    setTicket(id);
    toast.success(t('pages.contact.form.successToast'), t('pages.contact.form.ticketLabel', { id }));
    reset();
  };

  return (
    <>
      <Seo title={t('pages.contact.seoTitle')} description={t('pages.contact.seoDescription')} />

      {/* Hero */}
      <section className="relative isolate overflow-hidden bg-primary pb-36 pt-36 md:pb-44 md:pt-44">
        <SmartImage
          src={IMAGES.laptopStudy}
          alt=""
          priority
          wrapperClassName="!absolute inset-0 -z-10"
          overlay="bg-gradient-to-b from-primary/90 via-primary/80 to-primary"
        />
        <div className="pointer-events-none absolute -top-20 start-10 -z-10 h-80 w-80 rounded-full bg-accent/20 blur-3xl" aria-hidden />
        <div className="container text-center">
          <Reveal className="mx-auto max-w-3xl">
            <span className="eyebrow">
              <Headphones className="h-3.5 w-3.5" aria-hidden />
              {t('pages.contact.hero.eyebrow')}
            </span>
            <h1 className="mt-6 text-4xl font-bold text-white sm:text-5xl md:text-6xl">
              {t('pages.contact.hero.titleStart')} <span className="text-gold-grad">{t('pages.contact.hero.titleHighlight')}</span>
            </h1>
            <p className="mx-auto mt-6 text-lg text-white/75">{t('pages.contact.hero.subtitle')}</p>
            <ul className="mt-8 flex flex-wrap justify-center gap-3 text-sm text-white/85">
              {(['response', 'languages'] as const).map((k) => (
                <li key={k} className="glass flex items-center gap-2 rounded-full px-4 py-2">
                  {k === 'response' ? <Zap className="h-4 w-4 text-accent-light" aria-hidden /> : <MessageCircle className="h-4 w-4 text-accent-light" aria-hidden />}
                  {t(`pages.contact.hero.${k}`)}
                </li>
              ))}
            </ul>
          </Reveal>
        </div>
      </section>

      <section className="relative z-10 -mt-24 pb-20 md:-mt-28 md:pb-28">
        <div className="container grid items-start gap-6 lg:grid-cols-[minmax(0,1.45fr)_minmax(0,1fr)] lg:gap-8">
          {/* Form */}
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, delay: 0.15, ease: [0.22, 1, 0.36, 1] }}
            className="card p-6 shadow-lift sm:p-10"
          >
            <AnimatePresence mode="wait" initial={false}>
              {ticket ? (
                <motion.div
                  key="done"
                  initial={{ opacity: 0, scale: 0.96 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0 }}
                  className="flex flex-col items-center py-10 text-center"
                  role="status"
                  aria-live="polite"
                >
                  <motion.span
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                    transition={{ type: 'spring', stiffness: 260, damping: 15 }}
                    className="flex h-20 w-20 items-center justify-center rounded-full bg-gold-grad shadow-glow"
                  >
                    <CheckCircle2 className="h-10 w-10 text-primary" aria-hidden />
                  </motion.span>
                  <h2 className="mt-6 text-3xl font-bold text-primary">{t('pages.contact.form.successTitle')}</h2>
                  <p className="mx-auto mt-3 max-w-md text-muted">{t('pages.contact.form.successBody')}</p>
                  <div className="mt-6 inline-flex items-center gap-3 rounded-2xl border border-dashed border-accent/60 bg-accent/5 px-5 py-3">
                    <Ticket className="h-5 w-5 text-accent" aria-hidden />
                    <span className="text-sm text-muted">{t('pages.contact.form.ticket')}</span>
                    <span dir="ltr" className="num font-bold tracking-wider text-primary">
                      {ticket}
                    </span>
                  </div>
                  <Button variant="subtle" className="mt-8" onClick={() => setTicket(null)}>
                    {t('pages.contact.form.another')}
                  </Button>
                </motion.div>
              ) : (
                <motion.div key="form" exit={{ opacity: 0 }}>
                  <h2 className="text-2xl font-bold text-primary md:text-3xl">{t('pages.contact.form.title')}</h2>
                  <p className="mt-2 text-muted">{t('pages.contact.form.subtitle')}</p>
                  <form className="mt-8 grid gap-5 sm:grid-cols-2" onSubmit={handleSubmit(onSubmit)} noValidate>
                    <Input
                      label={t('pages.contact.form.name')}
                      placeholder={t('pages.contact.form.namePlaceholder')}
                      autoComplete="name"
                      error={errors.name?.message}
                      {...register('name', {
                        required: t('validation.required'),
                        validate: (v) => v.trim().length >= 3 || t('validation.minLength', { count: 3 }),
                      })}
                    />
                    <Input
                      label={t('pages.contact.form.contact')}
                      placeholder={t('pages.contact.form.contactPlaceholder')}
                      autoComplete="email"
                      dir="ltr"
                      className="text-start"
                      error={errors.contact?.message}
                      {...register('contact', {
                        required: t('validation.required'),
                        validate: (v) => EMAIL.test(v.trim()) || isIraqiMobile(v) || t('pages.contact.form.contactInvalid'),
                      })}
                    />
                    <Select
                      label={t('pages.contact.form.subject')}
                      wrapperClassName="sm:col-span-2"
                      {...register('subject', { required: t('validation.required') })}
                    >
                      {SUBJECTS.map((s) => (
                        <option key={s} value={s}>
                          {t(`pages.contact.form.subjects.${s}`)}
                        </option>
                      ))}
                    </Select>
                    <Textarea
                      label={t('pages.contact.form.message')}
                      placeholder={t('pages.contact.form.messagePlaceholder')}
                      hint={t('pages.contact.form.messageHint')}
                      rows={6}
                      wrapperClassName="sm:col-span-2"
                      error={errors.message?.message}
                      {...register('message', {
                        required: t('validation.required'),
                        validate: (v) => v.trim().length >= 20 || t('validation.minLength', { count: 20 }),
                      })}
                    />
                    <div className="flex flex-col-reverse items-start gap-4 sm:col-span-2 sm:flex-row sm:items-center sm:justify-between">
                      <p className="text-xs text-muted">{t('pages.contact.form.privacy')}</p>
                      <Button
                        type="submit"
                        variant="gold"
                        size="lg"
                        loading={isSubmitting}
                        className="w-full sm:w-auto"
                        rightIcon={<Send className="h-4 w-4 rtl:-scale-x-100" aria-hidden />}
                      >
                        {isSubmitting ? t('pages.contact.form.sending') : t('pages.contact.form.submit')}
                      </Button>
                    </div>
                  </form>
                </motion.div>
              )}
            </AnimatePresence>
          </motion.div>

          {/* Side */}
          <motion.aside
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, delay: 0.3, ease: [0.22, 1, 0.36, 1] }}
            className="space-y-6"
          >
            <ul className="card divide-y divide-primary/5 p-2">
              {CHANNELS.map(({ key, icon: Icon, value, href, ltr }) => {
                const body = (
                  <>
                    <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary text-accent-light">
                      <Icon className="h-5 w-5" aria-hidden />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-xs font-semibold uppercase tracking-wider text-muted rtl:normal-case rtl:tracking-normal">
                        {t(`pages.contact.channels.${key}.label`)}
                      </span>
                      <span dir={ltr ? 'ltr' : undefined} className="num mt-0.5 block truncate font-semibold text-primary">
                        {value ?? t(`pages.contact.channels.${key}.value`)}
                      </span>
                      <span className="block text-xs text-muted">{t(`pages.contact.channels.${key}.note`)}</span>
                    </span>
                  </>
                );
                return (
                  <li key={key}>
                    {href ? (
                      <a
                        href={href}
                        target={key === 'whatsapp' ? '_blank' : undefined}
                        rel={key === 'whatsapp' ? 'noopener noreferrer' : undefined}
                        className="group flex items-center gap-4 rounded-xl p-4 transition-colors hover:bg-cream"
                      >
                        {body}
                        <ArrowRight className="h-4 w-4 shrink-0 text-muted transition-transform group-hover:translate-x-0.5 group-hover:text-accent rtl:-scale-x-100 rtl:group-hover:-translate-x-0.5" aria-hidden />
                      </a>
                    ) : (
                      <div className="flex items-center gap-4 p-4">{body}</div>
                    )}
                  </li>
                );
              })}
            </ul>

            {/* Map placeholder */}
            <figure className="relative h-56 overflow-hidden rounded-2xl bg-primary shadow-soft" aria-label={t('pages.contact.map.label')}>
              <div
                className="absolute inset-0 opacity-40"
                style={{
                  backgroundImage:
                    'linear-gradient(rgba(201,162,74,0.18) 1px, transparent 1px), linear-gradient(90deg, rgba(201,162,74,0.18) 1px, transparent 1px)',
                  backgroundSize: '28px 28px',
                }}
                aria-hidden
              />
              <svg className="absolute inset-0 h-full w-full" viewBox="0 0 400 224" preserveAspectRatio="none" aria-hidden>
                <path d="M-10 160 C 80 120, 140 190, 230 140 S 360 90, 420 120" fill="none" stroke="rgba(230,199,122,0.35)" strokeWidth="14" />
                <path d="M120 -10 L 170 240" stroke="rgba(255,255,255,0.12)" strokeWidth="6" />
                <path d="M-10 70 L 420 40" stroke="rgba(255,255,255,0.1)" strokeWidth="5" />
                <path d="M280 -10 L 250 240" stroke="rgba(255,255,255,0.08)" strokeWidth="4" />
              </svg>
              <div className="absolute start-1/2 top-[42%] -translate-x-1/2 -translate-y-1/2 rtl:translate-x-1/2">
                <span className="absolute inset-0 m-auto h-12 w-12 animate-ping rounded-full bg-accent/40" aria-hidden />
                <span className="relative flex h-12 w-12 items-center justify-center rounded-full bg-gold-grad shadow-glow">
                  <MapPin className="h-6 w-6 text-primary" aria-hidden />
                </span>
              </div>
              <figcaption className="glass absolute inset-x-4 bottom-4 flex items-center justify-between gap-3 rounded-xl px-4 py-3 text-white">
                <span className="min-w-0">
                  <span className="block truncate text-sm font-semibold">{t('pages.contact.map.title')}</span>
                  <span className="block truncate text-xs text-white/70">{t('pages.contact.map.address')}</span>
                </span>
                <span className="shrink-0 rounded-lg bg-white/10 px-2 py-1 text-xs text-accent-light">{t('pages.contact.map.hq')}</span>
              </figcaption>
            </figure>

            {/* Working hours */}
            <div className="card p-6">
              <h2 className="flex items-center gap-2 font-sans text-base font-bold tracking-normal text-primary rtl:font-display">
                <Clock className="h-5 w-5 text-accent" aria-hidden />
                {t('pages.contact.hours.title')}
              </h2>
              <dl className="mt-4 space-y-3 text-sm">
                {(['weekdays', 'friday', 'whatsapp'] as const).map((k) => (
                  <div key={k} className="flex items-center justify-between gap-4">
                    <dt className="text-muted">{t(`pages.contact.hours.${k}.day`)}</dt>
                    <dd className="num font-semibold text-primary">{t(`pages.contact.hours.${k}.time`)}</dd>
                  </div>
                ))}
              </dl>
            </div>

            <Link
              to="/#faq"
              className="group flex items-center gap-4 rounded-2xl border border-accent/30 bg-accent/5 p-5 transition-colors hover:bg-accent/10"
            >
              <HelpCircle className="h-8 w-8 shrink-0 text-accent" aria-hidden />
              <span className="flex-1">
                <span className="block font-semibold text-primary">{t('pages.contact.faq.title')}</span>
                <span className="block text-sm text-muted">{t('pages.contact.faq.body')}</span>
              </span>
              <ArrowRight className="h-5 w-5 text-accent transition-transform group-hover:translate-x-1 rtl:-scale-x-100 rtl:group-hover:-translate-x-1" aria-hidden />
            </Link>
          </motion.aside>
        </div>
      </section>
    </>
  );
}
