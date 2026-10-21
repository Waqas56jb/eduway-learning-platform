import type { ReactNode } from 'react';
import { Helmet } from 'react-helmet-async';
import { motion } from 'framer-motion';
import { ShieldCheck } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { IMAGES } from '@/utils/images';
import { Logo } from '@/components/layout/Logo';
import { LanguageSwitcher } from '@/components/layout/LanguageSwitcher';
import { Img } from '@/components/ui/Avatar';

/** Split auth layout: brand image panel + form card. */
export function AuthShell({ title, children }: { title: string; children: ReactNode }) {
  const { t } = useTranslation();
  const stats: [string, string][] = [
    ['18.4K', t('auth.heroStat1')],
    ['1,240', t('auth.heroStat2')],
    ['99.98%', t('auth.heroStat3')],
  ];
  return (
    <div className="flex min-h-screen bg-app">
      <Helmet>
        <title>{`${title} · ${t('app.name')} ${t('app.admin')}`}</title>
      </Helmet>

      {/* Image panel */}
      <div className="relative hidden w-[52%] overflow-hidden lg:block">
        <Img src={IMAGES.login} alt="" className="absolute inset-0 h-full w-full" />
        <div className="absolute inset-0 bg-gradient-to-br from-[#0B1F3A]/95 via-[#0B1F3A]/85 to-[#15325C]/75" />
        <div className="absolute inset-0 bg-[radial-gradient(70%_50%_at_20%_10%,rgba(201,162,74,0.22),transparent_70%)]" />
        <div className="relative flex h-full flex-col justify-between p-12 text-white xl:p-16">
          <Logo />
          <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }} className="max-w-lg">
            <div className="mb-5 h-1 w-14 rounded-full bg-gold-grad" />
            <h2 className="font-display text-4xl font-bold leading-tight xl:text-5xl">{t('auth.heroTitle')}</h2>
            <p className="mt-5 text-base leading-relaxed text-white/70">{t('auth.heroSub')}</p>
            <dl className="mt-10 grid grid-cols-3 gap-6 border-t border-white/10 pt-8">
              {stats.map(([v, l]) => (
                <div key={l}>
                  <dt className="sr-only">{l}</dt>
                  <dd className="kpi-num bg-gold-grad bg-clip-text text-3xl text-transparent" dir="ltr">
                    {v}
                  </dd>
                  <dd className="mt-1 text-xs text-white/60">{l}</dd>
                </div>
              ))}
            </dl>
          </motion.div>
          <p className="text-xs text-white/40">{t('app.copyright')}</p>
        </div>
      </div>

      {/* Form panel */}
      <div className="relative flex flex-1 flex-col">
        <div className="flex items-center justify-between p-6 lg:justify-end">
          <span className="rounded-xl bg-[#0B1F3A] p-1.5 pe-3 lg:hidden">
            <Logo admin={false} />
          </span>
          <LanguageSwitcher />
        </div>
        <div className="flex flex-1 items-center justify-center px-4 pb-12">
          <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35 }} className="w-full max-w-[420px]">
            <div className="card p-8 shadow-soft">{children}</div>
            <p className="mt-6 flex items-center justify-center gap-1.5 text-xs text-muted">
              <ShieldCheck className="h-3.5 w-3.5 text-success" /> {t('auth.secureNote')}
            </p>
          </motion.div>
        </div>
      </div>
    </div>
  );
}
