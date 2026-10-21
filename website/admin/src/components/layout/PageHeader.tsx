import type { ReactNode } from 'react';
import { Helmet } from 'react-helmet-async';
import { useTranslation } from 'react-i18next';
import { cn } from '@/utils/cn';
import { Breadcrumbs, type Crumb } from './Breadcrumbs';

interface PageHeaderProps {
  title: string;
  subtitle?: ReactNode;
  /** Primary/secondary action buttons. */
  actions?: ReactNode;
  /** Explicit breadcrumb trail; otherwise derived from the nav config. */
  breadcrumbs?: Crumb[];
  /** Label for a detail page appended after the derived trail (e.g. a student's name). */
  current?: string;
  /** Extra content under the title row (badges, meta). */
  meta?: ReactNode;
  className?: string;
}

/** Page title block + document <title>. Every page starts with one. */
export function PageHeader({ title, subtitle, actions, breadcrumbs, current, meta, className }: PageHeaderProps) {
  const { t } = useTranslation();
  return (
    <header className={cn('mb-6 flex flex-col gap-4 md:flex-row md:items-end md:justify-between', className)}>
      <Helmet>
        <title>{`${title} · ${t('app.name')} ${t('app.admin')}`}</title>
      </Helmet>
      <div className="min-w-0">
        <Breadcrumbs items={breadcrumbs} current={current} />
        <h1 className="page-title">{title}</h1>
        {subtitle && <p className="mt-1 max-w-3xl text-sm text-muted">{subtitle}</p>}
        {meta && <div className="mt-2 flex flex-wrap items-center gap-2">{meta}</div>}
      </div>
      {actions && <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
    </header>
  );
}
