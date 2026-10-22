import { motion } from 'framer-motion';
import { Mail, Phone, RotateCw, Wrench } from 'lucide-react';
import { useEffect, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { useLocation } from 'react-router-dom';
import { useAppConfig } from '@/api/appSettings';
import { apiEvents } from '@/api/events';
import type { Localized } from '@/api/types';
import { LanguageSwitcher } from '@/components/layout/LanguageSwitcher';
import { Button, Logo, Seo } from '@/components/ui';
import { useLang } from '@/hooks/useLang';

/** Routes that need the API to work — they get the full maintenance screen. */
const APP_ROUTES = ['/student', '/login', '/register', '/verify-otp'];

/**
 * Maintenance mode from `/public/app-config` (`maintenance.enabled`) or from any API call answering
 * 403 `MAINTENANCE`. The student area + auth pages are replaced by a maintenance screen; marketing
 * pages stay readable with a banner.
 */
export function MaintenanceGate({ children }: { children: ReactNode }) {
  const { pathname } = useLocation();
  const config = useAppConfig();
  const [forced, setForced] = useState<{ message: Localized | null } | null>(null);

  const { refetch } = config;
  useEffect(
    () =>
      apiEvents.on('maintenance', (p) => {
        setForced({ message: p.message });
        void refetch();
      }),
    [refetch],
  );

  // A fresh config that says "off" clears a maintenance state raised by an API error.
  useEffect(() => {
    if (config.data && !config.data.maintenance.enabled && config.dataUpdatedAt > 0) setForced(null);
  }, [config.data, config.dataUpdatedAt]);

  const enabled = !!config.data?.maintenance.enabled || !!forced;
  const message = forced?.message ?? config.data?.maintenance.message ?? null;
  if (!enabled) return <>{children}</>;

  const isAppRoute = APP_ROUTES.some((r) => pathname === r || pathname.startsWith(`${r}/`));
  if (isAppRoute) return <MaintenanceScreen message={message} onRetry={() => void config.refetch()} retrying={config.isFetching} />;

  return (
    <>
      <MaintenanceBanner message={message} />
      {children}
    </>
  );
}

function MaintenanceBanner({ message }: { message: Localized | null }) {
  const { t } = useTranslation();
  const { l } = useLang();
  return (
    <div role="status" className="fixed inset-x-0 top-0 z-[150] flex items-center justify-center gap-2 bg-accent px-4 py-2 text-center text-sm font-semibold text-primary">
      <Wrench className="h-4 w-4 shrink-0" aria-hidden />
      <span>{message && l(message) ? l(message) : t('system.maintenance.banner')}</span>
    </div>
  );
}

export function MaintenanceScreen({ message, onRetry, retrying }: { message: Localized | null; onRetry: () => void; retrying?: boolean }) {
  const { t } = useTranslation();
  const { l } = useLang();
  const { data: config } = useAppConfig();
  const support = config?.support;

  return (
    <div className="relative isolate flex min-h-screen flex-col overflow-hidden bg-navy-grad text-white">
      <Seo title={t('system.maintenance.title')} />
      <div className="absolute -top-32 end-[10%] -z-10 h-[28rem] w-[28rem] rounded-full bg-accent/20 blur-3xl" aria-hidden />
      <div className="absolute -bottom-40 start-[-10%] -z-10 h-[24rem] w-[24rem] rounded-full bg-accent/10 blur-3xl" aria-hidden />
      <header className="flex items-center justify-between px-6 py-6 sm:px-10">
        <Logo light />
        <LanguageSwitcher tone="light" />
      </header>
      <main id="main" className="flex flex-1 items-center justify-center px-6 pb-16">
        <motion.div
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
          className="max-w-xl text-center"
          role="alert"
        >
          <motion.span
            className="mx-auto flex h-20 w-20 items-center justify-center rounded-3xl bg-gold-grad text-primary shadow-glow"
            animate={{ rotate: [0, -12, 10, -6, 0] }}
            transition={{ duration: 2.4, repeat: Infinity, repeatDelay: 2 }}
          >
            <Wrench className="h-9 w-9" aria-hidden />
          </motion.span>
          <h1 className="mt-8 text-4xl font-bold text-white md:text-5xl">{t('system.maintenance.title')}</h1>
          <p className="mt-4 text-lg leading-relaxed text-white/75">
            {message && l(message) ? l(message) : t('system.maintenance.body')}
          </p>
          <Button
            variant="gold"
            size="lg"
            className="mt-8"
            loading={retrying}
            onClick={onRetry}
            leftIcon={<RotateCw className="h-4 w-4" aria-hidden />}
          >
            {t('system.maintenance.retry')}
          </Button>
          {support && (support.email || support.phone) && (
            <div className="mt-10 flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-sm text-white/70">
              <span>{t('system.maintenance.contact')}</span>
              {support.email && (
                <a href={`mailto:${support.email}`} className="inline-flex items-center gap-1.5 hover:text-accent-light">
                  <Mail className="h-4 w-4" aria-hidden />
                  {support.email}
                </a>
              )}
              {support.phone && (
                <a href={`tel:${support.phone.replace(/\s+/g, '')}`} className="inline-flex items-center gap-1.5 hover:text-accent-light" dir="ltr">
                  <Phone className="h-4 w-4" aria-hidden />
                  <span className="num">{support.phone}</span>
                </a>
              )}
            </div>
          )}
        </motion.div>
      </main>
    </div>
  );
}
