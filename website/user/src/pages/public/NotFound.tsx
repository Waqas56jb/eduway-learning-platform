import { motion } from 'framer-motion';
import { ArrowLeft, Compass, LayoutDashboard, LogIn } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Link, useLocation } from 'react-router-dom';
import { Button, Seo } from '@/components/ui';
import { useAuth } from '@/hooks/useAuth';

const LINKS = [
  { to: '/pricing', key: 'pricing' },
  { to: '/about', key: 'about' },
  { to: '/contact', key: 'contact' },
] as const;

export default function NotFound() {
  const { t } = useTranslation();
  const { isAuthenticated } = useAuth();
  const { pathname } = useLocation();

  return (
    <section className="relative flex min-h-[85vh] items-center overflow-hidden pb-20 pt-32 md:pt-36">
      <Seo title={t('pages.notFound.seoTitle')} description={t('notFound.body')} />
      <div className="pointer-events-none absolute start-1/2 top-1/3 h-[28rem] w-[28rem] -translate-x-1/2 rounded-full bg-accent/15 blur-3xl rtl:translate-x-1/2" aria-hidden />
      <div
        className="pointer-events-none absolute inset-0 opacity-[0.35]"
        style={{
          backgroundImage: 'radial-gradient(rgba(11,31,58,0.12) 1px, transparent 1px)',
          backgroundSize: '22px 22px',
          maskImage: 'radial-gradient(ellipse at center, black 30%, transparent 70%)',
          WebkitMaskImage: 'radial-gradient(ellipse at center, black 30%, transparent 70%)',
        }}
        aria-hidden
      />

      <div className="container relative text-center">
        <motion.p
          initial={{ opacity: 0, y: 30, scale: 0.95 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1] }}
          className="num select-none text-[8rem] font-bold leading-none text-gold-grad sm:text-[11rem] md:text-[14rem]"
          style={{ fontFamily: "'Playfair Display', Georgia, serif" }}
          dir="ltr"
          aria-hidden
        >
          404
        </motion.p>
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, delay: 0.15, ease: [0.22, 1, 0.36, 1] }}
        >
          <span className="eyebrow">
            <Compass className="h-3.5 w-3.5" aria-hidden />
            {t('pages.notFound.eyebrow')}
          </span>
          <h1 className="mt-5 text-3xl font-bold text-primary md:text-5xl">{t('notFound.title')}</h1>
          <p className="mx-auto mt-4 text-lg text-muted">{t('notFound.body')}</p>
          <p className="mx-auto mt-3 max-w-full truncate text-sm text-muted">
            <span>{t('pages.notFound.requested')}</span>{' '}
            <code dir="ltr" className="rounded-md bg-primary/5 px-2 py-0.5 text-primary">
              {pathname}
            </code>
          </p>

          <div className="mt-10 flex flex-wrap justify-center gap-3">
            <Button to="/" variant="primary" size="lg" leftIcon={<ArrowLeft className="h-5 w-5 rtl:-scale-x-100" aria-hidden />}>
              {t('notFound.cta')}
            </Button>
            {isAuthenticated ? (
              <Button to="/student/dashboard" variant="outline" size="lg" leftIcon={<LayoutDashboard className="h-5 w-5" aria-hidden />}>
                {t('nav.dashboard')}
              </Button>
            ) : (
              <Button to="/login" variant="outline" size="lg" leftIcon={<LogIn className="h-5 w-5" aria-hidden />}>
                {t('nav.login')}
              </Button>
            )}
          </div>

          <nav aria-label={t('pages.notFound.helpful')} className="mt-12">
            <p className="mx-auto text-sm font-semibold text-primary">{t('pages.notFound.helpful')}</p>
            <ul className="mt-4 flex flex-wrap justify-center gap-2">
              {LINKS.map((x) => (
                <li key={x.key}>
                  <Link
                    to={x.to}
                    className="inline-flex rounded-full border border-primary/10 bg-white px-4 py-2 text-sm font-medium text-primary shadow-soft transition hover:border-accent hover:text-accent"
                  >
                    {t(`nav.${x.key}`)}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
        </motion.div>
      </div>
    </section>
  );
}
