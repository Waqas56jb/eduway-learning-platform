import { useTranslation } from 'react-i18next';
import { cn } from '@/utils/cn';

/** EN | ع toggle. Changing language flips document dir, lang and font (see i18n/index.ts). */
export function LanguageSwitcher({ className, onDark }: { className?: string; onDark?: boolean }) {
  const { i18n, t } = useTranslation();
  const lang = i18n.language === 'ar' ? 'ar' : 'en';
  const opt = (l: 'en' | 'ar', label: string, aria: string) => (
    <button
      type="button"
      role="radio"
      aria-checked={lang === l}
      aria-label={aria}
      onClick={() => i18n.changeLanguage(l)}
      className={cn(
        'h-7 min-w-8 rounded-md px-2 text-xs font-semibold transition-all duration-200',
        lang === l
          ? onDark
            ? 'bg-white/15 text-white'
            : 'bg-surface text-primary shadow-sm ring-1 ring-line'
          : onDark
            ? 'text-white/60 hover:text-white'
            : 'text-muted hover:text-ink',
        l === 'ar' && 'font-[Tajawal] text-sm',
      )}
    >
      {label}
    </button>
  );
  return (
    <div role="radiogroup" aria-label={t('common.language')} className={cn('inline-flex items-center rounded-lg p-0.5', onDark ? 'bg-white/10' : 'border border-line bg-surface-2', className)}>
      {opt('en', 'EN', t('common.english'))}
      {opt('ar', 'ع', t('common.arabic'))}
    </div>
  );
}
