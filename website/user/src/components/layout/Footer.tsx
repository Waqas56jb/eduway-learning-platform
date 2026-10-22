import { Facebook, Instagram, Send, Youtube } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { Logo } from '@/components/ui';
import { useAppConfig } from '@/api/appSettings';
import { useSubjects } from '@/api/catalog';
import { useLang } from '@/hooks/useLang';
import { LanguageSwitcher } from './LanguageSwitcher';

function TikTok({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden>
      <path d="M16.6 5.82A4.28 4.28 0 0 1 15.54 3h-3.09v12.4a2.59 2.59 0 1 1-2.59-2.6c.27 0 .53.04.77.12V9.77a5.7 5.7 0 0 0-.77-.05 5.68 5.68 0 1 0 5.68 5.68V9.01a7.35 7.35 0 0 0 4.3 1.38V7.3a4.28 4.28 0 0 1-3.24-1.48Z" />
    </svg>
  );
}

function StoreBadge({ top, name, icon, href }: { top: string; name: string; icon: ReactNode; href?: string | null }) {
  return (
    <a
      href={href || '#'}
      onClick={(e) => !href && e.preventDefault()}
      target={href ? '_blank' : undefined}
      rel={href ? 'noopener noreferrer' : undefined}
      className="flex items-center gap-3 rounded-xl border border-white/15 bg-white/5 px-4 py-2.5 transition hover:border-accent/60 hover:bg-white/10"
    >
      {icon}
      <span className="leading-tight">
        <span className="block text-[10px] text-white/60">{top}</span>
        <span className="block text-sm font-semibold text-white">{name}</span>
      </span>
    </a>
  );
}

export function Footer() {
  const { t } = useTranslation();
  const { l } = useLang();
  const { data: subjects = [] } = useSubjects();
  const { data: config } = useAppConfig();
  const year = new Date().getFullYear();

  const cols = [
    {
      title: t('footer.columns.about'),
      links: [
        { to: '/about', label: t('footer.links.ourStory') },
        { to: '/about#teachers', label: t('footer.links.teachers') },
        { to: '/about', label: t('footer.links.careers') },
        { to: '/contact', label: t('footer.links.press') },
      ],
    },
    {
      title: t('footer.columns.subjects'),
      links: subjects.map((s) => ({ to: '/#subjects', label: l(s.name) })),
    },
    {
      title: t('footer.columns.support'),
      links: [
        { to: '/contact', label: t('footer.links.help') },
        { to: '/contact', label: t('footer.links.contact') },
        { to: '/#faq', label: t('footer.links.faq') },
        { to: '/contact', label: t('footer.links.status') },
      ],
    },
    {
      title: t('footer.columns.legal'),
      links: [
        { to: '/terms', label: t('footer.links.terms') },
        { to: '/privacy', label: t('footer.links.privacy') },
        { to: '/terms#refunds', label: t('footer.links.refund') },
        { to: '/privacy#cookies', label: t('footer.links.cookies') },
      ],
    },
  ];

  const social = config?.social;
  const socials = [
    { name: 'Instagram', icon: Instagram, href: social?.instagram },
    { name: 'Facebook', icon: Facebook, href: social?.facebook },
    { name: 'YouTube', icon: Youtube, href: social?.youtube },
    { name: 'Telegram', icon: Send, href: social?.telegram },
    { name: 'TikTok', icon: TikTok, href: social?.tiktok },
  ];

  return (
    <footer className="relative overflow-hidden bg-primary text-white">
      <div
        className="pointer-events-none absolute -top-40 start-1/2 h-80 w-[40rem] -translate-x-1/2 rounded-full bg-accent/10 blur-3xl"
        aria-hidden
      />
      <div
        className="h-px w-full bg-gradient-to-r from-transparent via-accent/60 to-transparent"
        aria-hidden
      />
      <div className="container relative py-16 md:py-20">
        <div className="grid gap-12 lg:grid-cols-12">
          <div className="lg:col-span-4">
            <Logo light />
            <p className="mt-5 max-w-sm text-sm leading-relaxed text-white/65">
              {t('footer.about')}
            </p>
            <ul className="mt-6 flex gap-2">
              {socials.map(({ name, icon: Icon, href }) => (
                <li key={name}>
                  <a
                    href={href || '#'}
                    onClick={(e) => !href && e.preventDefault()}
                    target={href ? '_blank' : undefined}
                    rel={href ? 'noopener noreferrer' : undefined}
                    aria-label={t('footer.social', { network: name })}
                    className="flex h-10 w-10 items-center justify-center rounded-full border border-white/15 text-white/75 transition hover:-translate-y-0.5 hover:border-accent hover:bg-accent hover:text-primary"
                  >
                    <Icon className="h-4 w-4" />
                  </a>
                </li>
              ))}
            </ul>
          </div>
          <div className="grid grid-cols-2 gap-8 sm:grid-cols-4 lg:col-span-8">
            {cols.map((c) => (
              <div key={c.title}>
                <h3 className="font-sans text-sm font-bold uppercase tracking-wider text-accent rtl:tracking-normal">
                  {c.title}
                </h3>
                <ul className="mt-4 space-y-2.5">
                  {c.links.map((lnk, i) => (
                    <li key={i}>
                      <Link
                        to={lnk.to}
                        className="text-sm text-white/65 transition hover:text-white"
                      >
                        {lnk.label}
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>

        <div className="mt-14 flex flex-col gap-6 border-t border-white/10 pt-8 md:flex-row md:items-center md:justify-between">
          <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
            <span className="me-1 text-sm font-semibold text-white/80">
              {t('footer.downloadApp')}
            </span>
            <div className="flex flex-wrap gap-3">
              <StoreBadge
                top={t('footer.appStore')}
                name={t('footer.appStoreName')}
                href={config?.appLinks.appStore}
                icon={
                  <svg viewBox="0 0 24 24" className="h-6 w-6 fill-white" aria-hidden>
                    <path d="M16.37 12.6c-.02-2.3 1.88-3.4 1.96-3.46-1.07-1.56-2.73-1.78-3.32-1.8-1.41-.14-2.76.83-3.48.83-.72 0-1.83-.81-3-.79-1.55.02-2.97.9-3.77 2.28-1.6 2.78-.41 6.9 1.15 9.15.76 1.1 1.67 2.34 2.86 2.3 1.15-.05 1.58-.74 2.97-.74 1.38 0 1.77.74 2.98.72 1.23-.02 2.01-1.12 2.76-2.23.87-1.28 1.23-2.52 1.25-2.58-.03-.01-2.4-.92-2.42-3.65zM14.1 5.86c.63-.77 1.06-1.83.94-2.89-.91.04-2.01.61-2.66 1.37-.58.67-1.09 1.75-.96 2.79 1.02.08 2.05-.52 2.68-1.27z" />
                  </svg>
                }
              />
              <StoreBadge
                top={t('footer.googlePlay')}
                name={t('footer.googlePlayName')}
                href={config?.appLinks.googlePlay}
                icon={
                  <svg viewBox="0 0 24 24" className="h-6 w-6" aria-hidden>
                    <path
                      d="M3.6 2.3 13.5 12l-9.9 9.7c-.4-.2-.6-.6-.6-1.1V3.4c0-.5.2-.9.6-1.1Z"
                      fill="#34A853"
                    />
                    <path d="m16.8 8.7-3.3 3.3-9.9-9.7c.2-.1.5-.1.8 0l12.4 6.4Z" fill="#FBBC04" />
                    <path d="m16.8 15.3-12.4 6.4c-.3.1-.6.1-.8 0l9.9-9.7 3.3 3.3Z" fill="#EA4335" />
                    <path
                      d="m20.4 13.2-3.6 2.1-3.3-3.3 3.3-3.3 3.6 2.1c.8.5.8 1.9 0 2.4Z"
                      fill="#4285F4"
                    />
                  </svg>
                }
              />
            </div>
          </div>
          <LanguageSwitcher tone="light" className="self-start md:self-auto" />
        </div>

        <div className="mt-8 flex flex-col gap-2 text-xs text-white/45 sm:flex-row sm:justify-between">
          <p>{t('footer.rights', { year })}</p>
          <p>{t('footer.madeIn')}</p>
        </div>
      </div>
    </footer>
  );
}
