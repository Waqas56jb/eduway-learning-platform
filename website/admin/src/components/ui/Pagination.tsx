import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { cn } from '@/utils/cn';
import { fmtNumber } from '@/utils/format';

interface PaginationProps {
  page: number; // 0-based
  pageSize: number;
  total: number;
  onPage: (p: number) => void;
  onPageSize?: (s: number) => void;
  sizes?: number[];
  className?: string;
}

export function Pagination({ page, pageSize, total, onPage, onPageSize, sizes = [10, 25, 50, 100], className }: PaginationProps) {
  const { t } = useTranslation();
  const pages = Math.max(1, Math.ceil(total / pageSize));
  const from = total === 0 ? 0 : page * pageSize + 1;
  const to = Math.min(total, (page + 1) * pageSize);
  const btn =
    'grid h-8 w-8 place-items-center rounded-md border border-line bg-surface text-muted transition hover:border-accent/60 hover:text-ink disabled:pointer-events-none disabled:opacity-40';

  // Compact page list: first, last, current ±1
  const list: (number | '…')[] = [];
  for (let i = 0; i < pages; i++) {
    if (i === 0 || i === pages - 1 || Math.abs(i - page) <= 1) list.push(i);
    else if (list[list.length - 1] !== '…') list.push('…');
  }

  return (
    <div className={cn('flex flex-wrap items-center justify-between gap-3 px-4 py-3 text-xs text-muted', className)}>
      <div className="flex items-center gap-3">
        <span className="num">
          {t('common.showing', { from: fmtNumber(from), to: fmtNumber(to), total: fmtNumber(total) })}
        </span>
        {onPageSize && (
          <label className="hidden items-center gap-2 sm:flex">
            <span>{t('common.perPage')}</span>
            <select
              value={pageSize}
              onChange={(e) => onPageSize(Number(e.target.value))}
              className="h-8 rounded-md border border-line bg-surface px-2 text-xs text-ink focus:border-accent focus:outline-none"
            >
              {sizes.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </label>
        )}
      </div>
      <nav className="flex items-center gap-1" aria-label="Pagination">
        <button className={btn} onClick={() => onPage(0)} disabled={page === 0} aria-label={t('table.firstPage')}>
          <ChevronsLeft className="h-4 w-4 flip-rtl" />
        </button>
        <button className={btn} onClick={() => onPage(page - 1)} disabled={page === 0} aria-label={t('actions.previous')}>
          <ChevronLeft className="h-4 w-4 flip-rtl" />
        </button>
        {list.map((p, i) =>
          p === '…' ? (
            <span key={`e${i}`} className="px-1">
              …
            </span>
          ) : (
            <button
              key={p}
              onClick={() => onPage(p)}
              aria-current={p === page ? 'page' : undefined}
              className={cn(btn, 'w-auto min-w-8 px-2 num', p === page && 'border-accent bg-accent/10 font-semibold text-primary')}
            >
              {p + 1}
            </button>
          ),
        )}
        <button className={btn} onClick={() => onPage(page + 1)} disabled={page >= pages - 1} aria-label={t('actions.next')}>
          <ChevronRight className="h-4 w-4 flip-rtl" />
        </button>
        <button className={btn} onClick={() => onPage(pages - 1)} disabled={page >= pages - 1} aria-label={t('table.lastPage')}>
          <ChevronsRight className="h-4 w-4 flip-rtl" />
        </button>
      </nav>
    </div>
  );
}
