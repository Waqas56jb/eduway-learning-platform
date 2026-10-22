import { motion } from 'framer-motion';
import { SearchX } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { CourseCard } from '@/components/student/CourseCard';
import { useSubjects } from '@/api/catalog';
import type { SubjectSummary } from '@/api/types';
import { Button, EmptyState, ErrorState, PageHeader, ProgressRing, Seo, SkeletonCard } from '@/components/ui';
import { useProgress } from '@/hooks/useProgress';
import { cn } from '@/lib/utils';

type Filter = 'all' | 'progress' | 'completed';
const FILTERS: Filter[] = ['all', 'progress', 'completed'];

export default function Subjects() {
  const { t } = useTranslation();
  // CAT-01 (authenticated: includes `locked` + `progress`), PRG-06 for the overall ring.
  const { data: subjects = [], isLoading, isError, refetch } = useSubjects();
  const { overallPct, completedLessons, totalLessons } = useProgress();
  const ready = !isLoading;
  const [filter, setFilter] = useState<Filter>('all');
  const progressOf = (s: SubjectSummary) => s.progress ?? { completed: 0, total: s.lessonsCount, pct: 0, avgPct: 0 };

  const visible = subjects.filter((s) => {
    const p = progressOf(s).pct;
    if (filter === 'progress') return p > 0 && p < 100;
    if (filter === 'completed') return p >= 100;
    return true;
  });

  const counts: Record<Filter, number> = {
    all: subjects.length,
    progress: subjects.filter((s) => progressOf(s).pct > 0 && progressOf(s).pct < 100).length,
    completed: subjects.filter((s) => progressOf(s).pct >= 100).length,
  };

  return (
    <>
      <Seo title={t('learn.subjects.seoTitle')} description={t('learn.subjects.seoDescription')} />
      <PageHeader
        title={t('learn.subjects.title')}
        subtitle={t('learn.subjects.subtitle')}
        actions={
          <div className="card flex items-center gap-3 px-4 py-2.5">
            <ProgressRing value={overallPct} size={44} stroke={5} label={t('learn.subjects.overall')}>
              <span className="text-[11px] font-bold text-primary num">{overallPct}%</span>
            </ProgressRing>
            <div className="text-sm">
              <p className="font-semibold text-primary">{t('learn.subjects.overall')}</p>
              <p className="text-xs text-muted num">{t('learn.card.lessonsDone', { done: completedLessons, total: totalLessons })}</p>
            </div>
          </div>
        }
      />

      <div
        className="scrollbar-none -mx-4 mb-6 flex gap-2 overflow-x-auto px-4 py-1 sm:mx-0 sm:flex-wrap sm:px-0"
        role="group"
        aria-label={t('common.filter')}
      >
        {FILTERS.map((f) => (
          <button
            key={f}
            type="button"
            onClick={() => setFilter(f)}
            aria-pressed={filter === f}
            className={cn(
              'flex shrink-0 items-center gap-2 whitespace-nowrap rounded-full px-4 py-2 text-sm font-semibold transition-all duration-200',
              filter === f ? 'bg-primary text-white shadow-soft' : 'bg-white text-muted ring-1 ring-primary/10 hover:text-primary hover:ring-accent/50',
            )}
          >
            {t(`learn.subjects.filters.${f}`)}
            <span className={cn('rounded-full px-1.5 text-[11px] num', filter === f ? 'bg-white/15' : 'bg-primary/5')}>
              {counts[f]}
            </span>
          </button>
        ))}
      </div>

      {isError ? (
        <ErrorState onRetry={() => void refetch()} />
      ) : !ready ? (
        <div className="grid gap-6 sm:grid-cols-2 xl:grid-cols-3" aria-busy="true">
          {Array.from({ length: 5 }).map((_, i) => (
            <SkeletonCard key={i} lines={3} />
          ))}
        </div>
      ) : visible.length === 0 ? (
        <EmptyState
          icon={<SearchX className="h-7 w-7" />}
          title={t('learn.subjects.emptyTitle')}
          body={t('learn.subjects.emptyBody')}
          action={
            <Button variant="outline" onClick={() => setFilter('all')}>
              {t('common.clearFilters')}
            </Button>
          }
        />
      ) : (
        <motion.ul layout className="grid gap-6 sm:grid-cols-2 xl:grid-cols-3">
          {visible.map((s, i) => (
            <motion.li
              key={s.id}
              layout
              initial={{ opacity: 0, y: 24 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: i * 0.06, ease: [0.22, 1, 0.36, 1] }}
            >
              <CourseCard subject={s} progress={progressOf(s)} locked={!!s.locked} />
            </motion.li>
          ))}
        </motion.ul>
      )}
    </>
  );
}
