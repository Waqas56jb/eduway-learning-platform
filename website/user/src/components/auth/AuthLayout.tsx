import { motion } from 'framer-motion';
import { ArrowLeft, Award, Check, Star, Users } from 'lucide-react';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { LanguageSwitcher } from '@/components/layout/LanguageSwitcher';
import { Avatar, Logo, SmartImage, Stars } from '@/components/ui';
import { AVATARS } from '@/lib/images';

export type AuthVariant = 'login' | 'register' | 'verify';

const AVATAR_FOR: Record<AuthVariant, string> = {
  login: AVATARS[1],
  register: AVATARS[2],
  verify: AVATARS[5],
};

const ease = [0.22, 1, 0.36, 1] as const;

interface AuthLayoutProps {
  variant: AuthVariant;
  image: string;
  children: ReactNode;
  /** Optional content rendered above the card (e.g. a step indicator). */
  above?: ReactNode;
}

/** Full-screen split layout for the guest-only auth pages: inspirational image panel + form card. */
export function AuthLayout({ variant, image, children, above }: AuthLayoutProps) {
  const { t } = useTranslation();
  const q = (k: string) => t(`auth.layout.quotes.${variant}.${k}`);
  const stats = [
    { icon: Users, value: t('auth.layout.stats.students'), label: t('auth.layout.stats.studentsLabel') },
    { icon: Star, value: t('auth.layout.stats.rating'), label: t('auth.layout.stats.ratingLabel') },
    { icon: Award, value: t('auth.layout.stats.pass'), label: t('auth.layout.stats.passLabel') },
  ];

  return (
    <div className="min-h-screen bg-cream lg:grid lg:grid-cols-[minmax(0,45fr)_minmax(0,55fr)]">
      {/* Image panel (desktop) */}
      <aside className="relative hidden overflow-hidden bg-primary lg:sticky lg:top-0 lg:flex lg:h-screen lg:flex-col">
        <motion.div
          className="absolute inset-0"
          initial={{ scale: 1.08, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ duration: 1.2, ease }}
        >
          <SmartImage
            src={image}
            alt={t(`auth.layout.imageAlt.${variant}`)}
            priority
            wrapperClassName="h-full w-full"
            overlay="bg-gradient-to-b from-primary/80 via-primary/60 to-primary/95"
          />
        </motion.div>
        <div className="pointer-events-none absolute -top-24 end-[-6rem] h-80 w-80 rounded-full bg-accent/25 blur-3xl" aria-hidden />
        <div className="pointer-events-none absolute -bottom-32 start-[-4rem] h-96 w-96 rounded-full bg-accent/10 blur-3xl" aria-hidden />

        <div className="relative z-10 flex h-full flex-col justify-between p-10 xl:p-14">
          <Logo light />

          <motion.figure
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, delay: 0.25, ease }}
            className="max-w-lg"
          >
            <span className="block font-display text-7xl leading-none text-gold-grad" aria-hidden>
              “
            </span>
            <blockquote className="-mt-4 font-display text-2xl font-semibold leading-snug text-white xl:text-3xl">
              {q('text')}
            </blockquote>
            <figcaption className="mt-8 flex items-center gap-4">
              <Avatar src={AVATAR_FOR[variant]} alt={q('name')} size={52} ring />
              <div>
                <p className="font-semibold text-white">{q('name')}</p>
                <p className="text-sm text-white/70">{q('role')}</p>
                <Stars value={5} size={14} className="mt-1" />
              </div>
            </figcaption>
          </motion.figure>

          <motion.ul
            initial="hidden"
            animate="show"
            variants={{ hidden: {}, show: { transition: { staggerChildren: 0.1, delayChildren: 0.5 } } }}
            className="flex flex-wrap gap-3"
          >
            {stats.map(({ icon: Icon, value, label }) => (
              <motion.li
                key={label}
                variants={{ hidden: { opacity: 0, y: 12 }, show: { opacity: 1, y: 0, transition: { duration: 0.5, ease } } }}
                className="glass flex items-center gap-3 rounded-2xl px-4 py-3"
              >
                <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-accent/20 text-accent-light">
                  <Icon className="h-4 w-4" aria-hidden />
                </span>
                <span className="leading-tight">
                  <span className="num block font-bold text-white">{value}</span>
                  <span className="block text-xs text-white/70">{label}</span>
                </span>
              </motion.li>
            ))}
          </motion.ul>
        </div>
      </aside>

      {/* Form side */}
      <div className="relative flex min-h-screen flex-col overflow-hidden">
        <div className="pointer-events-none absolute -top-40 end-[-8rem] h-80 w-80 rounded-full bg-accent/10 blur-3xl" aria-hidden />

        <header className="relative z-10 flex items-center justify-between gap-3 px-4 py-5 sm:px-8">
          <div className="flex items-center gap-4">
            <Logo className="lg:hidden" />
            <Link
              to="/"
              className="group hidden items-center gap-2 rounded-lg text-sm font-semibold text-muted transition-colors hover:text-primary sm:inline-flex lg:inline-flex"
            >
              <ArrowLeft className="h-4 w-4 transition-transform group-hover:-translate-x-0.5 rtl:-scale-x-100 rtl:group-hover:translate-x-0.5" aria-hidden />
              {t('auth.layout.backHome')}
            </Link>
          </div>
          <LanguageSwitcher />
        </header>

        {/* Compact banner (mobile / tablet) */}
        <div className="relative z-10 mx-4 overflow-hidden rounded-2xl bg-primary sm:mx-8 lg:hidden">
          <SmartImage
            src={image}
            alt=""
            wrapperClassName="absolute inset-0"
            overlay="bg-gradient-to-r from-primary/95 to-primary/60 rtl:bg-gradient-to-l"
          />
          <div className="relative flex items-center gap-3 p-4">
            <Avatar src={AVATAR_FOR[variant]} alt={q('name')} size={40} ring />
            <p className="min-w-0 text-sm leading-snug text-white/90">
              <span className="line-clamp-2">{q('short')}</span>
              <span className="mt-0.5 block text-xs font-semibold text-accent-light">{q('name')}</span>
            </p>
          </div>
        </div>

        <main id="main" className="relative z-10 flex flex-1 items-center justify-center px-4 py-8 sm:px-8 sm:py-12">
          <div className="w-full max-w-md">
            {above}
            <motion.div
              initial={{ opacity: 0, y: 24 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, ease }}
              className="card p-6 sm:p-9"
            >
              {children}
            </motion.div>
            <Link
              to="/"
              className="mt-6 flex items-center justify-center gap-2 text-sm font-semibold text-muted hover:text-primary sm:hidden"
            >
              <ArrowLeft className="h-4 w-4 rtl:-scale-x-100" aria-hidden />
              {t('auth.layout.backHome')}
            </Link>
          </div>
        </main>

        <footer className="relative z-10 flex flex-wrap items-center justify-center gap-x-5 gap-y-2 px-4 pb-6 text-xs text-muted">
          <span>{t('auth.layout.rights', { year: new Date().getFullYear() })}</span>
          <Link to="/terms" className="hover:text-primary">
            {t('auth.layout.terms')}
          </Link>
          <Link to="/privacy" className="hover:text-primary">
            {t('auth.layout.privacy')}
          </Link>
        </footer>
      </div>
    </div>
  );
}

/** "Demo" helper box shown under auth forms. */
export function DemoHint({ children, action }: { children: ReactNode; action?: ReactNode }) {
  const { t } = useTranslation();
  return (
    <div className="mt-6 rounded-xl border border-dashed border-accent/50 bg-accent/5 p-4 text-sm">
      <p className="flex items-start gap-2 text-primary">
        <span className="mt-0.5 shrink-0 rounded-md bg-gold-grad px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-primary">
          {t('common.demoBadge')}
        </span>
        <span>{children}</span>
      </p>
      {action && <div className="mt-3">{action}</div>}
    </div>
  );
}

/** Two-step "Details → Verify" progress indicator. */
export function AuthSteps({ current }: { current: 1 | 2 }) {
  const { t } = useTranslation();
  const steps = [t('auth.steps.details'), t('auth.steps.verify')];
  return (
    <nav aria-label={t('auth.steps.label', { current, total: steps.length })} className="mb-6">
      <ol className="flex items-center gap-3">
        {steps.map((label, i) => {
          const n = i + 1;
          const done = n < current;
          const active = n === current;
          return (
            <li key={label} className="flex flex-1 items-center gap-3" aria-current={active ? 'step' : undefined}>
              <span
                className={
                  done || active
                    ? 'num flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary text-sm font-bold text-accent-light shadow-soft'
                    : 'num flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-primary/15 bg-white text-sm font-bold text-muted'
                }
              >
                {done ? <Check className="h-4 w-4" aria-hidden /> : n}
              </span>
              <span className={active || done ? 'text-sm font-semibold text-primary' : 'text-sm text-muted'}>{label}</span>
              {n < steps.length && (
                <span className="relative h-px flex-1 overflow-hidden bg-primary/10" aria-hidden>
                  <motion.span
                    className="absolute inset-y-0 start-0 bg-gold-grad"
                    initial={{ width: 0 }}
                    animate={{ width: done ? '100%' : '35%' }}
                    transition={{ duration: 0.8, ease }}
                  />
                </span>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
