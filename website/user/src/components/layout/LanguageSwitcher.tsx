import { motion } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import { useLang } from '@/hooks/useLang';
import { cn } from '@/lib/utils';
import type { Lang } from '@/types';

/** Segmented EN | ع switch. `tone="light"` for navy/transparent backgrounds. */
export function LanguageSwitcher({ tone = 'dark', className }: { tone?: 'dark' | 'light'; className?: string }) {
  const { t } = useTranslation();
  const { lang, setLang } = useLang();
  const opts: { id: Lang; label: string; name: string }[] = [
    { id: 'en', label: t('lang.en'), name: t('lang.english') },
    { id: 'ar', label: t('lang.ar'), name: t('lang.arabic') },
  ];
  return (
    <div
      role="group"
      aria-label={t('lang.label')}
      dir="ltr"
      className={cn(
        'relative inline-flex items-center rounded-full p-1 text-sm font-semibold',
        tone === 'light' ? 'bg-white/10 ring-1 ring-white/20 backdrop-blur' : 'bg-primary/5 ring-1 ring-primary/10',
        className,
      )}
    >
      {opts.map((o) => {
        const active = o.id === lang;
        return (
          <button
            key={o.id}
            type="button"
            onClick={() => setLang(o.id)}
            aria-pressed={active}
            aria-label={t('lang.switchTo', { lang: o.name })}
            lang={o.id}
            className={cn(
              'relative z-10 flex h-8 min-w-[2.5rem] items-center justify-center rounded-full px-3 transition-colors',
              active ? 'text-primary' : tone === 'light' ? 'text-white/80 hover:text-white' : 'text-muted hover:text-primary',
              o.id === 'ar' && 'font-[Tajawal] text-base',
            )}
          >
            {active && (
              <motion.span
                layoutId={`lang-pill-${tone}`}
                className={cn('absolute inset-0 -z-10 rounded-full', tone === 'light' ? 'bg-gold-grad' : 'bg-white shadow-soft')}
                transition={{ type: 'spring', stiffness: 450, damping: 34 }}
              />
            )}
            {o.label}
          </button>
        );
      })}
    </div>
  );
}
