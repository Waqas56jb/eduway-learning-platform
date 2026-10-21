import { Link, useLocation } from 'react-router-dom';
import { ChevronRight, Home } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { matchPage } from '@/routes/nav';

export interface Crumb {
  label: string;
  to?: string;
}

/** Breadcrumb trail. Without `items`, derives Home › Section › Page from the nav config. */
export function Breadcrumbs({ items, current }: { items?: Crumb[]; current?: string }) {
  const { t } = useTranslation();
  const { pathname } = useLocation();

  let crumbs: Crumb[] = items ?? [];
  if (!items) {
    const page = matchPage(pathname);
    if (page && page.path !== '/') {
      if (page.parentKey) crumbs.push({ label: t(`nav.${page.parentKey}`) });
      const isLeaf = pathname === page.path;
      crumbs.push({ label: t(`nav.${page.key}`), to: isLeaf ? undefined : page.path });
    }
    if (current) crumbs = [...crumbs, { label: current }];
  }

  return (
    <nav aria-label="Breadcrumb" className="mb-1.5">
      <ol className="flex flex-wrap items-center gap-1 text-xs text-muted">
        <li>
          <Link to="/" className="inline-flex items-center gap-1 transition hover:text-accent" aria-label={t('nav.home')}>
            <Home className="h-3.5 w-3.5" />
          </Link>
        </li>
        {crumbs.map((c, i) => (
          <li key={i} className="flex items-center gap-1">
            <ChevronRight className="h-3 w-3 opacity-50 flip-rtl" aria-hidden />
            {c.to ? (
              <Link to={c.to} className="transition hover:text-accent">
                {c.label}
              </Link>
            ) : (
              <span aria-current={i === crumbs.length - 1 ? 'page' : undefined} className={i === crumbs.length - 1 ? 'font-medium text-ink/80' : undefined}>
                {c.label}
              </span>
            )}
          </li>
        ))}
      </ol>
    </nav>
  );
}
