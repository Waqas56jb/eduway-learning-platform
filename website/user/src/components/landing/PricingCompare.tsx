import { Check, Crown, Minus, MoveHorizontal } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { usePackages } from '@/api/packages';
import { Reveal, SectionHeading, Skeleton } from '@/components/ui';
import { useLang } from '@/hooks/useLang';
import { cn } from '@/lib/utils';
import type { Package } from '@/types';

/** A cell is either a yes/no flag, a number, or a translation key under `pricingPage.compare.values`. */
type Cell = boolean | number | { key: string };

const unlimited = { key: 'unlimited' };

/** Comparison rows, each resolving a value per package from the admin-managed `comparison` block (PAY-01). */
const ROWS: { key: string; value: (p: Package) => Cell }[] = [
  { key: 'subjects', value: (p) => p.comparison?.subjectsCount ?? p.subjects.length },
  { key: 'lessons', value: (p) => p.comparison?.lessons ?? true },
  { key: 'quizzes', value: (p) => p.comparison?.quizzes ?? true },
  {
    key: 'bank',
    value: (p) =>
      p.comparison?.questionBank === 'subject' ? { key: 'subjectBank' } : p.comparison?.questionBank === 'unlimited' ? unlimited : { key: 'fullBank' },
  },
  { key: 'mistakes', value: (p) => p.comparison?.mistakes ?? true },
  { key: 'simulator', value: (p) => (p.comparison?.examSimulator === 'unlimited' ? unlimited : !!p.comparison?.examSimulator) },
  { key: 'ai', value: (p) => p.comparison?.aiQuota ?? p.aiQuota },
  { key: 'pdf', value: (p) => !!p.comparison?.pdfResources },
  { key: 'analytics', value: (p) => !!p.comparison?.analytics },
  { key: 'devices', value: (p) => (p.comparison?.devices ? p.comparison.devices : true) },
  { key: 'support', value: (p) => !!p.comparison?.prioritySupport },
];

export function PricingCompare() {
  const { t } = useTranslation();
  const { l, fmtNumber } = useLang();
  const { data: packages = [], isLoading } = usePackages();

  const renderCell = (cell: Cell, popular: boolean) => {
    if (cell === true)
      return (
        <span className={cn('inline-flex h-7 w-7 items-center justify-center rounded-full', popular ? 'bg-accent text-primary' : 'bg-accent/15 text-accent')}>
          <Check className="h-4 w-4" strokeWidth={3} aria-hidden />
          <span className="sr-only">{t('pricingPage.compare.included')}</span>
        </span>
      );
    if (cell === false)
      return (
        <span className="inline-flex h-7 w-7 items-center justify-center text-primary/25">
          <Minus className="h-4 w-4" aria-hidden />
          <span className="sr-only">{t('pricingPage.compare.notIncluded')}</span>
        </span>
      );
    if (typeof cell === 'number') return <span className="num font-bold text-primary">{fmtNumber(cell)}</span>;
    return <span className="text-sm font-semibold text-primary">{t(`pricingPage.compare.values.${cell.key}`)}</span>;
  };

  return (
    <section className="section bg-white">
      <div className="container">
        <SectionHeading
          eyebrow={t('pricingPage.compare.eyebrow')}
          title={t('pricingPage.compare.title')}
          subtitle={t('pricingPage.compare.subtitle')}
        />

        <Reveal className="mx-auto mt-12 max-w-5xl">
          <p className="mb-3 flex items-center justify-center gap-2 text-xs text-muted md:hidden">
            <MoveHorizontal className="h-4 w-4 text-accent" aria-hidden />
            {t('pricingPage.compare.scrollHint')}
          </p>
          {isLoading && <Skeleton className="h-[560px] rounded-3xl" />}
          <div hidden={isLoading} className="relative overflow-x-auto rounded-3xl border border-primary/[0.07] bg-white shadow-soft scrollbar-none">
            <table className="w-full min-w-[640px] border-collapse text-start">
              <caption className="sr-only">{t('pricingPage.compare.caption')}</caption>
              <thead>
                <tr>
                  <th
                    scope="col"
                    className="sticky start-0 z-10 w-[38%] bg-white px-5 py-6 text-start text-xs font-semibold uppercase tracking-wider text-muted rtl:tracking-normal md:px-7"
                  >
                    {t('pricingPage.compare.feature')}
                  </th>
                  {packages.map((p) => (
                    <th
                      key={p.id}
                      scope="col"
                      className={cn('px-4 py-6 text-center align-bottom', p.popular && 'bg-primary text-white')}
                    >
                      {p.popular && (
                        <span className="mb-2 inline-flex items-center gap-1 rounded-full bg-gold-grad px-2.5 py-0.5 text-[11px] font-bold text-primary">
                          <Crown className="h-3 w-3" aria-hidden />
                          {t('landing.pricing.mostPopular')}
                        </span>
                      )}
                      <span className={cn('block font-display text-lg font-bold', p.popular ? 'text-white' : 'text-primary')}>
                        {l(p.name)}
                      </span>
                      <span className={cn('num mt-1 block text-xs font-medium', p.popular ? 'text-accent-light' : 'text-muted')}>
                        {fmtNumber(p.priceMonthly)} {t('common.currency')} {t('common.perMonth')}
                      </span>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {ROWS.map((row, ri) => (
                  <tr key={row.key} className="group">
                    <th
                      scope="row"
                      className={cn(
                        'sticky start-0 z-10 border-t border-primary/5 px-5 py-4 text-start text-sm font-medium text-ink/85 md:px-7',
                        ri % 2 ? 'bg-white' : 'bg-cream',
                      )}
                    >
                      {t(`pricingPage.compare.rows.${row.key}`)}
                    </th>
                    {packages.map((p) => (
                      <td
                        key={p.id}
                        className={cn(
                          'border-t px-4 py-4 text-center',
                          p.popular ? 'border-primary/5 bg-accent/[0.07]' : 'border-primary/5',
                          !p.popular && (ri % 2 ? 'bg-white' : 'bg-cream/60'),
                        )}
                      >
                        {renderCell(row.value(p), !!p.popular)}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Reveal>
      </div>
    </section>
  );
}
